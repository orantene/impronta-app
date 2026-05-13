"use client";

import { useEffect, useState } from "react";
import { SpeedInsights } from "@vercel/speed-insights/next";

/**
 * BUG-009 — `@vercel/speed-insights` injects a same-origin script that can 404
 * or return `text/plain` on some hosts, tripping MIME checks and noisy
 * hydration-adjacent failures. Mount only after client hydration so the
 * server HTML stays stable (see React #418 triage in phase-0 doc).
 */
export function ClientSpeedInsights() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted) return null;
  return <SpeedInsights />;
}
