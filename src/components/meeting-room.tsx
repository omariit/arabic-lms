"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { Button } from "@/components/ui/button";
import { uploadToR2 } from "@/lib/upload-client";
import { useAudioRecorder } from "@/hooks/use-audio-recorder";

/**
 * In-house video meeting (no external service).
 *
 * Media: WebRTC mesh between participants, signaling over our own Socket.io,
 * three fixed transceivers per peer (audio · camera · screen) so toggling a
 * device never needs renegotiation.
 *
 * Moderation (host): mute mic, stop camera, grant speak/camera, admit or deny
 * guests from the lobby, mute everyone, lock the room, spotlight, remove, end.
 */

type Role = "ADMIN" | "TEACHER" | "ASSISTANT" | "STUDENT" | "GUEST";

type Participant = {
  socketId: string;
  name: string;
  role: Role;
  isHost: boolean;
  handRaised: boolean;
  micAllowed: boolean;
  camAllowed: boolean;
  micOn: boolean;
  camOn: boolean;
  screenOn: boolean;
  joinedAt: number;
};

type ChatItem = {
  id: string; socketId?: string; authorName: string; authorRole: string | null;
  body: string; createdAt: string;
  hasAudio?: boolean; audioUrl?: string | null;
  hasFile?: boolean; fileName?: string | null; fileMime?: string | null; fileUrl?: string | null;
};

type Streams = { cam?: MediaStream; screen?: MediaStream; audio?: MediaStream };

const ICE: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    // Optional TURN relay for restrictive networks (set in Railway env).
    ...(process.env.NEXT_PUBLIC_TURN_URL
      ? [{
          urls: process.env.NEXT_PUBLIC_TURN_URL,
          username: process.env.NEXT_PUBLIC_TURN_USER ?? "",
          credential: process.env.NEXT_PUBLIC_TURN_PASS ?? "",
        }]
      : []),
  ],
};

export function MeetingRoom({
  liveId, title, courseTitle, viewer, inviteToken, initialChat, onLeave,
}: {
  liveId: string;
  title: string;
  courseTitle: string;
  viewer: { role: Role; name: string; isGuest: boolean };
  inviteToken?: string;
  initialChat: ChatItem[];
  onLeave?: () => void;
}) {
  const isHostRole = viewer.role !== "STUDENT" && viewer.role !== "GUEST";
  const [status, setStatus] = useState<"connecting" | "waiting" | "in" | "kicked" | "ended" | "error">("connecting");
  const [error, setError] = useState("");
  const [roster, setRoster] = useState<Participant[]>([]);
  const [waitingList, setWaitingList] = useState<Array<{ socketId: string; name: string }>>([]);
  const [isHost, setIsHost] = useState(isHostRole);
  const [selfId, setSelfId] = useState<string | null>(null);
  const [micOn, setMicOn] = useState(false);
  const [camOn, setCamOn] = useState(false);
  const [screenOn, setScreenOn] = useState(false);
  const [handRaised, setHandRaised] = useState(false);
  const [micAllowed, setMicAllowed] = useState(isHostRole);
  const [camAllowed, setCamAllowed] = useState(isHostRole);
  const [chatOpen, setChatOpen] = useState(false);
  const [chat, setChat] = useState<ChatItem[]>(initialChat);
  const [draft, setDraft] = useState("");
  const [toast, setToast] = useState("");
  const [spotlight, setSpotlight] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState("");
  const [remoteStreams, setRemoteStreams] = useState<Record<string, Streams>>({});
  const [localPreview, setLocalPreview] = useState<MediaStream | null>(null);
  const [meetingEnded, setMeetingEnded] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const pcs = useRef<Map<string, RTCPeerConnection>>(new Map());
  const senders = useRef<Map<string, { audio: RTCRtpSender | null; cam: RTCRtpSender | null; screen: RTCRtpSender | null }>>(new Map());
  const local = useRef<{ mic: MediaStream | null; cam: MediaStream | null; screen: MediaStream | null }>({ mic: null, cam: null, screen: null });
  const chatBottom = useRef<HTMLDivElement>(null);
  const ringtoneRef = useRef<AudioContext | null>(null);
  const rec = useAudioRecorder(120);
  const [file, setFile] = useState<{ key: string; mime: string; name: string } | null>(null);
  const [fileBusy, setFileBusy] = useState(false);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((t) => (t === msg ? "" : t)), 3200);
  }, []);

  /** Push the current local tracks into every peer connection. */
  const applyTracks = useCallback(() => {
    for (const [peerId, pc] of pcs.current) {
      const s = senders.current.get(peerId);
      if (!s) continue;
      const micTrack = local.current.mic?.getAudioTracks()[0] ?? null;
      const camTrack = local.current.cam?.getVideoTracks()[0] ?? null;
      const screenTrack = local.current.screen?.getVideoTracks()[0] ?? null;
      s.audio?.replaceTrack(micOn ? micTrack : null).catch(() => {});
      s.cam?.replaceTrack(camOn ? camTrack : null).catch(() => {});
      s.screen?.replaceTrack(screenOn ? screenTrack : null).catch(() => {});
      void pc;
    }
  }, [micOn, camOn, screenOn]);

  const emitMedia = useCallback((next?: { micOn?: boolean; camOn?: boolean; screenOn?: boolean }) => {
    socketRef.current?.emit("meet:media", {
      liveSessionId: liveId,
      micOn: next?.micOn ?? micOn,
      camOn: next?.camOn ?? camOn,
      screenOn: next?.screenOn ?? screenOn,
    });
  }, [liveId, micOn, camOn, screenOn]);

  /** One peer connection per participant; newcomer is always the offerer. */
  const ensurePeer = useCallback((peerId: string, initiator: boolean) => {
    const existing = pcs.current.get(peerId);
    if (existing) return existing;

    const pc = new RTCPeerConnection(ICE);
    pcs.current.set(peerId, pc);

    if (initiator) {
      // Fixed order → mid 0 audio, 1 camera, 2 screen on both sides.
      pc.addTransceiver("audio", { direction: "sendrecv" });
      pc.addTransceiver("video", { direction: "sendrecv" });
      pc.addTransceiver("video", { direction: "sendrecv" });
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) socketRef.current?.emit("meet:signal", { target: peerId, data: { candidate: e.candidate } });
    };

    pc.ontrack = (e) => {
      const idx = pc.getTransceivers().findIndex((t) => t.mid === e.transceiver.mid);
      const purpose = idx <= 0 ? "audio" : idx === 1 ? "cam" : "screen";
      const stream = e.streams[0] ?? new MediaStream([e.track]);
      setRemoteStreams((prev) => {
        const current = prev[peerId] ?? {};
        return { ...prev, [peerId]: { ...current, [purpose]: stream } };
      });
      // Autoplay audio (browsers require a user gesture; the join click covers it).
      if (purpose === "audio") {
        const el = new Audio();
        el.srcObject = stream;
        el.autoplay = true;
        el.play().catch(() => {});
      }
    };

    pc.onconnectionstatechange = () => {
      if (["failed", "closed"].includes(pc.connectionState)) {
        pcs.current.delete(peerId);
        senders.current.delete(peerId);
        setRemoteStreams((prev) => {
          const n = { ...prev };
          delete n[peerId];
          return n;
        });
      }
    };

    if (initiator) {
      senders.current.set(peerId, {
        audio: pc.getSenders()[0] ?? null,
        cam: pc.getSenders()[1] ?? null,
        screen: pc.getSenders()[2] ?? null,
      });
      void (async () => {
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socketRef.current?.emit("meet:signal", { target: peerId, data: { sdp: offer } });
        } catch { /* ignore */ }
      })();
    }
    return pc;
  }, []);

  const teardownPeer = useCallback((peerId: string) => {
    pcs.current.get(peerId)?.close();
    pcs.current.delete(peerId);
    senders.current.delete(peerId);
    setRemoteStreams((prev) => {
      const n = { ...prev };
      delete n[peerId];
      return n;
    });
  }, []);

  // --- socket lifecycle ---
  useEffect(() => {
    const socket = io("/meet", {
      path: "/socket.io",
      auth: { liveSessionId: liveId, inviteToken: inviteToken ?? "", guestName: viewer.isGuest ? viewer.name : "" },
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setSelfId(socket.id ?? null);
      socket.emit("meet:join", { liveSessionId: liveId });
    });
    socket.on("connect_error", (err) => {
      setStatus("error");
      setError(err.message || "تعذّر الاتصال بالغرفة");
    });
    socket.on("meet:error", ({ message }: { message: string }) => {
      setStatus("error");
      setError(message);
    });
    socket.on("meet:waiting", ({ message }: { message: string }) => {
      setStatus("waiting");
      setError(message);
    });
    socket.on("meet:admitted", () => {
      flash("تم قبول دخولك — جارٍ الاتصال");
      socket.emit("meet:join", { liveSessionId: liveId });
    });
    socket.on("meet:joined", (p: {
      self: { socketId: string; role: Role }; isHost: boolean; peers: string[]; roster: Participant[];
      maxSeats: number; inviteToken: string | null; waiting: Array<{ socketId: string; name: string }>;
    }) => {
      setStatus("in");
      setIsHost(p.isHost);
      setSelfId(p.self.socketId);
      setRoster(p.roster ?? []);
      setWaitingList(p.waiting ?? []);
      if (p.inviteToken) {
        setInviteUrl(`${window.location.origin}/live/${liveId}?invite=${p.inviteToken}`);
      }
      const me = p.roster.find((r) => r.socketId === p.self.socketId);
      if (me) {
        setMicAllowed(me.micAllowed);
        setCamAllowed(me.camAllowed);
      }
      // Offer to everyone already in the room.
      p.peers.forEach((peer) => ensurePeer(peer, true));
    });
    socket.on("meet:peer-joined", () => { /* the newcomer will offer; nothing to do */ });
    socket.on("meet:peer-left", ({ socketId }: { socketId: string }) => {
      teardownPeer(socketId);
      setChat((c) => c);
    });
    socket.on("meet:signal", async ({ from, data }: { from: string; data: { sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit } }) => {
      let pc = pcs.current.get(from);
      if (!pc) pc = ensurePeer(from, false);
      try {
        if (data.sdp) {
          await pc.setRemoteDescription(data.sdp);
          if (data.sdp.type === "offer") {
            // Answerer learns its sender slots from the offered m-lines.
            const order = pc.getTransceivers();
            senders.current.set(from, {
              audio: pc.getSenders()[order.findIndex((t) => t.mid !== null && order.indexOf(t) === 0)] ?? pc.getSenders()[0] ?? null,
              cam: pc.getSenders()[1] ?? null,
              screen: pc.getSenders()[2] ?? null,
            });
            applyTracks();
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socketRef.current?.emit("meet:signal", { target: from, data: { sdp: answer } });
          }
        } else if (data.candidate) {
          await pc.addIceCandidate(data.candidate).catch(() => {});
        }
      } catch { /* ignore transients */ }
    });
    socket.on("meet:roster", (p: { roster: Participant[]; waiting: Array<{ socketId: string; name: string }> }) => {
      setRoster(p.roster ?? []);
      setWaitingList(p.waiting ?? []);
      const me = (p.roster ?? []).find((r) => r.socketId === socket.id);
      if (me) {
        setMicAllowed(me.micAllowed);
        setCamAllowed(me.camAllowed);
      }
    });
    socket.on("meet:granted", ({ mic, cam }: { mic?: boolean; cam?: boolean }) => {
      if (mic) {
        setMicAllowed(true);
        flash("يمكنك التحدث الآن 🎙");
      }
      if (cam) {
        setCamAllowed(true);
        flash("يمكنك تشغيل الكاميرا الآن 📷");
      }
    });
    socket.on("meet:forced", ({ mic, cam }: { mic: boolean; cam: boolean }) => {
      if (!mic) {
        local.current.mic?.getTracks().forEach((t) => t.stop());
        local.current.mic = null;
        setMicOn(false);
        setMicAllowed(false);
        setLocalPreview(local.current.cam);
        flash("أوقفت المعلمة الميكروفون");
      }
      if (!cam) {
        local.current.cam?.getTracks().forEach((t) => t.stop());
        local.current.cam = null;
        setCamOn(false);
        setCamAllowed(false);
        setLocalPreview(local.current.cam);
        flash("أوقفت المعلمة الكاميرا");
      }
      setTimeout(() => applyTracks(), 0);
    });
    socket.on("meet:kicked", ({ message }: { message: string }) => {
      setStatus("kicked");
      setError(message);
      socket.disconnect();
    });
    socket.on("meet:ended", ({ message }: { message: string }) => {
      setMeetingEnded(true);
      setError(message);
      socket.disconnect();
    });
    socket.on("meet:host-left", ({ message }: { message: string }) => flash(message));
    socket.on("meet:you-are-host", () => {
      setIsHost(true);
      flash("أنت الآن مديرة الغرفة");
    });
    socket.on("meet:hand-raised", ({ name }: { name: string }) => flash(`✋ ${name} تطلب التحدث`));
    socket.on("meet:knock", ({ name }: { name: string }) => flash(`🚪 ${name} تطلب الدخول`));
    socket.on("meet:spotlight", ({ socketId }: { socketId: string | null }) => setSpotlight(socketId));
    socket.on("meet:chat", (m: ChatItem) => setChat((c) => [...c, m]));

    return () => {
      socket.emit("meet:leave", { liveSessionId: liveId });
      socket.disconnect();
      pcs.current.forEach((pc) => pc.close());
      pcs.current.clear();
      senders.current.clear();
      Object.values(local.current).forEach((s) => s?.getTracks().forEach((t) => t.stop()));
      local.current = { mic: null, cam: null, screen: null };
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveId]);

  // Seed history (server presigns voice notes for authorised participants).
  useEffect(() => {
    const q = inviteToken ? `?invite=${encodeURIComponent(inviteToken)}` : "";
    fetch(`/api/live/${liveId}/info${q}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j?.chat?.length) {
          setChat(j.chat.map((m: ChatItem) => ({ ...m, socketId: undefined })));
        }
      })
      .catch(() => {});
  }, [liveId, inviteToken]);

  useEffect(() => { applyTracks(); }, [micOn, camOn, screenOn, applyTracks]);
  useEffect(() => { chatBottom.current?.scrollIntoView({ behavior: "smooth" }); }, [chat.length, chatOpen]);

  // Keep Railway from scaling to zero while a class is running.
  useEffect(() => {
    if (status !== "in") return;
    const t = setInterval(() => fetch("/api/health", { cache: "no-store" }).catch(() => {}), 25_000);
    return () => clearInterval(t);
  }, [status]);

  /** Get (or reuse) a local device stream. */
  const getLocal = useCallback(async (kind: "mic" | "cam"): Promise<MediaStream | null> => {
    if (local.current[kind]) return local.current[kind];
    try {
      const stream = await navigator.mediaDevices.getUserMedia(
        kind === "mic"
          ? { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }
          : { video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" } },
      );
      local.current[kind] = stream;
      return stream;
    } catch {
      flash(kind === "mic" ? "لم يُسمح باستخدام الميكروفون" : "لم يُسمح باستخدام الكاميرا");
      return null;
    }
  }, [flash]);

  const toggleMic = useCallback(async () => {
    if (micOn) {
      local.current.mic?.getAudioTracks().forEach((t) => t.stop());
      local.current.mic = null;
      setMicOn(false);
      emitMedia({ micOn: false });
      setTimeout(() => applyTracks(), 0);
      return;
    }
    if (!micAllowed && !isHost) {
      flash("الميكروفون مغلق — ارفعي يدك وانتظري موافقة المعلمة");
      return;
    }
    const s = await getLocal("mic");
    if (!s) return;
    setMicOn(true);
    emitMedia({ micOn: true });
    setTimeout(() => applyTracks(), 0);
  }, [micOn, micAllowed, isHost, getLocal, emitMedia, applyTracks, flash]);

  const toggleCam = useCallback(async () => {
    if (camOn) {
      local.current.cam?.getVideoTracks().forEach((t) => t.stop());
      local.current.cam = null;
      setCamOn(false);
      setLocalPreview(local.current.screen);
      emitMedia({ camOn: false });
      setTimeout(() => applyTracks(), 0);
      return;
    }
    if (!camAllowed && !isHost) {
      flash("الكاميرا مغلقة — اطلبي من المعلمة السماح");
      return;
    }
    const s = await getLocal("cam");
    if (!s) return;
    setCamOn(true);
    setLocalPreview(s);
    emitMedia({ camOn: true });
    setTimeout(() => applyTracks(), 0);
  }, [camOn, camAllowed, isHost, getLocal, emitMedia, applyTracks, flash]);

  const toggleScreen = useCallback(async () => {
    if (screenOn) {
      local.current.screen?.getTracks().forEach((t) => t.stop());
      local.current.screen = null;
      setScreenOn(false);
      setLocalPreview(local.current.cam);
      emitMedia({ screenOn: false });
      setTimeout(() => applyTracks(), 0);
      return;
    }
    if (viewer.isGuest) { flash("مشاركة الشاشة للمسجّلات فقط"); return; }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      local.current.screen = stream;
      stream.getVideoTracks()[0].onended = () => {
        local.current.screen = null;
        setScreenOn(false);
        emitMedia({ screenOn: false });
        setTimeout(() => applyTracks(), 0);
      };
      setScreenOn(true);
      setLocalPreview(stream);
      emitMedia({ screenOn: true });
      setTimeout(() => applyTracks(), 0);
    } catch { /* user cancelled */ }
  }, [screenOn, viewer.isGuest, emitMedia, applyTracks, flash]);

  const toggleHand = useCallback(() => {
    const next = !handRaised;
    setHandRaised(next);
    socketRef.current?.emit("meet:hand", { liveSessionId: liveId, raised: next });
    if (next) flash("رفعتِ يدك — ستنتبه المعلمة ✋");
  }, [handRaised, liveId, flash]);

  const control = useCallback((action: string, target?: string, value?: string) => {
    socketRef.current?.emit("meet:control", { liveSessionId: liveId, action, target, value });
  }, [liveId]);

  const sendChat = async () => {
    const text = draft.trim();
    if (!text && !rec.blob && !file) return;
    let audioKey: string | undefined;
    let audioMime: string | undefined;
    if (rec.blob && !viewer.isGuest) {
      try {
        const up = await uploadToR2(rec.blob, {
          kind: viewer.role === "STUDENT" ? "submission" : "feedback",
          mimeType: rec.mimeType,
        });
        audioKey = up.key;
        audioMime = up.mimeType;
      } catch (e) {
        flash(e instanceof Error ? e.message : "تعذّر رفع التسجيل");
        return;
      }
    }
    socketRef.current?.emit("meet:chat", {
      liveSessionId: liveId,
      body: text,
      audioKey,
      audioMime,
      fileKey: file?.key,
      fileMime: file?.mime,
      fileName: file?.name,
    });
    setDraft("");
    rec.reset();
    setFile(null);
  };

  const pickFile = async (input: HTMLInputElement) => {
    const chosen = input.files?.[0];
    input.value = "";
    if (!chosen) return;
    if (viewer.isGuest) {
      flash("مشاركة الملفات متاحة للمسجّلات فقط");
      return;
    }
    setFileBusy(true);
    try {
      const up = await uploadToR2(chosen, { kind: "livefile", mimeType: chosen.type });
      setFile({ key: up.key, mime: up.mimeType, name: chosen.name });
    } catch (e) {
      flash(e instanceof Error ? e.message : "تعذّر رفع الملف");
    } finally {
      setFileBusy(false);
    }
  };

  const leave = () => {
    socketRef.current?.emit("meet:leave", { liveSessionId: liveId });
    if (onLeave) onLeave();
    else window.location.href = viewer.isGuest ? "/" : "/dashboard";
  };

  const guestCount = roster.filter((r) => r.role === "GUEST").length;
  const raised = roster.filter((r) => r.handRaised);
  const spotlighted = spotlight ? roster.find((r) => r.socketId === spotlight) : null;
  const gridParticipants = useMemo(
    () => roster.filter((r) => r.socketId !== spotlight),
    [roster, spotlight],
  );

  if (status === "waiting") {
    return (
      <div className="rounded-3xl border border-amber-200 bg-amber-50 p-8 text-center">
        <p className="text-lg font-extrabold text-amber-900">⏳ بانتظار موافقة المعلمة</p>
        <p className="mt-2 text-sm text-amber-800">{error}</p>
        <p className="mt-4 text-xs text-amber-700/70">لا تغلقي الصفحة — ستُدخلين تلقائيًا فور الموافقة.</p>
      </div>
    );
  }

  if (status === "kicked" || status === "ended" || meetingEnded) {
    return (
      <div className="rounded-3xl border border-brand-200 bg-white p-8 text-center">
        <p className="text-lg font-extrabold text-brand-900">انتهت مشاركتك في الحصة</p>
        <p className="mt-2 text-sm text-gray-500">{error}</p>
        <Button className="mt-4" onClick={leave}>عودة</Button>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="rounded-3xl border border-red-200 bg-red-50 p-8 text-center">
        <p className="text-lg font-extrabold text-red-700">تعذّر الدخول</p>
        <p className="mt-2 text-sm text-red-600">{error}</p>
        <Button className="mt-4" variant="outline" onClick={leave}>عودة</Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-brand-100 bg-white p-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-extrabold text-brand-950">🔴 {title}</p>
          <p className="text-[11px] text-brand-900/50">
            {courseTitle} · {roster.length} مشاركة {guestCount > 0 ? `· ${guestCount} ضيفة` : ""}
            {raised.length > 0 ? ` · ✋ ${raised.length}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="outline" onClick={() => setShowParticipants((v) => !v)}>
            👥 {roster.length}
          </Button>
          <Button size="sm" variant={chatOpen ? "default" : "outline"} onClick={() => setChatOpen((v) => !v)}>
            💬 {chat.some((c) => c.socketId !== selfId) ? "الدردشة" : "الدردشة"}
          </Button>
          <Button size="sm" variant="destructive" onClick={leave}>خروج</Button>
        </div>
      </div>

      {toast && <div className="rounded-xl bg-brand-700 px-3 py-2 text-center text-xs font-bold text-white">{toast}</div>}

      {/* stage */}
      <div className={`grid gap-2 ${spotlight ? "grid-cols-1" : "grid-cols-2 sm:grid-cols-3"}`}>
        {spotlighted && (
          <VideoTile
            participant={spotlighted}
            stream={remoteStreams[spotlighted.socketId]?.screen ?? remoteStreams[spotlighted.socketId]?.cam}
            isSelf={spotlighted.socketId === selfId}
            localStream={spotlighted.socketId === selfId ? localPreview : null}
            big
          />
        )}
        {gridParticipants.map((p) => (
          <VideoTile
            key={p.socketId}
            participant={p}
            stream={remoteStreams[p.socketId]?.screen ?? remoteStreams[p.socketId]?.cam}
            localStream={p.socketId === selfId ? localPreview : null}
            isSelf={p.socketId === selfId}
          />
        ))}
      </div>

      {/* controls */}
      <div className="flex flex-wrap items-center justify-center gap-2 rounded-2xl border border-brand-100 bg-white p-3">
        <Button variant={micOn ? "default" : "outline"} onClick={toggleMic} className="min-w-[110px]">
          {micOn ? "🎙 المايك شغال" : "🔇 المايك مغلق"}
        </Button>
        <Button variant={camOn ? "default" : "outline"} onClick={toggleCam} className="min-w-[110px]">
          {camOn ? "📷 الكاميرا شغالة" : "📷 الكاميرا مغلقة"}
        </Button>
        {!viewer.isGuest && (
          <Button variant={screenOn ? "default" : "outline"} onClick={toggleScreen}>🖥 مشاركة الشاشة</Button>
        )}
        {!isHost && (
          <Button variant={handRaised ? "success" : "outline"} onClick={toggleHand}>
            ✋ {handRaised ? "أنزلي يدك" : "ارفعي يدك"}
          </Button>
        )}
        {isHost && (
          <>
            <Button variant="outline" onClick={() => control("mute-all")}>🔇 إسكات الجميع</Button>
            <Button variant="outline" onClick={() => control("lock-room")}>🔒 قفل الغرفة</Button>
            <Button variant="destructive" onClick={() => { if (confirm("إنهاء الحصة لكل المشاركات؟")) control("end-meeting"); }}>
              ⏹ إنهاء الحصة
            </Button>
          </>
        )}
      </div>

      {isHost && inviteUrl && (
        <div className="rounded-2xl border border-brand-100 bg-brand-50/60 p-3">
          <p className="text-xs font-extrabold text-brand-900">🔗 دعوة عامة لغير المسجّلات</p>
          <div className="mt-1.5 flex gap-2">
            <input readOnly value={inviteUrl} dir="ltr" className="min-w-0 flex-1 rounded-xl border border-brand-200 bg-white px-2 py-1.5 text-[11px]" />
            <Button size="sm" onClick={() => { navigator.clipboard.writeText(inviteUrl); flash("تم نسخ رابط الدعوة ✓"); }}>نسخ</Button>
            <a href={`https://wa.me/?text=${encodeURIComponent(`دعوة لحضور حصة «${title}»: ${inviteUrl}`)}`} target="_blank" rel="noopener noreferrer">
              <Button size="sm" className="bg-[#25D366] hover:bg-[#1ebe57]">واتساب</Button>
            </a>
          </div>
          <p className="mt-1 text-[10px] text-brand-900/55">من لديها الرابط تدخل باسمها دون تسجيل، وبانتظار موافقتك قبل الدخول.</p>
        </div>
      )}

      {/* participants + moderation */}
      {(showParticipants || isHost) && (
        <div className="rounded-2xl border border-brand-100 bg-white p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-extrabold text-brand-950">👥 المشاركات ({roster.length})</p>
            {isHost && <span className="text-[10px] font-bold text-brand-700">لديك صلاحيات الإدارة</span>}
          </div>

          {isHost && waitingList.length > 0 && (
            <div className="mb-3 rounded-xl border-2 border-amber-300 bg-amber-50 p-2.5">
              <p className="text-xs font-extrabold text-amber-900">🚪 طلبات دخول ({waitingList.length})</p>
              {waitingList.map((w) => (
                <div key={w.socketId} className="mt-1.5 flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-amber-900">{w.name}</span>
                  <span className="flex gap-1.5">
                    <Button size="sm" variant="success" onClick={() => control("admit", w.socketId)}>قبول</Button>
                    <Button size="sm" variant="outline" onClick={() => control("deny", w.socketId)}>رفض</Button>
                  </span>
                </div>
              ))}
            </div>
          )}

          <ul className="space-y-1.5">
            {roster.map((p) => (
              <li key={p.socketId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-brand-50 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-extrabold text-brand-950">
                    {p.name} {p.socketId === selfId && <span className="text-[10px] text-brand-700">(أنت)</span>}
                    {p.isHost && <span className="ms-1 text-[10px] font-bold text-amber-700">👑 المعلمة</span>}
                    {p.role === "GUEST" && <span className="ms-1 text-[10px] font-bold text-brand-600">ضيفة</span>}
                  </p>
                  <p className="text-[10px] text-brand-900/50">
                    {p.micOn ? "🎙 تتحدث" : p.micAllowed ? "🎙 مسموح" : "🔇 مكتومة"} ·{" "}
                    {p.camOn ? "📷 كاميرا" : "📷 مغلقة"} · {p.screenOn ? "🖥 تشارك" : ""}
                    {p.handRaised && " · ✋ رافعة يدها"}
                  </p>
                </div>
                {isHost && p.socketId !== selfId && (
                  <div className="flex flex-wrap gap-1">
                    <Button size="sm" variant="outline" onClick={() => control(p.micAllowed ? "mute-mic" : "allow-mic", p.socketId)}>
                      {p.micAllowed ? "إسكات" : "سماح بالمايك"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => control(p.camAllowed ? "stop-cam" : "allow-cam", p.socketId)}>
                      {p.camAllowed ? "إيقاف الكاميرا" : "سماح بالكاميرا"}
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => control("spotlight", undefined, p.socketId === spotlight ? "" : p.socketId)}>
                      {spotlight === p.socketId ? "إلغاء التثبيت" : "تثبيت"}
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => { if (confirm(`إخراج ${p.name} من الحصة؟`)) control("kick", p.socketId); }}>
                      إخراج
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* chat */}
      {chatOpen && (
        <div className="flex flex-col rounded-2xl border border-brand-100 bg-white" style={{ height: "55dvh" }}>
          <div className="border-b border-brand-100 p-2.5">
            <p className="text-xs font-extrabold text-brand-950">💬 دردشة الحصة</p>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto p-3">
            {chat.map((m) => {
              const mine = m.socketId === selfId;
              return (
                <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-6 ${mine ? "bg-brand-600 text-white" : "bg-brand-50 text-brand-950"}`}>
                    {!mine && <p className="mb-0.5 text-[10px] font-extrabold text-brand-700">{m.authorName}</p>}
                    {m.body && <p className="whitespace-pre-line">{m.body}</p>}
                    {m.audioUrl ? (
                      <audio controls src={m.audioUrl} className="mt-1 w-full" />
                    ) : m.hasAudio ? (
                      <a href={`/api/live/${liveId}/voice/${m.id}`} className="mt-1 inline-block text-[11px] font-bold underline">🎙 تسجيل صوتي</a>
                    ) : null}
                    {m.fileMime?.startsWith("image/") ? (
                      <a href={`/api/live/${liveId}/file/${m.id}`} target="_blank" rel="noreferrer" className="mt-1 block">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/api/live/${liveId}/file/${m.id}?inline=1`} alt={m.fileName ?? "صورة"} className="max-h-40 rounded-lg" />
                        <span className="mt-0.5 block text-[10px] font-bold underline">🖼 {m.fileName}</span>
                      </a>
                    ) : m.hasFile ? (
                      <a href={`/api/live/${liveId}/file/${m.id}`} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[11px] font-bold underline">
                        📎 {m.fileName ?? "ملف مرفق"}
                      </a>
                    ) : null}
                  </div>
                </div>
              );
            })}
            <div ref={chatBottom} />
          </div>
          {file && (
            <div className="flex items-center justify-between gap-2 border-t border-brand-100 bg-amber-50 px-2.5 py-1.5 text-[11px] font-bold text-amber-900">
              <span className="truncate">📎 {file.name} — جاهز للإرسال</span>
              <button type="button" onClick={() => setFile(null)} className="shrink-0 underline">إزالة</button>
            </div>
          )}
          <div className="flex items-center gap-1.5 border-t border-brand-100 p-2.5">
            <input
              className="min-w-0 flex-1 rounded-xl border border-brand-100 bg-brand-50/50 px-2.5 py-2 text-xs outline-none focus:border-brand-400"
              placeholder={viewer.isGuest ? "اكتبي رسالتك…" : "اكتبي أو سجّلي صوتك…"}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendChat()}
            />
            {!viewer.isGuest && (
              <>
                <label
                  className={`cursor-pointer rounded-xl border border-brand-200 px-2.5 py-2 text-xs font-extrabold text-brand-800 ${fileBusy ? "opacity-50" : ""}`}
                  title="إرفاق صورة أو ملف"
                >
                  {fileBusy ? "…" : "📎"}
                  <input
                    type="file"
                    accept="image/*,application/pdf,audio/*"
                    className="hidden"
                    disabled={fileBusy}
                    onChange={(e) => void pickFile(e.currentTarget)}
                  />
                </label>
              </>
            )}
            {!viewer.isGuest && (
              rec.state === "recording" ? (
                <Button size="sm" variant="destructive" onClick={rec.stop}>⏹ {rec.seconds}s</Button>
              ) : rec.blob ? (
                <Button size="sm" variant="outline" onClick={rec.reset}>🎙 ✓</Button>
              ) : (
                <Button size="sm" variant="outline" onClick={rec.start}>🎙</Button>
              )
            )}
            <Button size="sm" onClick={sendChat}>إرسال</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function VideoTile({
  participant, stream, localStream, isSelf, big,
}: {
  participant: Participant;
  stream?: MediaStream;
  localStream?: MediaStream | null;
  isSelf?: boolean;
  big?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const active = localStream ?? stream;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (active) {
      el.srcObject = active;
      el.play().catch(() => {});
    } else {
      el.srcObject = null;
    }
  }, [active]);

  const hasVideo = Boolean(active && active.getVideoTracks().length > 0);

  return (
    <div className={`relative overflow-hidden rounded-2xl border border-brand-100 bg-brand-950 ${big ? "aspect-video" : "aspect-video"}`}>
      <video ref={ref} autoPlay playsInline muted={isSelf} className={`h-full w-full object-cover ${hasVideo ? "" : "opacity-0"}`} />
      {!hasVideo && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-white/80">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15 text-lg font-extrabold">
            {participant.name.slice(0, 1)}
          </div>
          <p className="max-w-[90%] truncate text-[11px] font-bold">{participant.name}</p>
          <p className="text-[10px] text-white/50">{participant.camAllowed ? "الكاميرا مغلقة" : "الكاميرا غير مسموحة"}</p>
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5">
        <span className="truncate text-[10px] font-bold text-white">
          {participant.isHost ? "👑 " : ""}{participant.name}{isSelf ? " (أنت)" : ""}
        </span>
        <span className="flex shrink-0 items-center gap-1 text-[10px] text-white/90">
          {participant.handRaised && "✋"}
          {participant.micOn ? "🎙" : "🔇"}
          {participant.screenOn && "🖥"}
        </span>
      </div>
    </div>
  );
}
