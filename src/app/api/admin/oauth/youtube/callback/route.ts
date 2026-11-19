import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { youtubeOAuthClient, saveTeacherToken } from "@/lib/youtube";

/** OAuth callback: exchange the consent code for a refresh token and store it securely. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role === "STUDENT") {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin}/login`);
  }
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (!code) return NextResponse.redirect(`${url.origin}/admin/profile?oauth=error`);

  // CSRF guard: the state issued when consent started must match the httpOnly cookie.
  const jar = await cookies();
  const expectedState = jar.get("yt_oauth_state")?.value;
  const gotState = url.searchParams.get("state");
  if (!expectedState || !gotState || expectedState !== gotState) {
    return NextResponse.redirect(`${url.origin}/admin/profile?oauth=state_mismatch`);
  }
  jar.delete("yt_oauth_state");

  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || url.origin;
    const client = youtubeOAuthClient(`${appUrl}/api/admin/oauth/youtube/callback`);
    const { tokens } = await client.getToken(code);
    if (!tokens.refresh_token) throw new Error("لم يُرجع Google refresh_token — أعد الربط وفعّل الموافقة الكاملة");

    const info = await client.getTokenInfo(tokens.access_token!);
    const channelId = info.sub || `channel-${Date.now()}`;
    await saveTeacherToken(tokens.refresh_token, channelId, info.scopes?.join(" ") || "youtube");
    return NextResponse.redirect(`${appUrl}/admin/profile?oauth=connected`);
  } catch (e) {
    console.error("YouTube OAuth exchange failed:", e instanceof Error ? e.message : e);
    return NextResponse.redirect(`${url.origin}/admin/profile?oauth=error`);
  }
}
