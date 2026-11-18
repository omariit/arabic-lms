"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, Input, Label, Textarea } from "@/components/ui/primitives";

/** Enrollment CTA: CliQ/bank receipt request OR single-use voucher code. */
export function EnrollActions({ courseId, price, pendingRequest, cliqAlias, bankHint }: {
  courseId: string;
  price: number;
  pendingRequest: boolean;
  cliqAlias?: string | null;
  bankHint?: string | null;
}) {
  const [tab, setTab] = useState<"request" | "voucher">("request");
  const [receiptRef, setReceiptRef] = useState("");
  const [note, setNote] = useState("");
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const submitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setMsg(null);
    try {
      const res = await fetch("/api/student/enroll-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId, receiptRef, note }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMsg({ ok: true, text: "تم إرسال الطلب — بانتظار موافقة المعلمة" });
      setReceiptRef("");
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "خطأ" });
    } finally { setLoading(false); }
  };

  const redeemVoucher = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setMsg(null);
    try {
      const res = await fetch("/api/student/voucher", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMsg({ ok: true, text: `تم التفعيل: ${data.courseTitle}` });
      setCode("");
      window.location.reload();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "خطأ" });
    } finally { setLoading(false); }
  };

  return (
    <Card className="border-brand-200">
      <CardContent>
        <div className="mb-4 flex gap-2">
          <Button size="sm" variant={tab === "request" ? "default" : "outline"} onClick={() => setTab("request")}>إيصال تحويل</Button>
          <Button size="sm" variant={tab === "voucher" ? "default" : "outline"} onClick={() => setTab("voucher")}>كوبون</Button>
        </div>

        {tab === "request" ? (
          <>
            {pendingRequest ? (
              <p className="rounded-lg bg-amber-50 p-3 text-sm font-bold text-amber-700">⏳ طلبك قيد المراجعة</p>
            ) : (
              <form onSubmit={submitRequest} className="space-y-3">
                {price > 0 && (cliqAlias || bankHint) && (
                  <div className="rounded-lg bg-brand-50 p-3 text-xs leading-6 text-brand-900">
                    {cliqAlias && <p><b>CliQ:</b> {cliqAlias}</p>}
                    {bankHint && <p><b>ملاحظة:</b> {bankHint}</p>}
                  </div>
                )}
                <div>
                  <Label htmlFor="receipt">مرجع الإيصال / رقم الحوالة</Label>
                  <Input id="receipt" value={receiptRef} onChange={(e) => setReceiptRef(e.target.value)} required />
                </div>
                <div>
                  <Label htmlFor="note">ملاحظة (اختياري)</Label>
                  <Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} className="min-h-[70px]" />
                </div>
                <Button type="submit" size="lg" className="w-full" disabled={loading}>
                  {loading ? "…" : "إرسال طلب التسجيل"}
                </Button>
              </form>
            )}
          </>
        ) : (
          <form onSubmit={redeemVoucher} className="space-y-3">
            <div>
              <Label htmlFor="code">رمز الكوبون</Label>
              <Input id="code" dir="ltr" value={code} onChange={(e) => setCode(e.target.value)} required />
            </div>
            <Button type="submit" size="lg" className="w-full" disabled={loading}>{loading ? "…" : "تفعيل الكوبون"}</Button>
          </form>
        )}
        {msg && <p className={`mt-3 rounded-lg p-3 text-sm font-bold ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>{msg.text}</p>}
      </CardContent>
    </Card>
  );
}
