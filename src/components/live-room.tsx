"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { ProtectedPlayer } from "@/components/protected-player";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

/**
 * Live classroom:
 * - Video layer: protected (watermarked) YouTube live embed, one-way from teacher.
 * - Audio layer: Socket.io + WebRTC audio-only mesh. Teacher mic muted by default
 *   (YouTube carries her voice) so students never hear doubled audio.
 * - Students join muted, raise hands; teacher grants/revokes one mic at a time.
 */

export type LiveRoomProps = {
  liveSessionId: string;
  lessonId: string | null; // live video is delivered through the same protected token flow
  viewer: { role: "ADMIN" | "TEACHER" | "STUDENT"; name: string; phone: string };
};

type HandEntry = { socketId: string; name: string };

export function LiveRoom({ liveSessionId, lessonId, viewer }: LiveRoomProps) {
  const isTeacher = viewer.role !== "STUDENT"; // TEACHER hosts; ADMIN has the same powers
  const socketRef = useRef<Socket | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudiosRef = useRef<Map<string, HTMLAudioElement>>(new Map());

  const [connected, setConnected] = useState(false);
  const [roomError, setRoomError] = useState<string | null>(null);
  const [handQueue, setHandQueue] = useState<HandEntry[]>([]);
  const [granted, setGranted] = useState<string[]>([]);
  const [myHand, setMyHand] = useState(false);
  const [myMicGranted, setMyMicGranted] = useState(false);
  const [teacherMicOn, setTeacherMicOn] = useState(false); // muted by default (YouTube carries audio)
  const [participants, setParticipants] = useState(1);

  /** Attach a remote audio-only stream (hidden <audio> elements). */
  const attachRemote = useCallback((socketId: string, stream: MediaStream) => {
    let audio = remoteAudiosRef.current.get(socketId);
    if (!audio) {
      audio = document.createElement("audio");
      audio.autoplay = true;
      audio.dataset.peer = socketId;
      document.body.appendChild(audio);
      remoteAudiosRef.current.set(socketId, audio);
    }
    audio.srcObject = stream;
    audio.play().catch(() => {});
  }, []);

  const detachRemote = useCallback((socketId: string) => {
    const audio = remoteAudiosRef.current.get(socketId);
    if (audio) {
      audio.srcObject = null;
      audio.remove();
      remoteAudiosRef.current.delete(socketId);
    }
    peersRef.current.get(socketId)?.close();
    peersRef.current.delete(socketId);
  }, []);

  /** Audio-only peer connection; renegotiation handled per signal. */
  const ensurePeer = useCallback(
    (peerSocketId: string, initiator: boolean) => {
      let pc = peersRef.current.get(peerSocketId);
      if (pc) return pc;
      pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });
      peersRef.current.set(peerSocketId, pc);

      // Always present audio track; muted (disabled) until mic granted — echo-free by construction.
      let stream = localStreamRef.current;
      if (!stream) {
        stream = new MediaStream();
        localStreamRef.current = stream;
      }
      const sendTrack = async () => {
        try {
          const mic = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          });
          mic.getAudioTracks().forEach((t) => {
            t.enabled = isTeacher ? teacherMicOn : myMicGranted;
            stream!.addTrack(t);
            pc!.addTrack(t, stream!);
          });
        } catch {
          // No mic permission: stay listen-only.
        }
      };
      void sendTrack();

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          socketRef.current?.emit("signal", { target: peerSocketId, data: { candidate: e.candidate } });
        }
      };
      pc.ontrack = (e) => attachRemote(peerSocketId, e.streams[0]);
      pc.onconnectionstatechange = () => {
        if (pc && ["failed", "closed"].includes(pc.connectionState)) {
          detachRemote(peerSocketId);
        }
      };

      if (initiator) {
        pc.onnegotiationneeded = async () => {
          try {
            const offer = await pc!.createOffer();
            await pc!.setLocalDescription(offer);
            socketRef.current?.emit("signal", { target: peerSocketId, data: { sdp: offer } });
          } catch { /* renegotiation race — ignore */ }
        };
      }
      return pc;
    },
    [attachRemote, detachRemote, isTeacher, teacherMicOn, myMicGranted]
  );

  // Socket lifecycle.
  useEffect(() => {
    let disposed = false;
    const socket = io({
      path: "/socket.io",
      auth: {}, // cookie travels automatically; server verifies the signed session
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      if (disposed) return;
      setConnected(true);
      socket.emit("join-room", { liveSessionId });
    });
    socket.on("connect_error", (err) => setRoomError(err.message));
    socket.on("room-error", ({ message }: { message: string }) => setRoomError(message));
    socket.on("room-state", (s: { handQueue: HandEntry[]; granted: string[]; participants: number }) => {
      setHandQueue(s.handQueue ?? []);
      setGranted(s.granted ?? []);
      setParticipants(s.participants ?? 1);
    });
    socket.on("peer-list", ({ peers }: { peers: string[] }) => {
      peers.forEach((p) => ensurePeer(p, true));
    });
    socket.on("signal", async ({ from, data }: { from: string; data: { sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit } }) => {
      const pc = ensurePeer(from, false);
      try {
        if (data.sdp) {
          await pc.setRemoteDescription(data.sdp);
          if (data.sdp.type === "offer") {
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socketRef.current?.emit("signal", { target: from, data: { sdp: answer } });
          }
        } else if (data.candidate) {
          await pc.addIceCandidate(data.candidate).catch(() => {});
        }
      } catch { /* ignore races */ }
    });
    socket.on("participant-joined", ({ socketId }: { socketId: string }) => {
      setParticipants((n) => n + 1);
      if (isTeacher) ensurePeer(socketId, true);
    });
    socket.on("participant-left", ({ socketId }: { socketId: string }) => {
      setParticipants((n) => Math.max(1, n - 1));
      detachRemote(socketId);
      setHandQueue((q) => q.filter((h) => h.socketId !== socketId));
      setGranted((g) => g.filter((id) => id !== socketId));
    });
    socket.on("hand-queue", ({ handQueue }: { handQueue: HandEntry[] }) => setHandQueue(handQueue));
    socket.on("mic-state", ({ granted, changed, isGranted }: { granted: string[]; changed: string; isGranted: boolean }) => {
      setGranted(granted);
      if (changed === socket.id) setMyMicGranted(isGranted);
    });
    socket.on("your-mic", ({ granted }: { granted: boolean }) => setMyMicGranted(granted));

    return () => {
      disposed = true;
      peersRef.current.forEach((pc) => pc.close());
      peersRef.current.clear();
      remoteAudiosRef.current.forEach((a) => a.remove());
      remoteAudiosRef.current.clear();
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveSessionId]);

  const toggleHand = () => {
    if (myHand) {
      socketRef.current?.emit("lower-hand", { liveSessionId });
      setMyHand(false);
    } else {
      socketRef.current?.emit("raise-hand", { liveSessionId });
      setMyHand(true);
    }
  };

  const handleHand = (socketId: string, grant: boolean) => {
    if (!isTeacher) return;
    socketRef.current?.emit("grant-mic", { liveSessionId, targetSocketId: socketId, grant });
  };

  const toggleTeacherMic = () => {
    const next = !teacherMicOn;
    setTeacherMicOn(next);
    localStreamRef.current?.getAudioTracks().forEach((t) => { t.enabled = next; });
  };

  if (roomError) {
    return (
      <div className="rounded-2xl bg-red-50 p-6 text-center text-red-700 font-bold">
        {roomError}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Echo-prevention reminder banner (prominent per spec) */}
      <div className="rounded-xl bg-amber-100 border-2 border-amber-300 p-3 text-center text-sm font-bold text-amber-900">
        🎧 يرجى استخدام سماعات بلوتوث لمنع صدى الصوت
      </div>

      {lessonId ? (
        <ProtectedPlayer
          liveSessionId={liveSessionId}
          studentName={viewer.name}
          studentPhone={viewer.phone}
          isLive
        />
      ) : (
        <div className="flex aspect-video items-center justify-center rounded-2xl bg-black text-white/60">
          {isTeacher ? "يبدأ البث عند فتح يوتيوب ستوديو" : "في انتظار بدء البث…"}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-brand-100 bg-white p-4">
        <Badge tone={connected ? "green" : "amber"}>{connected ? `متصل • ${participants} داخل الحصة` : "جارٍ الاتصال…"}</Badge>

        {isTeacher ? (
          <>
            <Button variant={teacherMicOn ? "destructive" : "secondary"} onClick={toggleTeacherMic}>
              {teacherMicOn ? "🔇 إسكات ميكروفون الموقع" : "🎙️ تشغيل ميكروفون الموقع"}
            </Button>
            <span className="text-xs text-gray-500">ميكروفون الموقع مغلق افتراضيًا — صوتك يُبث من يوتيوب</span>
          </>
        ) : (
          <>
            <Button variant={myHand ? "success" : "outline"} onClick={toggleHand}>
              ✋ {myHand ? "إخفاء اليد" : "رفع اليد"}
            </Button>
            <Badge tone={myMicGranted ? "green" : "gray"}>
              {myMicGranted ? "🎤 الميكروفون مفتوح — تحدثي الآن" : "🎤 الميكروفون مغلق"}
            </Badge>
          </>
        )}
      </div>

      {/* Hand queue — teacher moderation drawer (mobile-first, large buttons) */}
      <div className="rounded-2xl border border-brand-100 bg-white p-4">
        <h3 className="mb-3 text-sm font-extrabold text-brand-900">
          🙋 رفع اليد {handQueue.length > 0 && <Badge tone="amber" className="ms-2">{handQueue.length}</Badge>}
        </h3>
        {handQueue.length === 0 ? (
          <p className="text-sm text-gray-500">لا توجد أيدي مرفوعة حاليًا</p>
        ) : (
          <ul className="space-y-2">
            {handQueue.map((h) => (
              <li key={h.socketId} className="flex items-center justify-between gap-2 rounded-xl bg-brand-50 p-3">
                <span className="text-sm font-bold">{h.name}</span>
                {isTeacher ? (
                  <span className="flex gap-2">
                    <Button size="sm" variant="success" onClick={() => handleHand(h.socketId, true)}>فتح الميكروفون</Button>
                    <Button size="sm" variant="outline" onClick={() => handleHand(h.socketId, false)}>رفض</Button>
                  </span>
                ) : (
                  <Badge tone="gray">في الانتظار</Badge>
                )}
              </li>
            ))}
          </ul>
        )}
        {isTeacher && granted.length > 0 && (
          <div className="mt-3 space-y-2">
            <p className="text-xs font-bold text-gray-500">ميكروفون مفتوح حاليًا:</p>
            {granted.map((id) => (
              <Button key={id} size="sm" variant="destructive" className={cn("w-full")} onClick={() => handleHand(id, false)}>
                إسكات الطالب ({id.slice(0, 5)}…)
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
