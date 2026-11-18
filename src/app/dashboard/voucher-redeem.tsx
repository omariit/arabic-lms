"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, Input } from "@/components/ui/primitives";

export function VoucherRedeem() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const redeem = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch("/api/student/voucher", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "فشل التفعيل");
      setMsg({ ok: true, text: `تم تفعيل الوصول إلى: ${data.courseTitle}` });
      setCode("");
      router.refresh();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "خطأ" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardContent>
        <form onSubmit={redeem} className="flex gap-2">
          <Input dir="ltr" placeholder="XXXXXXXX" value={code} onChange={(e) => setCode(e.target.value)} required />
          <Button type="submit" disabled={loading}>{loading ? "…" : "تفعيل"}</Button>
        </form>
        {msg && <p className={`mt-3 rounded-lg p-3 text-sm font-bold ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>{msg.text}</p>}
      </CardContent>
    </Card>
  );
}
