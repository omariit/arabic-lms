"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, Input, Label, Select } from "@/components/ui/primitives";
import { COUNTRIES } from "@/lib/phone";
import { LangSwitcher } from "@/components/lang-switcher";

export default function RegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [country, setCountry] = useState("JO");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, phone, password, countryCode: country }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "فشل التسجيل");
      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطأ");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4">
      <div className="mb-4 flex justify-center">
        <LangSwitcher current={(typeof document !== "undefined" && (document.cookie.match(/lang=(en|ar)/)?.[1] as "en" | "ar")) || "ar"} />
      </div>
      <Card className="w-full min-w-0">
        <CardContent className="w-full min-w-0 p-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.webp" width={400} height={322} fetchPriority="high" alt="مُقْرِئَة" className="mx-auto mb-4 h-20 w-auto" />
          <h1 className="mb-1 text-center text-2xl font-extrabold">حساب جديد</h1>
          <p className="mb-6 text-center text-sm text-gray-500">اسمك ورقم هاتفك سيظهران كعلامة مائية على الفيديو</p>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label htmlFor="fullName">الاسم الكامل</Label>
              <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} required minLength={3} />
            </div>
            <div>
              <Label htmlFor="country">الدولة</Label>
              <Select id="country" value={country} onChange={(e) => setCountry(e.target.value)}>
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>+{c.dial} {c.nameAr}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="phone">رقم الهاتف</Label>
              <Input id="phone" dir="ltr" inputMode="tel" placeholder="0787262186" value={phone} onChange={(e) => setPhone(e.target.value)} required />
              <p className="mt-1 text-[11px] text-gray-400">يكتبين الرقم كما تعرفينه — سنضيف مفتاح الدولة تلقائيًا</p>
            </div>
            <div>
              <Label htmlFor="password">كلمة المرور</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            </div>
            {error && <p className="rounded-lg bg-red-50 p-3 text-sm font-bold text-red-600">{error}</p>}
            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              {loading ? "جارٍ التسجيل…" : "إنشاء الحساب"}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm">
            لديك حساب؟ <Link href="/login" className="font-bold text-brand-600 underline">تسجيل الدخول</Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
