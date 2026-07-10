"use client";

/**
 * useJon360LauncherTracking — Phase 0c CRO funnel firing for the launcher:
 * lineup_add / lineup_remove (from a cartIds diff), chat_opened (once per open
 * transition), and the Phase 8 returning-visitor REPLIED pulse one-shot.
 * Extracted verbatim from TalentProfileChatLauncher.tsx (W1-A decomposition
 * pre-pass) to keep that file under the 800-line cap. No logic changes.
 */

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";

import {
  trackChatOpened,
  trackLineupAdd,
  trackLineupRemove,
  type Jon360FunnelContext,
} from "@/lib/analytics/jon360-funnel-events";

export function useJon360LauncherTracking({
  tenantId,
  cartCount,
  cartIds,
  ctaIdentity,
  sourcePage,
  open,
  unreadCoordinatorReply,
  liveInquiryIdRef,
}: {
  tenantId: string | null;
  cartCount: number;
  cartIds: readonly string[];
  ctaIdentity: "guest" | "client";
  sourcePage: string;
  open: boolean;
  unreadCoordinatorReply: boolean;
  liveInquiryIdRef: MutableRefObject<string | null>;
}): { repliedPulse: boolean } {
  // Phase 8 returning-visitor REPLIED pulse — a one-shot rising edge the pill's
  // NewMessagePulse consumes. Fired ~1.2s after mount when a returning visitor
  // lands with an unread coordinator reply on a CLOSED launcher, so the pulse
  // dot draws the eye to "{agency} replied". Cleared once the visitor opens the
  // panel (they have now seen the reply).
  const [repliedPulse, setRepliedPulse] = useState(false);

  // Phase 0c CRO — the standard Jon-360 funnel context, rebuilt per render from
  // the live cart. liveInquiryIdRef tracks the early-row id once it exists.
  const funnelCtx = useCallback(
    (): Jon360FunnelContext => ({
      inquiryId: liveInquiryIdRef.current,
      tenantId,
      lineupCount: cartCount,
      identity: ctaIdentity,
      source: sourcePage,
    }),
    [tenantId, cartCount, ctaIdentity, sourcePage],
  );

  // Phase 0c CRO — lineup_add / lineup_remove from a single cartIds diff so both
  // the rail X and a directory card "+" route through one firing point (no
  // double-count). Skips the initial mount snapshot (restored saved_talent ids
  // are not fresh adds).
  const prevCartIdsRef = useRef<readonly string[] | null>(null);
  useEffect(() => {
    const prev = prevCartIdsRef.current;
    const next = cartIds;
    prevCartIdsRef.current = next;
    if (prev === null) return; // first snapshot — not a user action
    const prevSet = new Set(prev);
    const nextSet = new Set(next);
    for (const id of next) {
      if (!prevSet.has(id)) trackLineupAdd(funnelCtx(), id);
    }
    for (const id of prev) {
      if (!nextSet.has(id)) trackLineupRemove(funnelCtx(), id);
    }
  }, [cartIds, funnelCtx]);

  // Phase 0c CRO — chat_opened once per open transition (not on every render
  // while open). Covers every open path (pill click, +N chip, restored session,
  // repointed front-door cue).
  const prevOpenRef = useRef(false);
  useEffect(() => {
    if (open && !prevOpenRef.current) trackChatOpened(funnelCtx());
    prevOpenRef.current = open;
  }, [open, funnelCtx]);

  // Phase 8 — REPLIED pulse one-shot. When a returning visitor lands with an
  // unread coordinator reply and the launcher is still closed, fire the pulse
  // once shortly after mount (a beat so it reads as "new", not a flash on paint).
  // Opening the panel marks the reply seen and suppresses the pulse. The fired
  // flag below is reset to false right after so NewMessagePulse only sees a
  // single false->true->false rising edge. Reduced-motion is handled inside the
  // pulse (it degrades to a static highlight), so no extra guard here.
  const repliedPulseFiredRef = useRef(false);
  useEffect(() => {
    if (!unreadCoordinatorReply || open || repliedPulseFiredRef.current) return;
    repliedPulseFiredRef.current = true;
    const fire = window.setTimeout(() => setRepliedPulse(true), 1200);
    const settle = window.setTimeout(() => setRepliedPulse(false), 1900);
    return () => {
      window.clearTimeout(fire);
      window.clearTimeout(settle);
    };
  }, [unreadCoordinatorReply, open]);

  return { repliedPulse };
}
