import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { youtubeOAuthClient, saveTeacherToken } from "@/lib/youtube";

/** OAuth callback: exchange the consent code for a refresh token and store it securely. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  // Behind Railway's proxy req.url can resolve to the internal host; always
  // prefer the public app URL for user-facing redirects.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || url.origin;
  const user = await getCurrentUser();
  if (!user || user.role === "STUDENT") {
    return NextResponse.redirect(`${appUrl}/login`);
  }
  const code = url.searchParams.get("code");
  if (!code) return NextResponse.redirect(`${appUrl}/admin/profile?oauth=error`);

  // CSRF guard: the state issued when consent started must match the httpOnly cookie.
  const jar = await cookies();
  const expectedState = jar.get("yt_oauth_state")?.value;
  const gotState = url.searchParams.get("state");
  if (!expectedState || !gotState || expectedState !== gotState) {
    return NextResponse.redirect(`${appUrl}/admin/profile?oauth=state_mismatch`);
  }
  jar.delete("yt_oauth_state");

  try {
    const client = youtubeOAuthClient(`${appUrl}/api/admin/oauth/youtube/callback`);
    const { tokens } = await client.getToken(code);
    if (!tokens.refresh_token) throw new Error("لم يُرجع Google refresh_token — أعد الربط وفعّل الموافقة الكاملة");

    const info = await client.getTokenInfo(tokens.access_token!);
    const channelId = info.sub || `channel-${Date.now()}`;
    await saveTeacherToken(tokens.refresh_token, channelId, info.scopes?.join(" ") || "youtube");
    return NextResponse.redirect(`${appUrl}/admin/profile?oauth=connected`);
  } catch (e) {
    console.error("YouTube OAuth exchange failed:", e instanceof Error ? e.message : e);
    return NextResponse.redirect(`${appUrl}/admin/profile?oauth=error`);
  }
}
