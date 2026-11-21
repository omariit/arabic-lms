"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Card, CardContent } from "@/components/ui/primitives";
import { buttonVariants } from "@/components/ui/button";
import { cn, formatDateAr } from "@/lib/utils";

type Item = {
  id: string;
  lessonId: string;
  lessonTitle: string;
  assignmentTitle: string;
  courseId: string;
  courseTitle: string;
  studentId: string;
  studentName: string;
  studentPhone: string;
  staffUnread: number;
  lastMessageAt: string;
  preview: string;
  lastFrom: string | null;
  hasVoice: boolean;
  messageCount: number;
};

type Filter = "unread" | "all";

/** Every student↔teacher homework conversation in one inbox (unread first). */
export function InboxClient() {
  const [items, setItems] = useState<Item[]>([]);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("unread");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/inbox", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { items: Item[]; unreadMessages: number };
      setItems(data.items);
      setUnreadMessages(data.unreadMessages);
    } catch {
      setError("تعذّر تحميل صندوق الواجبات — تحققي من الاتصال وأعيدي المحاولة");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const markAll = async () => {
    await fetch("/api/admin/inbox", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    }).catch(() => {});
    void load();
  };

  const visible = items.filter((i) => {
    if (filter === "unread" && i.staffUnread === 0) return false;
    if (!query.trim()) return true;
    const q = query.trim();
    return i.studentName.includes(q) || i.lessonTitle.includes(q) || i.courseTitle.includes(q);
  });

  const unreadThreads = items.filter((i) => i.staffUnread > 0).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setFilter("unread")}
          className={cn("h-11 rounded-xl px-4 text-xs font-extrabold", filter === "unread" ? "bg-brand-600 text-white" : "bg-white text-brand-800 ring-1 ring-brand-200")}
        >
          غير المقروءة {unreadThreads > 0 && `(${unreadThreads})`}
        </button>
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={cn("h-11 rounded-xl px-4 text-xs font-extrabold", filter === "all" ? "bg-brand-600 text-white" : "bg-white text-brand-800 ring-1 ring-brand-200")}
        >
          الكل ({items.length})
        </button>
        {unreadMessages > 0 && (
          <button type="button" onClick={markAll} className="ms-auto h-11 rounded-xl bg-emerald-50 px-4 text-xs font-extrabold text-emerald-800">
            تعليم الكل كمقروء
          </button>
        )}
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="ابحثي باسم الطالبة أو الدرس…"
        className="h-11 w-full rounded-xl border border-brand-200 bg-white px-4 text-sm outline-none focus:border-brand-500"
      />

      {loading && <p className="py-8 text-center text-sm text-gray-500">جارٍ التحميل…</p>}

      {error && (
        <Card>
          <CardContent className="space-y-2 text-center">
            <p className="text-sm text-red-700">{error}</p>
            <button type="button" onClick={() => void load()} className={cn(buttonVariants({ size: "sm" }))}>
              إعادة المحاولة
            </button>
          </CardContent>
        </Card>
      )}

      {!loading && !error && visible.length === 0 && (
        <Card>
          <CardContent className="space-y-2 py-8 text-center text-sm text-gray-500">
            <p className="text-3xl">📭</p>
            <p className="font-extrabold text-brand-900">
              {filter === "unread" ? "لا توجد رسائل جديدة" : "لا توجد محادثات واجبات بعد"}
            </p>
            <p>
              عندما تُرسل الطالبة واجبًا أو تسجيلًا صوتيًا على درس تظهر محادثتها هنا مباشرة،
              وتصلها أيضًا إشعارات على الجوال.
            </p>
            {filter === "unread" && items.length > 0 && (
              <button type="button" onClick={() => setFilter("all")} className={cn(buttonVariants({ size: "sm", variant: "secondary" }))}>
                اعرضي كل المحادثات ({items.length})
              </button>
            )}
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {visible.map((i) => (
          <Link
            key={i.id}
            href={`/admin/lessons/${i.lessonId}?student=${i.studentId}`}
            className={cn(
              "block rounded-2xl border bg-white p-4 shadow-sm transition hover:border-brand-300",
              i.staffUnread > 0 ? "border-amber-300 bg-amber-50/40" : "border-brand-100",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-extrabold">
                  {i.studentName}
                  {i.staffUnread > 0 && <Badge tone="amber">{i.staffUnread} جديد</Badge>}
                  {i.hasVoice && <Badge tone="green">🎤 صوت</Badge>}
                </p>
                <p className="truncate text-xs text-gray-500">
                  {i.courseTitle} · {i.lessonTitle}
                  {i.assignmentTitle ? ` · ${i.assignmentTitle}` : ""}
                </p>
                <p className="mt-1 line-clamp-2 text-sm text-brand-900/80">{i.preview || "—"}</p>
              </div>
              <div className="shrink-0 text-end">
                <p className="text-[11px] text-gray-400">{formatDateAr(i.lastMessageAt)}</p>
                <span className={cn(buttonVariants({ size: "sm" }), "mt-2")}>فتح</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
