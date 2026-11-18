import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { LogoutButton } from "@/components/logout-button";

const NAV = [
  { href: "/admin", label: "الرئيسية", icon: "🏠" },
  { href: "/admin/live", label: "بث مباشر", icon: "🔴" },
  { href: "/admin/grading", label: "التصحيح", icon: "🎤" },
  { href: "/admin/enrollments", label: "التسجيلات", icon: "✅" },
  { href: "/admin/profile", label: "إعداداتي", icon: "⚙️" },
];

/** Mobile-first teacher shell: large touch targets, sticky bottom nav. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();

  return (
    <div className="min-h-dvh pb-24">
      <header className="sticky top-0 z-40 bg-brand-600 text-white shadow">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div>
            <p className="text-sm font-extrabold">👩‍🏫 لوحة المعلمة</p>
            <p className="text-xs text-white/70">{admin.fullName}</p>
          </div>
          <LogoutButton />
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 pt-4">{children}</div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-brand-100 bg-white shadow-lg">
        <div className="mx-auto grid max-w-3xl grid-cols-5">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="flex flex-col items-center gap-0.5 py-3 text-[11px] font-bold text-brand-900 hover:bg-brand-50">
              <span className="text-xl">{n.icon}</span>
              {n.label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
