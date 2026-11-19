"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Conv = { id: string; subject: string; lastMessageAt: string; unread: number; preview: string; senderRole: string | null };
type Msg = { id: string; senderId: string; senderRole: string; body: string; createdAt: string };
export type ChatStrings = {
  chatKicker: string; chatTitle: string; chatStartNew: string; chatSubjectPlaceholder: string;
  chatMessagePlaceholder: string; chatSend: string; chatEmpty: string; chatBack: string; chatStaff: string;
};

export function StudentChat({ locale, T }: { locale: "ar" | "en"; T: ChatStrings }) {
  const [convs, setConvs] = useState<Conv[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [creating, setCreating] = useState(false);
  const [newSubject, setNewSubject] = useState("");
  const bottom = useRef<HTMLDivElement>(null);

  const loadConvs = useCallback(async (openId?: string) => {
    const q = openId ? `?open=${openId}` : "";
    const res = await fetch(`/api/chat${q}`).then((r) => r.json());
    setConvs(res.conversations ?? []);
  }, []);

  const loadMessages = useCallback(async (id: string) => {
    const res = await fetch(`/api/chat/${id}`).then((r) => r.json());
    setMessages(res.messages ?? []);
  }, []);

  useEffect(() => {
    loadConvs();
  }, [loadConvs]);

  // poll active thread every 4s
  useEffect(() => {
    if (!activeId) return;
    const t = setInterval(() => loadMessages(activeId), 4000);
    return () => clearInterval(t);
  }, [activeId, loadMessages]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const open = async (id: string) => {
    setActiveId(id);
    await Promise.all([loadMessages(id), loadConvs(id)]);
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || !activeId) return;
    setDraft("");
    await fetch(`/api/chat/${activeId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: text }),
    });
    await loadMessages(activeId);
  };

  const startNew = async () => {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject: newSubject.trim() }),
    });
    const j = await res.json();
    setNewSubject("");
    setCreating(false);
    if (j.conversation?.id) {
      await loadConvs();
      open(j.conversation.id);
    }
  };

  const active = convs.find((c) => c.id === activeId) ?? null;

  return (
    <div className="space-y-4">
      {!activeId && (
        <>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-extrabold text-amber-600">{T.chatKicker}</p>
              <h1 className="text-lg font-extrabold text-brand-950">{T.chatTitle}</h1>
            </div>
            <button onClick={() => setCreating(true)} className="rounded-xl bg-brand-700 px-4 py-2.5 text-sm font-extrabold text-white">
              ＋ {T.chatStartNew}
            </button>
          </div>

          {creating && (
            <div className="rounded-3xl border border-brand-100 bg-white p-4 shadow-sm">
              <input
                autoFocus
                className="mb-2 w-full rounded-xl border border-brand-100 bg-brand-50/50 px-3 py-2.5 text-sm"
                placeholder={T.chatSubjectPlaceholder}
                value={newSubject}
                onChange={(e) => setNewSubject(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && startNew()}
              />
              <div className="flex gap-2">
                <button onClick={startNew} className="rounded-xl bg-brand-700 px-4 py-2 text-sm font-extrabold text-white">{T.chatStartNew}</button>
                <button onClick={() => setCreating(false)} className="rounded-xl border border-brand-200 px-4 py-2 text-sm font-bold text-brand-900">{T.chatBack}</button>
              </div>
            </div>
          )}

          {convs.length === 0 && !creating ? (
            <p className="rounded-3xl bg-white p-8 text-center text-sm text-brand-900/60 shadow-sm">{T.chatEmpty}</p>
          ) : (
            convs.map((c) => (
              <button key={c.id} onClick={() => open(c.id)} className="w-full rounded-3xl border border-brand-100 bg-white p-4 text-right shadow-sm transition hover:border-brand-300">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-extrabold text-brand-950">{c.subject || T.chatTitle}</p>
                  {c.unread > 0 && <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[11px] font-extrabold text-emerald-950">{c.unread}</span>}
                </div>
                <p className="mt-1 line-clamp-1 text-xs text-brand-900/60">
                  {c.senderRole && c.senderRole !== "STUDENT" ? <span className="font-extrabold text-brand-700">{T.chatStaff}: </span> : null}
                  {c.preview}
                </p>
              </button>
            ))
          )}
        </>
      )}

      {activeId && active && (
        <div className="flex flex-col rounded-3xl border border-brand-100 bg-white shadow-sm" style={{ height: "calc(100dvh - 180px)" }}>
          <div className="flex items-center justify-between border-b border-brand-100 p-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-extrabold text-brand-950">{active.subject || T.chatTitle}</p>
              <p className="text-[11px] text-brand-900/50">{T.chatStaff}</p>
            </div>
            <button onClick={() => { setActiveId(null); loadConvs(); }} className="rounded-xl border border-brand-200 px-3 py-1.5 text-xs font-bold text-brand-900">
              ← {T.chatBack}
            </button>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto p-4">
            {messages.length === 0 && <p className="pt-8 text-center text-xs text-brand-900/40">{T.chatEmpty}</p>}
            {messages.map((m) => {
              const mine = m.senderRole === "STUDENT";
              return (
                <div key={m.id} className={`flex ${mine ? "justify-start" : "justify-end"}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-6 shadow-sm ${mine ? "bg-brand-600 text-white" : "bg-brand-50 text-brand-950"}`}>
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
              placeholder={T.chatMessagePlaceholder}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
            />
            <button onClick={send} className="rounded-xl bg-brand-700 px-4 py-2.5 text-sm font-extrabold text-white">{T.chatSend}</button>
          </div>
        </div>
      )}
    </div>
  );
}
