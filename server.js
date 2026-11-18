/**
 * Production entrypoint: one Node process hosting:
 *   1. Next.js (App Router, standalone build output)
 *   2. Socket.io — WebRTC audio-only signaling + live classroom events
 *   3. Graceful shutdown handling for Railway deploys/restarts
 *
 * Same server, same port — zero external realtime providers.
 */
const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { Server } = require("socket.io");
const { createHmac, timingSafeEqual } = require("crypto");
const { PrismaClient } = require("@prisma/client");

const port = parseInt(process.env.PORT || "3000", 10);
const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();
const db = new PrismaClient();

const AUTH_SECRET = process.env.AUTH_SECRET || "dev-insecure-secret-do-not-use-in-prod";

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

async function main() {
  await app.prepare();

  const server = createServer((req, res) => {
    const parsed = parse(req.url, true);
    handle(req, res, parsed);
  });

  const io = new Server(server, {
    cors: { origin: process.env.NEXT_PUBLIC_APP_URL || true, credentials: true },
    transports: ["websocket", "polling"],
  });

  // liveRooms: liveSessionId -> { teacherSocketId, granted: Set<socketId>, handQueue: [{socketId,name}] }
  const liveRooms = new Map();

  io.use(async (socket, nextAuth) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.headers.cookie?.match(/lms_session=([^;]+)/)?.[1];
      const body = verifyToken(token && token.startsWith("lms_session=") ? token : token);
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
      if (user.role !== "ADMIN") {
        const enrollment = await db.enrollment.findFirst({
          where: { userId: user.id, courseId: live.courseId, status: "ACTIVE" },
        });
        if (!enrollment) {
          socket.emit("room-error", { message: "يجب التسجيل في الدورة" });
          return;
        }
        // Automatic attendance logging on join (deduped by (session,user) per join event).
        await db.attendanceLog.create({
          data: { liveSessionId, userId: user.id },
        }).catch(() => {});
      }

      socket.join(liveSessionId);
      let room = liveRooms.get(liveSessionId);
      if (!room) {
        room = { teacherSocketId: null, granted: new Set(), handQueue: [] };
        liveRooms.set(liveSessionId, room);
      }
      if (user.role === "ADMIN") {
        room.teacherSocketId = socket.id;
        // Tell the teacher who is already in the room (hand queue state persists).
        socket.emit("room-state", {
          handQueue: room.handQueue,
          granted: [...room.granted],
          participants: [...(io.sockets.adapter.rooms.get(liveSessionId) ?? [])].length,
        });
      } else {
        io.to(liveSessionId).emit("participant-joined", {
          socketId: socket.id,
          userId: user.id,
          name: user.fullName,
        });
        if (room.teacherSocketId) {
          // New student signals to the existing peers.
          socket.emit("peer-list", { peers: [room.teacherSocketId, ...room.granted] });
        } else {
          socket.emit("peer-list", { peers: [...room.granted] });
        }
      }
    });

    // --- WebRTC audio-only signaling relay ---
    socket.on("signal", ({ target, data }) => {
      io.to(target).emit("signal", { from: socket.id, data });
    });

    // --- Raise hand queue ---
    socket.on("raise-hand", ({ liveSessionId }) => {
      const room = liveRooms.get(liveSessionId);
      if (!room || user.role === "ADMIN") return;
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

    // Teacher grants/revokes the single active microphone.
    socket.on("grant-mic", ({ liveSessionId, targetSocketId, grant }) => {
      const room = liveRooms.get(liveSessionId);
      if (!room || room.teacherSocketId !== socket.id) return; // teacher only
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
          room.granted.clear(); // teacher leaving mutes everyone for echo-safety
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
    server.close();
    await db.$disconnect().catch(() => {});
    process.exit(0);
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("unhandledRejection", (err) => console.error("unhandledRejection:", err));

  server.listen(port, () => {
    console.log(`> LMS ready on http://localhost:${port} (Next.js + Socket.io)`);
  });
}

main().catch((e) => {
  console.error("Fatal startup error:", e);
  process.exit(1);
});
