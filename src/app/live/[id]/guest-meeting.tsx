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

  // Restore a name the guest already used in this tab (no server round-trip).
  useEffect(() => {
    const saved = sessionStorage.getItem(`guest-${liveId}`);
    if (saved) setName(saved);
  }, [liveId]);

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
