"use client";

/**
 * useSentAirlock — owns the SENT airlock overlay state for MiniChatPanel (Jon
 * Inquiry 360, Phase 1). Extracted from the panel to keep that orchestrator under
 * its 800-line hard cap.
 *
 * `trigger()` is called from the send hook's onSent (which fires ONLY on a real
 * send-success, never on a failed send). It shows the overlay, then auto-clears it
 * after the beat resolves and a brief hold so the live thread takes over. The timer
 * is cleared on unmount.
 */

import { useEffect, useRef, useState } from "react";

/** "Sent to {agency}." (~1.2s) -> "{agency} has your inquiry." + a brief hold. */
const AIRLOCK_TOTAL_MS = 2200;

export type UseSentAirlockResult = {
  /** Whether the airlock overlay is currently playing. */
  showSentAirlock: boolean;
  /** Play the airlock. Call only on a REAL send-success. */
  trigger: () => void;
};

export function useSentAirlock(): UseSentAirlockResult {
  const [showSentAirlock, setShowSentAirlock] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function trigger() {
    setShowSentAirlock(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setShowSentAirlock(false), AIRLOCK_TOTAL_MS);
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { showSentAirlock, trigger };
}
