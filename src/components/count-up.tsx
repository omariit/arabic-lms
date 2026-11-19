"use client";

import { useEffect, useRef, useState } from "react";

/** Animated count-up that fires when scrolled into view (sanad-style stats). */
export function CountUp({ to, suffix = "", duration = 1600, arabicIndic = false }: {
  to: number; suffix?: string; duration?: number; arabicIndic?: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [value, setValue] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !started.current) {
          started.current = true;
          const t0 = performance.now();
          const tick = (now: number) => {
            const p = Math.min(1, (now - t0) / duration);
            // easeOutCubic
            const eased = 1 - Math.pow(1 - p, 3);
            setValue(Math.round(to * eased));
            if (p < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
      },
      { threshold: 0.4 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [to, duration]);

  const display = arabicIndic
    ? value.toLocaleString("ar-EG")
    : value.toLocaleString("en-US");

  return (
    <span ref={ref}>
      {display}
      {suffix}
    </span>
  );
}
