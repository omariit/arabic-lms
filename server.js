/**
 * Production entrypoint: one Node process hosting:
 *   1. Next.js (App Router, standalone build output)
 *   2. Socket.io — two realtime rooms:
 *        • legacy classroom: YouTube video + audio-only WebRTC + hand queue
 *        • MEETING: fully in-house video meeting (mesh WebRTC), host moderation
 *          (mute mic / stop camera / grant speak / remove), hand raise, in-room
 *          chat with voice notes, public invite links for non-registered guests.
 *   3. Graceful shutdown handling for Railway deploys/restarts
 *
 * Same server, same port — zero external realtime providers, zero per-minute cost.
 */
const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { Server } = require("socket.io");
const { createHmac, timingSafeEqual, randomBytes } = require("crypto");
const { PrismaClient } = require("@prisma/client");

/**
 * Ownership rule for files shared in a live room — keep in sync with
 * `src/lib/live-files.ts` (which is unit tested). Inlined because this custom
 * server runs from the standalone build, where `src/` is not shipped.
 */
function liveFileKeyAllowed(key, { userId, liveSessionId }) {
  if (typeof key !== "string") return false;
  const parts = key.split("/");
  if (parts.length < 4 || parts[0] !== "livefile") return false;
  return parts[2] === liveSessionId || (Boolean(userId) && parts[2] === userId);
}

const port = parseInt(process.env.PORT || "3000", 10);
const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();
const db = new PrismaClient();

const AUTH_SECRET = process.env.AUTH_SECRET || "dev-insecure-secret-do-not-use-in-prod";
const MEETING_HARD_CAP = Number(process.env.MEETING_MAX_SEATS || 16);
const STAFF = new Set(["TEACHER", "ADMIN", "ASSISTANT"]);

/** Verify the HMAC session token (same format as src/lib/crypto.ts). */
function verifyToken(token) {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac("sha256", AUTH_SECRET).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const body = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof body.exp !== "number" || body.exp < Math.floor(Date.now() / 1000)) return null;
    return body;
  } catch {
    return null;
  }
}

function cookieValue(header, name) {
  if (!header) return null;
  const m = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

async function main() {
  await app.prepare();

  const server = createServer((req, res) => {
    const parsed = parse(req.url, true);
    handle(req, res, parsed);
  });

  const io = new Server(server, {
    cors: { origin: process.env.NEXT_PUBLIC_APP_URL || true, credentials: true },
    transports: ["websocket", "polling"],
    maxHttpBufferSize: 1e6,
  });

  // ---------------------------------------------------------------------------
  // Legacy classroom state (YouTube + audio room)
  // liveRooms: liveSessionId -> { teacherSocketId, granted:Set, handQueue:[] }
  // ---------------------------------------------------------------------------
  const liveRooms = new Map();

  // ---------------------------------------------------------------------------
  // Meeting state (in-house video meeting)
  // rooms: liveSessionId -> {
  //   hostSocketId, inviteToken, maxSeats,
  //   participants: Map<socketId, {socketId,name,role,handRaised,micAllowed,camAllowed,micOn,camOn,screenOn,joinedAt,userId?}>,
  //   waiting: Map<socketId, {name}>   // guests waiting for the host to admit
  // }
  // ---------------------------------------------------------------------------
  const rooms = new Map();

  /** Roster payload safe to broadcast (never leaks user ids of students). */
  function rosterOf(room) {
    return [...room.participants.values()].map((p) => ({
      socketId: p.socketId,
      name: p.name,
      role: p.role,
      isHost: p.socketId === room.hostSocketId,
      handRaised: p.handRaised,
      micAllowed: p.micAllowed,
      camAllowed: p.camAllowed,
      micOn: p.micOn,
      camOn: p.camOn,
      screenOn: p.screenOn,
      joinedAt: p.joinedAt,
    }));
  }

  function broadcastRoster(room, liveSessionId) {
    meet.to(liveSessionId).emit("meet:roster", {
      roster: rosterOf(room),
      waiting: [...room.waiting.values()].map((w) => ({ socketId: w.socketId, name: w.name })),
      count: room.participants.size,
      maxSeats: room.maxSeats,
    });
  }

  async function loadRoom(liveSessionId) {
    if (rooms.has(liveSessionId)) return rooms.get(liveSessionId);
    const live = await db.liveSession.findUnique({ where: { id: liveSessionId } });
    if (!live) return null;
    const room = {
      live,
      hostSocketId: null,
      inviteToken: live.inviteToken,
      maxSeats: Math.min(live.maxSeats || 12, MEETING_HARD_CAP),
      guestAllowed: live.guestAllowed,
      participants: new Map(),
      waiting: new Map(),
    };
    rooms.set(liveSessionId, room);
    return room;
  }

  // ===========================================================================
  // Namespace /meet — in-house video meeting
  // ===========================================================================
  const meet = io.of("/meet");

  meet.use(async (socket, nextAuth) => {
    try {
      const { liveSessionId, inviteToken, guestName } = socket.handshake.auth || {};
      if (!liveSessionId) return nextAuth(new Error("الحصة غير محددة"));

      const live = await db.liveSession.findUnique({ where: { id: liveSessionId } });
      if (!live) return nextAuth(new Error("الحصة غير موجودة"));
      if (live.status === "ENDED") return nextAuth(new Error("انتهت هذه الحصة"));

      const room = await loadRoom(liveSessionId);
      if (!room) return nextAuth(new Error("تعذّر فتح الغرفة"));

      // --- Registered participant (cookie session) ---
      const token = cookieValue(socket.handshake.headers.cookie, "lms_session");
      const session = token ? verifyToken(token) : null;
      if (session?.sid) {
        const s = await db.session.findUnique({ where: { id: session.sid } });
        if (s && s.active && s.expiresAt > new Date()) {
          const user = await db.user.findUnique({
            where: { id: s.userId },
            select: { id: true, fullName: true, role: true },
          });
          if (user) {
            if (!STAFF.has(user.role) && user.role !== "STUDENT") return nextAuth(new Error("غير مصرح"));
            if (user.role === "STUDENT") {
              const enrolled = await db.enrollment.findFirst({
                where: { userId: user.id, courseId: live.courseId, status: "ACTIVE" },
              });
              if (!enrolled) return nextAuth(new Error("يجب التسجيل في الدورة"));
            }
            socket.data.user = user;
            socket.data.guest = false;
            return nextAuth();
          }
        }
      }

      // --- Invited guest (public invite link) ---
      if (!room.guestAllowed) return nextAuth(new Error("الدخول للضيوف مغلق"));
      if (!inviteToken || inviteToken !== live.inviteToken) {
        return nextAuth(new Error("رابط الدعوة غير صالح — سجّلي الدخول أو اطلبي رابطًا جديدًا"));
      }
      const name = String(guestName || "").trim().slice(0, 40);
      if (!name) return nextAuth(new Error("الاسم مطلوب"));
      socket.data.guest = true;
      socket.data.guestName = name;
      socket.data.user = { id: null, fullName: name, role: "GUEST" };
      nextAuth();
    } catch (e) {
      nextAuth(new Error("فشل التحقق"));
    }
  });

  meet.on("connection", (socket) => {
    const user = socket.data.user;
    const isGuest = Boolean(socket.data.guest);
    let currentRoomId = null;

    socket.on("meet:join", async ({ liveSessionId, requireApproval }) => {
      const live = await db.liveSession.findUnique({ where: { id: liveSessionId } });
      if (!live || live.status === "ENDED") {
        socket.emit("meet:error", { message: "انتهت هذه الحصة" });
        return;
      }
      const room = await loadRoom(liveSessionId);
      if (!room) return socket.emit("meet:error", { message: "الغرفة غير متاحة" });

      socket.join(liveSessionId);
      currentRoomId = liveSessionId;

      const isHost = STAFF.has(user.role);
      const hostPresent = Boolean(room.hostSocketId && room.participants.has(room.hostSocketId));

      // Guests wait in the lobby until the host admits them (if the host is present).
      // Once admitted, the flag sticks so a re-join never bounces back to the lobby.
      if (isGuest && !socket.data.admitted && requireApproval !== false && hostPresent) {
        room.waiting.set(socket.id, { socketId: socket.id, name: user.fullName });
        socket.emit("meet:waiting", { message: "بانتظار موافقة المعلمة على دخولك…" });
        broadcastRoster(room, liveSessionId);
        if (room.hostSocketId) meet.to(room.hostSocketId).emit("meet:knock", { socketId: socket.id, name: user.fullName });
        return;
      }

      if (room.participants.size >= room.maxSeats) {
        socket.emit("meet:error", { message: `الغرفة ممتلئة (${room.maxSeats} مقعدًا)` });
        return;
      }

      room.participants.set(socket.id, {
        socketId: socket.id,
        userId: user.id || null,
        name: user.fullName,
        role: isGuest ? "GUEST" : user.role,
        handRaised: false,
        micAllowed: isHost, // students start muted; host can grant
        camAllowed: isHost,
        micOn: false,
        camOn: false,
        screenOn: false,
        joinedAt: Date.now(),
      });
      if (isHost && !room.hostSocketId) room.hostSocketId = socket.id;

      // Attendance log for enrolled students
      if (live.status === "LIVE" && !isGuest && user.role === "STUDENT") {
        await db.attendanceLog.create({ data: { liveSessionId, userId: user.id } }).catch(() => {});
      }

      // Existing peers offer to the newcomer.
      const peers = [...room.participants.keys()].filter((id) => id !== socket.id);
      socket.emit("meet:joined", {
        self: { socketId: socket.id, role: isGuest ? "GUEST" : user.role, name: user.fullName },
        isHost,
        peers,
        roster: rosterOf(room),
        maxSeats: room.maxSeats,
        inviteToken: isHost ? room.inviteToken : null,
        waiting: isHost ? [...room.waiting.values()] : [],
      });
      socket.to(liveSessionId).emit("meet:peer-joined", {
        socketId: socket.id,
        name: user.fullName,
        role: isGuest ? "GUEST" : user.role,
      });
      broadcastRoster(room, liveSessionId);
    });

    // --- WebRTC signaling relay (offer/answer/ice) ---
    socket.on("meet:signal", ({ target, data }) => {
      if (typeof target !== "string") return;
      meet.to(target).emit("meet:signal", { from: socket.id, data });
    });

    // --- Participant reports its own media state ---
    socket.on("meet:media", ({ liveSessionId, micOn, camOn, screenOn }) => {
      const room = rooms.get(liveSessionId);
      const p = room?.participants.get(socket.id);
      if (!room || !p) return;
      // A student may never turn on a mic/camera the host did not allow.
      if (typeof micOn === "boolean") p.micOn = p.micAllowed ? micOn : false;
      if (typeof camOn === "boolean") p.camOn = p.camAllowed ? camOn : false;
      if (typeof screenOn === "boolean") p.screenOn = screenOn;
      broadcastRoster(room, liveSessionId);
    });

    // --- Hand raise ---
    socket.on("meet:hand", ({ liveSessionId, raised }) => {
      const room = rooms.get(liveSessionId);
      const p = room?.participants.get(socket.id);
      if (!room || !p) return;
      p.handRaised = Boolean(raised);
      broadcastRoster(room, liveSessionId);
      if (raised && room.hostSocketId) {
        meet.to(room.hostSocketId).emit("meet:hand-raised", { socketId: socket.id, name: p.name });
      }
    });

    // --- HOST moderation ---
    socket.on("meet:control", ({ liveSessionId, action, target, value }) => {
      const room = rooms.get(liveSessionId);
      if (!room || room.hostSocketId !== socket.id) return; // host only
      const targetId = typeof target === "string" ? target : null;

      switch (action) {
        case "mute-mic": {
          const p = targetId && room.participants.get(targetId);
          if (!p) return;
          p.micAllowed = false;
          p.micOn = false;
          meet.to(targetId).emit("meet:forced", { mic: false, cam: p.camAllowed });
          break;
        }
        case "stop-cam": {
          const p = targetId && room.participants.get(targetId);
          if (!p) return;
          p.camAllowed = false;
          p.camOn = false;
          meet.to(targetId).emit("meet:forced", { mic: p.micAllowed, cam: false });
          break;
        }
        case "allow-mic": {
          const p = targetId && room.participants.get(targetId);
          if (!p) return;
          p.micAllowed = true;
          p.handRaised = false;
          meet.to(targetId).emit("meet:granted", { mic: true });
          break;
        }
        case "allow-cam": {
          const p = targetId && room.participants.get(targetId);
          if (!p) return;
          p.camAllowed = true;
          meet.to(targetId).emit("meet:granted", { cam: true });
          break;
        }
        case "grant-both": {
          const p = targetId && room.participants.get(targetId);
          if (!p) return;
          p.micAllowed = true;
          p.camAllowed = true;
          p.handRaised = false;
          meet.to(targetId).emit("meet:granted", { mic: true, cam: true });
          break;
        }
        case "kick": {
          const p = targetId && room.participants.get(targetId);
          if (!p) return;
          meet.to(targetId).emit("meet:kicked", { message: "تم إنهاء وجودك في الحصة من قِبل المعلمة" });
          const s = io.of("/meet").sockets.get(targetId);
          if (s) setTimeout(() => s.disconnect(true), 300);
          room.participants.delete(targetId);
          break;
        }
        case "admit": {
          const w = targetId && room.waiting.get(targetId);
          if (!w) return;
          room.waiting.delete(targetId);
          const guestSocket = meet.sockets.get(targetId);
          if (guestSocket) guestSocket.data.admitted = true;
          meet.to(targetId).emit("meet:admitted", { message: "تم قبول دخولك" });
          break;
        }
        case "deny": {
          if (!targetId || !room.waiting.has(targetId)) return;
          room.waiting.delete(targetId);
          meet.to(targetId).emit("meet:kicked", { message: "لم يتم قبول طلب الدخول" });
          const s = io.of("/meet").sockets.get(targetId);
          if (s) setTimeout(() => s.disconnect(true), 300);
          break;
        }
        case "mute-all": {
          for (const p of room.participants.values()) {
            if (p.socketId === room.hostSocketId) continue;
            p.micAllowed = false;
            p.micOn = false;
            meet.to(p.socketId).emit("meet:forced", { mic: false, cam: p.camAllowed });
          }
          break;
        }
        case "lock-room": {
          room.guestAllowed = false;
          db.liveSession.update({ where: { id: liveSessionId }, data: { guestAllowed: false } }).catch(() => {});
          break;
        }
        case "spotlight": {
          // value = socketId to spotlight (null clears)
          meet.to(liveSessionId).emit("meet:spotlight", { socketId: value || null });
          break;
        }
        case "end-meeting": {
          db.liveSession
            .update({ where: { id: liveSessionId }, data: { status: "ENDED", endedAt: new Date() } })
            .catch(() => {});
          meet.to(liveSessionId).emit("meet:ended", { message: "أنهت المعلمة الحصة" });
          break;
        }
        default:
          return;
      }
      broadcastRoster(room, liveSessionId);
    });

    // --- In-room chat (text + voice note) ---
    socket.on("meet:chat", async ({ liveSessionId, body, audioKey, audioMime, fileKey, fileMime, fileName }) => {
      const room = rooms.get(liveSessionId);
      const p = room?.participants.get(socket.id);
      if (!room || !p) return;
      const text = String(body || "").slice(0, 2000).trim();
      if (!text && !audioKey && !fileKey) return;
      // The key must belong to this room: a user's own namespace, or the session
      // namespace used by invited guests. Never trust a client-provided key.
      if (fileKey && !liveFileKeyAllowed(fileKey, { userId: isGuest ? null : user.id, liveSessionId })) {
        return socket.emit("meet:error", { message: "الملف غير مسموح في هذه الحصة" });
      }
      try {
        const saved = await db.liveMessage.create({
          data: {
            liveSessionId,
            authorName: p.name,
            authorRole: isGuest ? null : user.role,
            body: text,
            audioKey: audioKey || null,
            audioMime: audioMime || null,
            fileKey: fileKey || null,
            fileMime: fileMime || null,
            fileName: fileName ? String(fileName).slice(0, 160) : null,
          },
        });
        meet.to(liveSessionId).emit("meet:chat", {
          id: saved.id,
          socketId: socket.id,
          authorName: p.name,
          authorRole: isGuest ? "GUEST" : user.role,
          body: text,
          hasAudio: Boolean(audioKey),
          hasFile: Boolean(fileKey),
          fileName: fileName ? String(fileName).slice(0, 160) : null,
          fileMime: fileMime || null,
          createdAt: saved.createdAt,
        });
      } catch { /* chat persistence is best-effort */ }
    });

    socket.on("meet:leave", ({ liveSessionId }) => {
      leaveRoom(liveSessionId, socket.id, true);
    });

    socket.on("disconnect", () => {
      if (currentRoomId) leaveRoom(currentRoomId, socket.id, false);
    });
  });

  function leaveRoom(liveSessionId, socketId, explicit) {
    const room = rooms.get(liveSessionId);
    if (!room) return;
    const wasHost = room.hostSocketId === socketId;
    room.waiting.delete(socketId);
    room.participants.delete(socketId);

    meet.to(liveSessionId).emit("meet:peer-left", { socketId });
    if (wasHost) {
      // Host left: promote the next staff member, otherwise close the room politely.
      const nextHost = [...room.participants.values()].find((p) => STAFF.has(p.role));
      room.hostSocketId = nextHost ? nextHost.socketId : null;
      if (!nextHost) meet.to(liveSessionId).emit("meet:host-left", { message: "خرجت المعلمة من الحصة" });
      else meet.to(nextHost.socketId).emit("meet:you-are-host", {});
    }
    broadcastRoster(room, liveSessionId);

    const socketsInRoom = io.of("/meet").adapter.rooms.get(liveSessionId);
    if (!socketsInRoom || socketsInRoom.size === 0) rooms.delete(liveSessionId);
    if (explicit) socketLeave(socketId);
  }

  function socketLeave(socketId) {
    const s = io.of("/meet").sockets.get(socketId);
    if (s) {
      for (const r of s.rooms) if (r !== socketId) s.leave(r);
    }
  }

  // ===========================================================================
  // Legacy classroom (YouTube + audio-only mesh) — unchanged behaviour
  // ===========================================================================
  io.use(async (socket, nextAuth) => {
    try {
      const token = socket.handshake.auth?.token || cookieValue(socket.handshake.headers.cookie, "lms_session");
      const body = verifyToken(token && token.startsWith("lms_session=") ? token.slice("lms_session=".length) : token);
      if (!body?.sid) return nextAuth(new Error("غير مصرح"));
      const session = await db.session.findUnique({ where: { id: body.sid } });
      if (!session || !session.active || session.expiresAt < new Date()) {
        return nextAuth(new Error("الجلسة منتهية"));
      }
      const user = await db.user.findUnique({
        where: { id: session.userId },
        select: { id: true, fullName: true, role: true },
      });
      if (!user) return nextAuth(new Error("المستخدم غير موجود"));
      socket.data.user = user;
      nextAuth();
    } catch (e) {
      nextAuth(new Error("فشل التحقق"));
    }
  });

  io.on("connection", (socket) => {
    const user = socket.data.user;

    socket.on("join-room", async ({ liveSessionId }) => {
      if (!liveSessionId) return;
      const live = await db.liveSession.findUnique({
        where: { id: liveSessionId },
        include: { course: true },
      });
      if (!live || live.status !== "LIVE") {
        socket.emit("room-error", { message: "الحصة المباشرة غير منعقدة حاليًا" });
        return;
      }
      if (!STAFF.has(user.role)) {
        const enrollment = await db.enrollment.findFirst({
          where: { userId: user.id, courseId: live.courseId, status: "ACTIVE" },
        });
        if (!enrollment) {
          socket.emit("room-error", { message: "يجب التسجيل في الدورة" });
          return;
        }
        await db.attendanceLog.create({ data: { liveSessionId, userId: user.id } }).catch(() => {});
      }

      socket.join(liveSessionId);
      let room = liveRooms.get(liveSessionId);
      if (!room) {
        room = { teacherSocketId: null, granted: new Set(), handQueue: [] };
        liveRooms.set(liveSessionId, room);
      }
      if (STAFF.has(user.role)) {
        room.teacherSocketId = socket.id;
        socket.emit("room-state", {
          handQueue: room.handQueue,
          granted: [...room.granted],
          participants: [...(io.sockets.adapter.rooms.get(liveSessionId) ?? [])].length,
        });
      } else {
        io.to(liveSessionId).emit("participant-joined", { socketId: socket.id, userId: user.id, name: user.fullName });
        socket.emit("peer-list", { peers: room.teacherSocketId ? [room.teacherSocketId, ...room.granted] : [...room.granted] });
      }
    });

    socket.on("signal", ({ target, data }) => {
      if (typeof target === "string") io.to(target).emit("signal", { from: socket.id, data });
    });

    socket.on("raise-hand", ({ liveSessionId }) => {
      const room = liveRooms.get(liveSessionId);
      if (!room || STAFF.has(user.role)) return;
      if (room.handQueue.some((h) => h.socketId === socket.id)) return;
      const entry = { socketId: socket.id, name: user.fullName };
      room.handQueue.push(entry);
      io.to(liveSessionId).emit("hand-queue", { handQueue: room.handQueue });
      if (room.teacherSocketId) io.to(room.teacherSocketId).emit("hand-raised", entry);
    });

    socket.on("lower-hand", ({ liveSessionId }) => {
      const room = liveRooms.get(liveSessionId);
      if (!room) return;
      room.handQueue = room.handQueue.filter((h) => h.socketId !== socket.id);
      io.to(liveSessionId).emit("hand-queue", { handQueue: room.handQueue });
    });

    socket.on("grant-mic", ({ liveSessionId, targetSocketId, grant }) => {
      const room = liveRooms.get(liveSessionId);
      if (!room || room.teacherSocketId !== socket.id) return;
      if (grant) {
        room.granted.add(targetSocketId);
        room.handQueue = room.handQueue.filter((h) => h.socketId !== targetSocketId);
      } else {
        room.granted.delete(targetSocketId);
      }
      io.to(liveSessionId).emit("mic-state", {
        granted: [...room.granted],
        handQueue: room.handQueue,
        changed: targetSocketId,
        isGranted: grant,
      });
      io.to(targetSocketId).emit("your-mic", { granted: grant });
    });

    socket.on("disconnect", () => {
      for (const [liveSessionId, room] of liveRooms) {
        let changed = false;
        if (room.teacherSocketId === socket.id) {
          room.teacherSocketId = null;
          room.granted.clear();
          changed = true;
        }
        const before = room.handQueue.length;
        room.handQueue = room.handQueue.filter((h) => h.socketId !== socket.id);
        if (room.granted.delete(socket.id)) changed = true;
        if (before !== room.handQueue.length) changed = true;
        if (changed) {
          io.to(liveSessionId).emit("mic-state", {
            granted: [...room.granted],
            handQueue: room.handQueue,
            changed: socket.id,
            isGranted: false,
          });
        }
        io.to(liveSessionId).emit("participant-left", { socketId: socket.id });
        if (!io.sockets.adapter.rooms.get(liveSessionId)?.size) liveRooms.delete(liveSessionId);
      }
    });
  });

  // --- Graceful shutdown (Railway sends SIGTERM on deploys) ---
  const shutdown = async (signal) => {
    console.log(`\n${signal} received — shutting down gracefully…`);
    io.disconnectSockets(true);
    meet.disconnectSockets(true);
    server.close();
    await db.$disconnect().catch(() => {});
    process.exit(0);
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("unhandledRejection", (err) => console.error("unhandledRejection:", err));

  server.listen(port, () => {
    console.log(`> LMS ready on http://localhost:${port} (Next.js + Socket.io: classroom + meeting)`);
  });
}

main().catch((e) => {
  console.error("Fatal startup error:", e);
  process.exit(1);
});
