"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, Input, Label, Textarea, Badge } from "@/components/ui/primitives";

type Profile = {
  displayName: string; title: string; bio: string; methodology: string;
  achievements: string; photoUrl?: string; cliqAlias?: string; bankHint?: string;
};

/** Teacher profile + YouTube channel OAuth connect (needed for one-click live). */
export function ProfileClient() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [youtubeConnected, setYoutubeConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/admin/profile").then(async (r) => {
      const data = await r.json();
      if (data.profile) setProfile(data.profile);
      setYoutubeConnected(Boolean(data.youtubeConnected));
    });
    const params = new URLSearchParams(window.location.search);
    if (params.get("oauth") === "connected") setMsg({ ok: true, text: "✓ تم ربط قناة يوتيوب بنجاح" });
    if (params.get("oauth") === "error") setMsg({ ok: false, text: "فشل ربط يوتيوب — تأكدي من إعدادات OAuth ثم أعيدي المحاولة" });
  }, []);

  const save = async () => {
    if (!profile) return;
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/admin/profile", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      if (!res.ok) throw new Error("فشل الحفظ");
      setMsg({ ok: true, text: "تم الحفظ ✓" });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "خطأ" });
    } finally { setBusy(false); }
  };

  const connectYouTube = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/oauth/youtube?action=start");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "غير مهيأ");
      window.location.href = data.authUrl;
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "خطأ" });
      setBusy(false);
    }
  };

  if (!profile) return <p className="text-center text-gray-500">جارٍ التحميل…</p>;

  const set = (k: keyof Profile) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setProfile({ ...profile, [k]: e.target.value });

  return (
    <div className="space-y-4">
      <Card className={youtubeConnected ? "border-emerald-200" : "border-amber-200"}>
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold">📺 قناة يوتيوب (للحصص المباشرة بضغطة واحدة)</span>
            <Badge tone={youtubeConnected ? "green" : "amber"}>{youtubeConnected ? "مربوطة" : "غير مربوطة"}</Badge>
          </div>
          {!youtubeConnected && (
            <Button size="lg" className="mt-3 w-full" onClick={connectYouTube} disabled={busy}>
              ربط القناة عبر Google
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 pt-5">
          <div><Label>الاسم الظاهر</Label><Input value={profile.displayName} onChange={set("displayName")} /></div>
          <div><Label>الوصف (مثل: معلمة رياضيات)</Label><Input value={profile.title} onChange={set("title")} /></div>
          <div><Label>نبذة</Label><Textarea value={profile.bio} onChange={set("bio")} /></div>
          <div><Label>منهجيتي في التعليم</Label><Textarea value={profile.methodology} onChange={set("methodology")} /></div>
          <div><Label>الإنجازات (سطر لكل إنجاز)</Label><Textarea value={profile.achievements} onChange={set("achievements")} /></div>
          <div><Label>CliQ Alias (لطلبات التسجيل)</Label><Input dir="ltr" value={profile.cliqAlias ?? ""} onChange={set("cliqAlias")} /></div>
          <div><Label>ملاحظة تحويل بنكي</Label><Input value={profile.bankHint ?? ""} onChange={set("bankHint")} /></div>

          <Button size="lg" className="w-full" onClick={save} disabled={busy}>{busy ? "…" : "حفظ"}</Button>
          {msg && <p className={`rounded-lg p-3 text-sm font-bold ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>{msg.text}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
