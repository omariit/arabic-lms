"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, Input, Label, Select } from "@/components/ui/primitives";
import { COUNTRIES } from "@/lib/phone";
import { LangSwitcher } from "@/components/lang-switcher";

export default function LoginPage() {
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
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, password, countryCode: country }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "فشل تسجيل الدخول");
      router.replace(data.redirect ?? "/dashboard");
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
      <Card>
        <CardContent className="p-6">
          <h1 className="mb-1 text-center text-2xl font-extrabold">تسجيل الدخول</h1>
          <p className="mb-6 text-center text-sm text-gray-500">بالهاتف وكلمة المرور — جلسة على جهاز واحد فقط</p>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-[1fr_2fr] gap-2">
              <div>
                <Label htmlFor="country">المفتاح</Label>
                <Select id="country" value={country} onChange={(e) => setCountry(e.target.value)}>
                  {COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>{c.nameAr} (+{c.dial})</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="phone">رقم الهاتف</Label>
                <Input id="phone" dir="ltr" inputMode="tel" placeholder="0787262186" value={phone} onChange={(e) => setPhone(e.target.value)} required />
              </div>
            </div>
            <div>
              <Label htmlFor="password">كلمة المرور</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            {error && <p className="rounded-lg bg-red-50 p-3 text-sm font-bold text-red-600">{error}</p>}
            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              {loading ? "جارٍ الدخول…" : "دخول"}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm">
            ليس لديك حساب؟ <Link href="/register" className="font-bold text-brand-600 underline">سجّلي الآن</Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}

function LangSwitcherWithFallback() {
  return <LangSwitcher current={(typeof document !== "undefined" && (document.cookie.match(/lang=(en|ar)/)?.[1] as "en" | "ar")) || "ar"} />;
}
