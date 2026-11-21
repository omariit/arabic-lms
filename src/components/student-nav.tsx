import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { LogoutButton } from "@/components/logout-button";
import { cn } from "@/lib/utils";

/**
 * One navigation bar for every student screen, so she is never stuck on a page
 * with no way back and is never sent to the marketing landing page.
 * Shows her unread chat + homework counts.
 */
export async function StudentNav({ current }: { current?: string }) {
  const user = await getCurrentUser().catch(() => null);
  if (!user || user.role !== "STUDENT") return null;

  const [chatUnread, homeworkUnread] = await Promise.all([
    db.conversation.count({ where: { studentId: user.id, studentUnread: { gt: 0 } } }).catch(() => 0),
    db.lessonThread.count({ where: { studentId: user.id, studentUnread: { gt: 0 } } }).catch(() => 0),
  ]);

  const items = [
    { href: "/dashboard", label: "لوحتي", icon: "🏠", badge: 0 },
    { href: "/courses", label: "المقررات", icon: "📚", badge: 0 },
    { href: "/dashboard/chat", label: "رسائلي", icon: "📨", badge: chatUnread },
  ] as const;

  return (
    <header className="sticky top-0 z-40 border-b border-brand-100 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center gap-2 px-3 py-2">
        {items.map((it) => {
          const active = current ? current === it.href : false;
          return (
            <Link
              key={it.href}
              href={it.href}
              className={cn(
                "relative flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-extrabold transition",
                active ? "bg-brand-600 text-white" : "text-brand-900 hover:bg-brand-50",
              )}
            >
              <span className="text-base">{it.icon}</span>
              {it.label}
              {it.badge > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-400 px-1 text-[10px] font-extrabold text-emerald-950">
                  {it.badge > 9 ? "٩+" : it.badge.toLocaleString("ar-EG")}
                </span>
              )}
            </Link>
          );
        })}
        {homeworkUnread > 0 && (
          <span className="ms-auto rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-800">
            📝 {homeworkUnread.toLocaleString("ar-EG")} رد جديد على واجب
          </span>
        )}
        <div className={cn("ms-auto", homeworkUnread > 0 && "ms-0")}>
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
