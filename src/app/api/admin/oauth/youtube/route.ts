import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/auth";
import { youtubeAuthUrl } from "@/lib/youtube";

/**
 * YouTube OAuth connect for the teacher's channel.
 * GET ?action=start → Google consent URL (refresh_token via offline access)
 */
export async function GET(req: Request) {
  const { error } = await apiUser("TEACHER");
  if (error) return error;

  const url = new URL(req.url);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || url.origin;
  const redirectUri = `${appUrl}/api/admin/oauth/youtube/callback`;

  if (url.searchParams.get("action") === "start") {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return NextResponse.json({ error: "Google OAuth غير مهيأ على الخادم" }, { status: 503 });
    }
    const state = Math.random().toString(36).slice(2);
    return NextResponse.json({ authUrl: youtubeAuthUrl(redirectUri, state), redirectUri });
  }

  const token = await db.teacherOAuthToken.findFirst();
  return NextResponse.json({ connected: Boolean(token), connectedAt: token?.connectedAt ?? null });
}
