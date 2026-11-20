import Link from "next/link";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { PushManager } from "@/components/push-manager";
import { InstallPrompt } from "@/components/install-prompt";
import { LogoutButton } from "@/components/logout-button";

const NAV = [
  { href: "/admin/chat", label: "الرسائل", icon: "📨", staff: true, badge: true },
  { href: "/admin", label: "الرئيسية", icon: "🏠", teacher: true },
  { href: "/admin/live", label: "الحصص المباشرة", icon: "🔴", teacher: true },
  { href: "/admin/grading", label: "التصحيح", icon: "🎤", teacher: true },
  { href: "/admin/enrollments", label: "التسجيلات", icon: "✅", teacher: true },
  { href: "/admin/landing", label: "الصفحة", icon: "🎨", teacher: true },
  { href: "/admin/staff", label: "فريقي", icon: "🤝", teacher: true },
  { href: "/admin/students", label: "المستخدمات", icon: "👩‍🎓", adminOnly: true },
  { href: "/admin/profile", label: "إعداداتي", icon: "⚙️", teacher: true },
];


export const metadata = { robots: { index: false, follow: false } };
/** Staff shell (TEACHER + ADMIN + ASSISTANT): large touch targets, sticky bottom nav.
 * The ASSISTANT only sees the chat inbox. The badge shows total unread chats. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff();
  const isAdmin = user.role === "ADMIN";
  const isAssistant = user.role === "ASSISTANT";

  let chatUnread = 0;
  try {
    const [chats, lessons] = await Promise.all([
      db.conversation.count({ where: { staffUnread: { gt: 0 } } }),
      db.lessonThread.count({ where: { staffUnread: { gt: 0 } } }),
    ]);
    chatUnread = chats + lessons;
  } catch { /* cold start */ }

  const nav = NAV.filter((n) => {
    if (isAssistant) return n.staff;
    if (n.adminOnly && !isAdmin) return false;
    return n.teacher !== false;
  });
  const cols = nav.length;

  return (
    <div className="min-h-dvh pb-24">
      <header className="sticky top-0 z-40 bg-brand-600 text-white shadow">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div>
            <p className="text-sm font-extrabold">{isAdmin ? "🛠️ لوحة الإدارة" : isAssistant ? "🤝 لوحة المساعدة" : "👩‍🏫 لوحة المعلمة"}</p>
            <p className="text-xs text-white/70">{user.fullName} · {isAdmin ? "مدير المنصة" : isAssistant ? "مساعدة المعلمة" : "معلمة"}</p>
          </div>
          <LogoutButton />
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 pt-4">
        <PushManager label="تنبيهات مُقْرِئَة" />
        <InstallPrompt label="مُقْرِئَة" />
        {children}
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-brand-100 bg-white shadow-lg">
        <div className="mx-auto grid max-w-3xl" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className="relative flex flex-col items-center gap-0.5 py-3 text-[11px] font-bold text-brand-900 hover:bg-brand-50">
              <span className="text-xl">{n.icon}</span>
              {n.label}
              {n.badge && chatUnread > 0 && (
                <span className="absolute right-3 top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-400 px-1 text-[10px] font-extrabold text-emerald-950">
                  {chatUnread > 9 ? "٩+" : chatUnread.toLocaleString("ar-EG")}
                </span>
              )}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
