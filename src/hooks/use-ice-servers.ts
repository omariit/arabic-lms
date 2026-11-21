"use client";

import { useEffect, useState } from "react";

/**
 * ICE configuration shared by both rooms.
 *
 * The server issues short-lived TURN credentials (`/api/webrtc/ice`); the static
 * env pair is kept as a fallback so an older deployment keeps working. STUN alone
 * is used until the answer arrives, which is enough on most home networks.
 */
const FALLBACK: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

export function useIceServers(): RTCConfiguration {
  const [config, setConfig] = useState<RTCConfiguration>(FALLBACK);

  useEffect(() => {
    let alive = true;
    fetch("/api/webrtc/ice", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!alive || !data?.iceServers?.length) return;
        setConfig({ iceServers: data.iceServers });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  return config;
}
