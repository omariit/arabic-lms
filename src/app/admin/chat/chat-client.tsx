"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Conv = {
  id: string; studentName: string; studentPhone: string; subject: string;
  lastMessageAt: string; unread: number; assignedToId: string | null;
  preview: string; previewRole: string | null;
};
type Staff = { id: string; fullName: string; role: string };
type Msg = { id: string; senderId: string; senderRole: string; body: string; createdAt: string };

const ROLE_LABEL: Record<string, string> = {
  TEACHER: "المعلمة", ADMIN: "الإدارة", ASSISTANT: "مساعدة", STUDENT: "الطالبة",
};

export function StaffChat({ meId }: { meId: string }) {
  const [data, setData] = useState<{ me: Staff; staff: Staff[]; conversations: Conv[] } | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [showList, setShowList] = useState(true);
  const bottom = useRef<HTMLDivElement>(null);

  const loadInbox = useCallback(async () => {
    const j = await fetch("/api/admin/chat").then((r) => r.json());
    setData(j);
  }, []);

  const loadThread = useCallback(async (id: string) => {
    const j = await fetch(`/api/admin/chat/${id}`).then((r) => r.json());
    setMessages(j.messages ?? []);
  }, []);

  useEffect(() => {
    loadInbox();
    const t = setInterval(loadInbox, 5000);
    return () => clearInterval(t);
  }, [loadInbox]);

  useEffect(() => {
    if (!activeId) return;
    const t = setInterval(() => loadThread(activeId), 4000);
    return () => clearInterval(t);
  }, [activeId, loadThread]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const open = async (id: string) => {
    setActiveId(id);
    setShowList(false);
    await Promise.all([loadThread(id), loadInbox()]);
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || !activeId) return;
    setDraft("");
    await fetch(`/api/admin/chat/${activeId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: text }),
    });
    await Promise.all([loadThread(activeId), loadInbox()]);
  };

  const assign = async (id: string, to: string | null) => {
    await fetch(`/api/admin/chat/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignedToId: to }),
    });
    await loadInbox();
  };

  const active = data?.conversations.find((c) => c.id === activeId) ?? null;
  const totalUnread = data?.conversations.reduce((n, c) => n + c.unread, 0) ?? 0;

  return (
    <div className="space-y-4">
      {!active && (
        <div>
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-extrabold text-brand-950">📨 صندوق الرسائل {totalUnread > 0 && <span className="ml-1 rounded-full bg-amber-400 px-2 py-0.5 text-xs font-extrabold text-emerald-950">{totalUnread}</span>}</h1>
          </div>
          {(data?.conversations.length ?? 0) === 0 ? (
            <p className="mt-3 rounded-3xl bg-white p-8 text-center text-sm text-brand-900/60 shadow-sm">لا توجد محادثات بعد</p>
          ) : (
            data!.conversations.map((c) => (
              <button key={c.id} onClick={() => open(c.id)} className="mt-2 w-full rounded-3xl border border-brand-100 bg-white p-4 text-right shadow-sm transition hover:border-brand-300">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-extrabold text-brand-950">{c.studentName}</p>
                  {c.unread > 0 && <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[11px] font-extrabold text-emerald-950">{c.unread}</span>}
                </div>
                <p className="text-[11px] text-brand-900/50">{c.subject || "بدون موضوع"} · {c.studentPhone}</p>
                <p className="mt-1 line-clamp-1 text-xs text-brand-900/60">{c.preview}</p>
                {c.assignedToId && (
                  <p className="mt-1 text-[10px] font-bold text-brand-700">
                    يتولاها: {data!.staff.find((s) => s.id === c.assignedToId)?.fullName ?? "—"}
                  </p>
                )}
              </button>
            ))
          )}
        </div>
      )}

      {active && (
        <div className="flex flex-col rounded-3xl border border-brand-100 bg-white shadow-sm" style={{ height: "calc(100dvh - 220px)" }}>
          <div className="border-b border-brand-100 p-3">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="truncate text-sm font-extrabold text-brand-950">{active.studentName}</p>
                <p className="text-[11px] text-brand-900/50" dir="ltr">{active.studentPhone}</p>
              </div>
              <button onClick={() => { setActiveId(null); setShowList(true); loadInbox(); }} className="rounded-xl border border-brand-200 px-3 py-1.5 text-xs font-bold text-brand-900">
                ← الصندوق
              </button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {data?.staff.map((s) => (
                <button
                  key={s.id}
                  onClick={() => assign(active.id, active.assignedToId === s.id ? null : s.id)}
                  className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold transition ${
                    active.assignedToId === s.id ? "bg-brand-700 text-white" : "bg-brand-50 text-brand-900 hover:bg-brand-100"
                  }`}
                >
                  {s.fullName === data.me.fullName ? "🤝 أنا" : `🤝 ${ROLE_LABEL[s.role]}`}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto p-4">
            {messages.map((m) => {
              const mine = m.senderId === meId;
              return (
                <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-6 shadow-sm ${mine ? "bg-brand-600 text-white" : "bg-brand-50 text-brand-950"}`}>
                    {!mine && <p className="mb-0.5 text-[10px] font-extrabold text-brand-700">{ROLE_LABEL[m.senderRole] ?? ""}</p>}
                    {m.body}
                  </div>
                </div>
              );
            })}
            <div ref={bottom} />
          </div>

          <div className="flex gap-2 border-t border-brand-100 p-3">
            <input
              className="flex-1 rounded-xl border border-brand-100 bg-brand-50/50 px-3 py-2.5 text-sm outline-none focus:border-brand-400"
              placeholder="اكتبي ردك…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
            />
            <button onClick={send} className="rounded-xl bg-brand-700 px-4 py-2.5 text-sm font-extrabold text-white">إرسال</button>
          </div>
        </div>
      )}
    </div>
  );
}
