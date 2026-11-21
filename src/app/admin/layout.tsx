import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { PushManager } from "@/components/push-manager";
import { InstallPrompt } from "@/components/install-prompt";
import { LogoutButton } from "@/components/logout-button";
import { StaffNav } from "@/components/staff-nav";

const NAV = [
  { href: "/admin/chat", label: "الرسائل", icon: "📨", staff: true, badge: "chat", primary: true },
  { href: "/admin/inbox", label: "الواجبات", icon: "📥", staff: true, badge: "homework", primary: true },
  { href: "/admin", label: "الرئيسية", icon: "🏠", teacher: true, primary: true },
  { href: "/admin/studio", label: "استوديو التسجيل", icon: "🎬", teacher: true },
  { href: "/admin/recordings", label: "تسجيلات الحصص", icon: "📼", teacher: true },
  { href: "/admin/live", label: "الحصص المباشرة", icon: "🔴", teacher: true, primary: true },
  { href: "/admin/grading", label: "التصحيح", icon: "🎤", teacher: true },
  { href: "/admin/enrollments", label: "طلبات الانتساب", icon: "✅", teacher: true },
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
  let homeworkUnread = 0;
  try {
    const [chats, lessons] = await Promise.all([
      db.conversation.count({ where: { staffUnread: { gt: 0 } } }),
      db.lessonThread.count({ where: { staffUnread: { gt: 0 } } }),
    ]);
    chatUnread = chats;
    homeworkUnread = lessons;
  } catch { /* cold start */ }

  const nav = NAV.filter((n) => {
    if (isAssistant) return n.staff;
    if (n.adminOnly && !isAdmin) return false;
    return n.teacher !== false;
  });
  const count = (badge?: string) => (badge === "homework" ? homeworkUnread : badge === "chat" ? chatUnread : 0);
  const toItem = (n: (typeof NAV)[number]) => ({ href: n.href, label: n.label, icon: n.icon, badge: count("badge" in n ? (n.badge as string) : undefined) });

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

      <StaffNav
        primary={nav.filter((n) => n.primary).map(toItem)}
        more={nav.filter((n) => !n.primary).map(toItem)}
      />
    </div>
  );
}
