"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, Input, Label } from "@/components/ui/primitives";

export default function LoginPage() {
  const router = useRouter();
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
        body: JSON.stringify({ phone, password }),
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

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4">
      <Card>
        <CardContent className="p-6">
          <h1 className="mb-1 text-center text-2xl font-extrabold">تسجيل الدخول</h1>
          <p className="mb-6 text-center text-sm text-gray-500">بالهاتف وكلمة المرور — جلسة على جهاز واحد فقط</p>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label htmlFor="phone">رقم الهاتف</Label>
              <Input id="phone" dir="ltr" inputMode="tel" placeholder="07xxxxxxxx" value={phone} onChange={(e) => setPhone(e.target.value)} required />
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
