"use client";

import { useEffect, useState } from "react";
import { MeetingRoom } from "@/components/meeting-room";
import { GuestEntry } from "./guest-entry";

/**
 * Invited-guest path: the guest types a display name (kept in sessionStorage),
 * then the room loads with the invite token — the host still admits her from the lobby.
 */
export function GuestMeeting({
  liveId, title, courseTitle, inviteToken,
}: {
  liveId: string;
  title: string;
  courseTitle: string;
  inviteToken: string;
}) {
  const [name, setName] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const saved = sessionStorage.getItem(`guest-${liveId}`);
    if (saved) setName(saved);
    setReady(true);
  }, [liveId]);

  if (!ready) return null;

  if (!name) {
    return <GuestEntry liveId={liveId} title={title} onEnter={(n) => setName(n)} />;
  }

  return (
    <MeetingRoom
      liveId={liveId}
      title={title}
      courseTitle={courseTitle}
      viewer={{ role: "GUEST", name, isGuest: true }}
      inviteToken={inviteToken}
      initialChat={[]}
    />
  );
}
