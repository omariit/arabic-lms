"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { uploadToR2 } from "@/lib/upload-client";
import { Card, CardContent, Input, Label, Textarea } from "@/components/ui/primitives";

/** Paid-enrollment flow: shows country-specific price + financial details + WhatsApp, then receipt reference. */
export function EnrollActions({ courseId, price, currency, monthly, viewerCountry, pendingRequest, cliqAlias, bankHint, waHref }: {
  courseId: string;
  price: number;
  currency: string;
  monthly: string;
  viewerCountry: string;
  pendingRequest: boolean;
  cliqAlias?: string | null;
  bankHint?: string | null;
  waHref?: string | null;
}) {
  const [tab, setTab] = useState<"request" | "voucher">("request");
  const [receiptRef, setReceiptRef] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const priceLine = price === 0 ? "مجانية" : currency === "$" ? `$${price}` : `${price} ${currency}`;

  const submitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setMsg(null);
    try {
      // Screenshot goes browser → R2 directly; only its key is sent with the request.
      let receiptKey: string | undefined;
      if (receiptFile) {
        const up = await uploadToR2(receiptFile, { kind: "receipt", mimeType: receiptFile.type, filename: receiptFile.name });
        receiptKey = up.key;
      }
      const res = await fetch("/api/student/enroll-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId, receiptRef, receiptKey, note, expectedPrice: price, countryCode: viewerCountry }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMsg({ ok: true, text: "تم إرسال الطلب — بانتظار موافقة المعلمة" });
      setReceiptRef("");
      setReceiptFile(null);
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
    <Card className="border-emerald-200">
      <CardContent>
        {/* Payment box — shown first: choosing the course requires payment */}
        {price > 0 && (
          <div className="mb-4 rounded-2xl bg-emerald-50 p-4">
            <p className="text-sm font-extrabold text-emerald-900">
              💳 بيانات الدفع — {priceLine} {monthly}
            </p>
            {cliqAlias ? (
              <p className="mt-2 rounded-lg bg-white p-2.5 text-sm font-bold" dir="ltr">CliQ / CLiQ Alias: <span className="text-emerald-700">{cliqAlias}</span></p>
            ) : bankHint ? (
              <p className="mt-2 rounded-lg bg-white p-2.5 text-sm">{bankHint}</p>
            ) : (
              <p className="mt-2 text-xs text-emerald-800/70">ستصلك بيانات التحويل من الإدارة عبر واتساب بعد اختيار الدورة</p>
            )}
            {waHref && (
              <a href={waHref} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block">
                <Button size="sm" className="bg-[#25D366] hover:bg-[#1ebe57]">💬 تواصلي مع الإدارة على واتساب</Button>
              </a>
            )}
            <p className="mt-2 text-[11px] text-emerald-800/60">بعد الدفع: أرسلي رقم الإيصال هنا، وتفعّل حسابك بعد موافقة المعلمة</p>
          </div>
        )}

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
                <div>
                  <Label htmlFor="receipt">مرجع الإيصال / رقم الحوالة</Label>
                  <Input id="receipt" value={receiptRef} onChange={(e) => setReceiptRef(e.target.value)} required />
                </div>
                <div>
                  <Label htmlFor="receiptFile">صورة الإيصال (اختياري)</Label>
                  <input
                    id="receiptFile"
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
                    className="block w-full rounded-xl border border-gray-200 bg-white p-2 text-sm file:me-3 file:rounded-lg file:border-0 file:bg-emerald-600 file:px-3 file:py-1.5 file:text-white"
                  />
                  <p className="mt-1 text-[11px] text-gray-500">تُرفع الصورة من جهازك مباشرة إلى التخزين — لا تمرّ عبر الخادم.</p>
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
