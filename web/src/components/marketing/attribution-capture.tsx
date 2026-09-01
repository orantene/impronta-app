"use client";

import { useEffect } from "react";
import { captureFirstTouch } from "@/lib/marketing/first-touch-attribution";

/**
 * Records where the visit came from, once, on the first marketing page seen.
 *
 * Rendered by the marketing shell so it runs on EVERY marketing page rather
 * than only the ones a campaign happens to point at. Renders nothing.
 */
export function AttributionCapture() {
  useEffect(() => {
    captureFirstTouch();
  }, []);
  return null;
}
