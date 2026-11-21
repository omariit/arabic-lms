"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, Input, Label, Select } from "@/components/ui/primitives";
import { COUNTRIES } from "@/lib/phone";
import { LangSwitcher } from "@/components/lang-switcher";

export function LoginForm({
  supportWhatsapp = "",
  stagingBanner = false,
  initialError = null,
  initialNext = "",
  initialExpired = false,
}: {
  supportWhatsapp?: string;
  stagingBanner?: boolean;
  initialError?: string | null;
  initialNext?: string;
  initialExpired?: boolean;
}) {
  const [country, setCountry] = useState("JO");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(initialError);
  const [loading, setLoading] = useState(false);
  const [expired, setExpired] = useState(initialExpired);
  // A tap that lands before React hydrates used to submit the raw form (empty
  // fields, or a GET that put the password in the URL). Gate the button instead.
  const [hydrated, setHydrated] = useState(false);
  // Showing the password prevents the most common real-world failure: an Arabic
  // keyboard layout or an unseen trailing space producing a "wrong password".
  const [showPassword, setShowPassword] = useState(false);
  const [nextPath, setNextPath] = useState(initialNext);

  // Arriving from a dead session (SessionGuard redirect or ?expired=1) or from the
  // no-JavaScript form POST (?error=no-account / bad-password / rate / …).
  useEffect(() => {
    setHydrated(true);
    const q = new URLSearchParams(window.location.search);
    if (q.has("expired")) setExpired(true);

    const nextParam = q.get("next");
    if (nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//")) {
      setNextPath(nextParam);
    }

    // Old cached forms (no action attribute) submitted a GET with the password in
    // the URL. Strip it immediately instead of leaving it in history.
    if (q.has("password")) {
      window.history.replaceState({}, "", "/login?expired=0");
      setError("حدّثي الصفحة (إعادة تحميل) ثم حاولي الدخول من جديد");
    }
  }, []);

  const submit = async (e: React.FormEvent) => {
    // Without a hydrated handler the browser posts the form natively to
    // /api/auth/login-form, which redirects with a readable ?error=code.
    if (!hydrated) return;
    e.preventDefault();
    if (!phone.trim() || !password) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, password, countryCode: country }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "فشل تسجيل الدخول");
      const next = new URLSearchParams(window.location.search).get("next");
      const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : null;
      router.replace(safeNext ?? data.redirect ?? "/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطأ");
    } finally {
      setLoading(false);
    }
  };

  const router = useRouter();

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4">
      <div className="mb-4 flex justify-center"><LangSwitcherWithFallback /></div>
      <Card className="w-full min-w-0">
        <CardContent className="w-full min-w-0 p-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="مُقْرِئَة" className="mx-auto mb-4 h-20 w-auto" />
          {stagingBanner && (
            <p className="mb-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-center text-[11px] font-bold text-amber-900">
              بيئة تجريبية (Staging) — الحسابات هنا ليست حسابات الموقع الحقيقي
            </p>
          )}
          <h1 className="mb-1 text-center text-2xl font-extrabold">تسجيل الدخول</h1>
          <p className="mb-6 text-center text-sm text-gray-500">بالهاتف وكلمة المرور — جلسة على جهاز واحد فقط</p>
          <form
            onSubmit={submit}
            method="post"
            action="/api/auth/login-form"
            className="space-y-4"
            data-testid="login-form"
          >
            <input type="hidden" name="countryCode" value={country} />
            <input type="hidden" name="next" value={nextPath} />
            <div className="grid min-w-0 grid-cols-[1fr_2fr] gap-2">
              <div className="min-w-0">
                <Label htmlFor="country">المفتاح</Label>
                <Select id="country" className="px-2 text-sm" value={country} onChange={(e) => setCountry(e.target.value)}>
                  {COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>+{c.dial} {c.nameAr}</option>
                  ))}
                </Select>
              </div>
              <div className="min-w-0">
                <Label htmlFor="phone">رقم الهاتف</Label>
                <Input
                  id="phone"
                  name="phone"
                  dir="ltr"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="0787262186"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="password">كلمة المرور</Label>
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="mb-1 text-[11px] font-bold text-brand-600 underline"
                  aria-label={showPassword ? "إخفاء الحقل" : "إظهار الحقل"}
                >
                  {showPassword ? "إخفاء" : "إظهار"}
                </button>
              </div>
              <Input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                dir="ltr"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              {password !== password.trim() && (
                <p className="mt-1 text-[11px] font-bold text-amber-700">
                  في كلمة المرور مسافة في البداية أو النهاية — لن تُحتسب عند التحقق.
                </p>
              )}
            </div>
            {expired && !error && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-900">
                انتهت جلستك أو تم الدخول من جهاز آخر. سجّلي الدخول من جديد — لا شيء ضاع.
              </p>
            )}
            {error && <p className="rounded-lg bg-red-50 p-3 text-sm font-bold text-red-600">{error}</p>}
            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              {loading ? "جارٍ الدخول…" : "دخول"}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm">
            ليس لديك حساب؟ <Link href="/register" className="font-bold text-brand-600 underline">سجّلي الآن</Link>
          </p>
          <p className="mt-2 text-center text-xs text-gray-500">
            نسيتِ كلمة المرور؟{" "}
            {supportWhatsapp ? (
              <a
                href={`https://wa.me/${supportWhatsapp.replace(/\D/g, "")}?text=${encodeURIComponent("السلام عليكم، نسيت كلمة المرور وأحتاج كلمة جديدة")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold text-emerald-700 underline"
              >
                اطلبي كلمة مرور جديدة على واتساب
              </a>
            ) : (
              <span>اطلبي من المعلمة تعيين كلمة مرور جديدة من صفحة «الطالبات».</span>
            )}
          </p>
        </CardContent>
      </Card>
    </main>
  );
}

function LangSwitcherWithFallback() {
  return <LangSwitcher current={(typeof document !== "undefined" && (document.cookie.match(/lang=(en|ar)/)?.[1] as "en" | "ar")) || "ar"} />;
}
