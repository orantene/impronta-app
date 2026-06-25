"use client";

/**
 * useFlyToRail — drives the card → launcher-pill fly animation (plan §4.A.5).
 *
 * Subscribes to the directory inquiry-modal context's `lastAnimateAdd` payload
 * ({ fromRect, portraitUrl, talentProfileId }), which the directory card emits
 * the moment a talent is added to the cart (Phase 0 added the context method;
 * the card wiring lands in the NEXT stage). On a fresh payload it spawns ONE
 * body-portal clone that arcs from the card photo rect to the launcher target,
 * scaling down + fading in, then unmounts on finish so the real rail avatar's
 * landing bounce takes over seamlessly.
 *
 *   • Reduced-motion: NO clone is ever created (guard the WAAPI call behind
 *     matchMedia, §4.A.10) — the avatar simply appears in the rail.
 *   • Target: the launcher pill rect, resolved from a ref the host passes in.
 *     Falls back to a fixed bottom-right point (the pill's known anchor) when
 *     the ref is not yet measured.
 *
 * This hook owns ONLY the flight state; the visual clone is rendered by
 * <FlyingAvatar>, which consumes `flight`.
 */

import { useEffect, useRef, useState, type RefObject } from "react";

import { useOptionalDirectoryInquiryModal } from "@/components/directory/directory-inquiry-modal-context";

import {
  FLY_START_DIAMETER,
  GUEST_TARGET_FALLBACK_INSET,
  prefersReducedMotion,
} from "./use-fly-to-rail-consts";

export type FlightState = {
  /** Stable id so React keys the clone (one flight at a time is the common case). */
  key: number;
  portraitUrl: string | null;
  talentProfileId: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
};

export type UseFlyToRailResult = {
  /** The active flight, or null when idle. Consumed by <FlyingAvatar>. */
  flight: FlightState | null;
  /** Call when the clone's animation finishes → clears the flight. */
  onFlightDone: () => void;
};

/**
 * @param targetRef ref to the launcher pill (or rail anchor) used as the
 *   flight destination. When null/unmeasured a bottom-right fallback is used.
 */
export function useFlyToRail(
  targetRef?: RefObject<HTMLElement | null>,
): UseFlyToRailResult {
  const modal = useOptionalDirectoryInquiryModal();
  const lastAnimateAdd = modal?.lastAnimateAdd ?? null;

  const [flight, setFlight] = useState<FlightState | null>(null);
  const keyRef = useRef(0);
  // Guard against re-spawning a clone for the same payload object across renders.
  const consumedRef = useRef<unknown>(null);

  useEffect(() => {
    if (!lastAnimateAdd) return;
    if (consumedRef.current === lastAnimateAdd) return;
    consumedRef.current = lastAnimateAdd;

    // Reduced motion → never create a body-portal element (§4.A.10).
    if (prefersReducedMotion()) return;

    const { fromRect, portraitUrl, talentProfileId } = lastAnimateAdd;

    // Source center: the card photo rect (viewport coords).
    const from = {
      x: fromRect.left + fromRect.width / 2,
      y: fromRect.top + fromRect.height / 2,
    };

    // Destination center: the launcher pill rect, or the known bottom-right
    // anchor when the ref is not yet measured.
    const targetEl = targetRef?.current ?? null;
    let to: { x: number; y: number };
    if (targetEl) {
      const r = targetEl.getBoundingClientRect();
      to = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    } else {
      to = {
        x: window.innerWidth - GUEST_TARGET_FALLBACK_INSET.right,
        y: window.innerHeight - GUEST_TARGET_FALLBACK_INSET.bottom,
      };
    }

    keyRef.current += 1;
    setFlight({
      key: keyRef.current,
      portraitUrl,
      talentProfileId,
      from,
      to,
    });
  }, [lastAnimateAdd, targetRef]);

  return {
    flight,
    onFlightDone: () => setFlight(null),
  };
}

export { FLY_START_DIAMETER };
