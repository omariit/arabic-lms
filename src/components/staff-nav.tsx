"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type StaffNavItem = {
  href: string;
  label: string;
  icon: string;
  badge?: number;
};

/**
 * Staff bottom navigation.
 *
 * Eleven items in one row turned into unreadable overlapping labels on a phone.
 * Now the four most used screens stay on the bar, everything else lives behind
 * «المزيد» in a full-width sheet with 48px rows. On tablets/desktop the bar shows
 * every item at once because there is room.
 */
export function StaffNav({ primary, more }: { primary: StaffNavItem[]; more: StaffNavItem[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);

  const totalBadge = more.reduce((n, i) => n + (i.badge ?? 0), 0);

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={() => setOpen(false)}>
          <div
            className="max-h-[75dvh] w-full overflow-y-auto rounded-t-3xl bg-white p-4 pb-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-extrabold text-brand-950">كل الأدوات</p>
              <button type="button" onClick={() => setOpen(false)} className="h-10 rounded-xl bg-brand-50 px-4 text-xs font-extrabold text-brand-800">
                إغلاق
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {more.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={`flex min-h-12 items-center gap-2 rounded-2xl px-3 py-3 text-xs font-extrabold transition ${
                    isActive(item.href) ? "bg-brand-600 text-white" : "bg-brand-50 text-brand-900"
                  }`}
                >
                  <span className="text-lg">{item.icon}</span>
                  <span className="min-w-0 flex-1">{item.label}</span>
                  {item.badge ? (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-400 px-1 text-[11px] font-extrabold text-emerald-950">
                      {item.badge > 9 ? "٩+" : item.badge.toLocaleString("ar-EG")}
                    </span>
                  ) : null}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-brand-100 bg-white shadow-lg">
        {/* phone: four screens + المزيد */}
        <div className="mx-auto grid max-w-3xl grid-cols-5 sm:hidden">
          {primary.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[11px] font-bold ${
                isActive(item.href) ? "text-brand-700" : "text-brand-900"
              }`}
            >
              <span className="text-xl">{item.icon}</span>
              {item.label}
              {item.badge ? (
                <span className="absolute right-2 top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-400 px-1 text-[11px] font-extrabold text-emerald-950">
                  {item.badge > 9 ? "٩+" : item.badge.toLocaleString("ar-EG")}
                </span>
              ) : null}
            </Link>
          ))}
          <button
            type="button"
            aria-haspopup="dialog"
            aria-expanded={open}
            onClick={() => setOpen(true)}
            className="relative flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[11px] font-bold text-brand-900"
          >
            <span className="text-xl">☰</span>
            المزيد
            {totalBadge > 0 && (
              <span className="absolute right-2 top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-400 px-1 text-[11px] font-extrabold text-emerald-950">
                {totalBadge > 9 ? "٩+" : totalBadge.toLocaleString("ar-EG")}
              </span>
            )}
          </button>
        </div>

        {/* tablet/desktop: everything, one row */}
        <div className="mx-auto hidden max-w-3xl sm:block">
          <div className="grid" style={{ gridTemplateColumns: `repeat(${primary.length + more.length}, minmax(0, 1fr))` }}>
            {[...primary, ...more].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`relative flex min-h-16 flex-col items-center justify-center gap-0.5 px-1 py-3 text-[11px] font-bold ${
                  isActive(item.href) ? "bg-brand-50 text-brand-700" : "text-brand-900 hover:bg-brand-50"
                }`}
              >
                <span className="text-xl">{item.icon}</span>
                {item.label}
                {item.badge ? (
                  <span className="absolute right-1.5 top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-400 px-1 text-[11px] font-extrabold text-emerald-950">
                    {item.badge > 9 ? "٩+" : item.badge.toLocaleString("ar-EG")}
                  </span>
                ) : null}
              </Link>
            ))}
          </div>
        </div>
      </nav>
    </>
  );
}
