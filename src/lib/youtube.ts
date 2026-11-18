import { google } from "googleapis";
import { db } from "@/lib/db";

/** OAuth client configured for the teacher's YouTube channel (offline refresh token). */
export function youtubeOAuthClient(redirectUri: string) {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
  );
}

const SCOPES = ["https://www.googleapis.com/auth/youtube"];

export function youtubeAuthUrl(redirectUri: string, state: string) {
  const client = youtubeOAuthClient(redirectUri);
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    state,
  });
}

/** Store the teacher's refresh token (single row, keyed by channel id). */
export async function saveTeacherToken(refreshToken: string, channelId: string, scope: string) {
  await db.teacherOAuthToken.upsert({
    where: { channelId },
    update: { refreshToken, scope },
    create: { channelId, refreshToken, scope },
  });
}

/** Authorized YouTube client using the stored refresh token. */
export async function youtubeClient() {
  const token = await db.teacherOAuthToken.findFirst();
  if (!token) throw new Error("TEACHER_OAUTH_MISSING");
  const client = youtubeOAuthClient(process.env.NEXT_PUBLIC_APP_URL || "");
  client.setCredentials({ refresh_token: token.refreshToken });
  const { credentials } = await client.refreshAccessToken();
  client.setCredentials(credentials);
  return client;
}

export type BroadcastResult = { videoId: string; streamKey: string; broadcastId: string };

/**
 * One-click live launcher: create an Unlisted+embeddable broadcast, bind a fresh
 * stream, and return everything the teacher needs (videoId + RTMP key deep link).
 */
export async function createLiveBroadcast(title: string, scheduledStart: Date): Promise<BroadcastResult> {
  const auth = await youtubeClient();
  const yt = google.youtube({ version: "v3", auth });

  const stream = await yt.liveStreams.insert({
    part: ["snippet", "cdn"],
    requestBody: {
      snippet: { title: `${title} — بث` },
      cdn: { ingestionType: "rtmp", resolution: "1080p", frameRate: "30fps" },
    },
  });
  const streamId = stream.data.id as string;
  const streamKey = (stream.data.cdn?.ingestionInfo?.streamName as string) ?? "";

  const broadcast = await yt.liveBroadcasts.insert({
    part: ["snippet", "status", "contentDetails"],
    requestBody: {
      snippet: {
        title,
        scheduledStartTime: scheduledStart.toISOString(),
      },
      status: {
        privacyStatus: "unlisted",
        selfDeclaredMadeForKids: false,
      },
      contentDetails: {
        enableAutoStart: true,
        enableAutoStop: true,
        enableDvr: true,
        enableEmbed: true,
      },
    },
  });
  const broadcastId = broadcast.data.id as string;

  await yt.liveBroadcasts.bind({
    id: broadcastId,
    part: ["id", "contentDetails"],
    streamId,
  });

  const videoId = broadcast.data.id as string; // broadcast id == videoId for live embeds
  return { videoId, streamKey, broadcastId };
}

/** Transition the broadcast to complete once the class ends. */
export async function endLiveBroadcast(broadcastId: string) {
  try {
    const auth = await youtubeClient();
    const yt = google.youtube({ version: "v3", auth });
    await yt.liveBroadcasts.transition({
      id: broadcastId,
      part: ["id", "status"],
      broadcastStatus: "complete",
    });
  } catch {
    // The broadcast may already be complete/transitioning; end-of-class must not fail the API.
  }
}

/** Public deep link that opens the YouTube app/broadcast screen on the teacher's phone. */
export function broadcastAppUrl(streamKey: string): string {
  return `youtube://studio.youtube.com?stream_key=${encodeURIComponent(streamKey)}`;
}
