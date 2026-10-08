"use client";

import { useEffect, useState } from "react";

import { fetchLiveSlots } from "@/components/public-booking/catalog-booking-live-slots";
import { firstSlotStart, type NextSlot } from "@/lib/talent-site/next-free-slot";

/**
 * The next free slot for one offering, from the public slots API. null until loaded, and
 * null on an empty list, an API error or no offering: callers then keep their old behaviour.
 */
export function useNextFreeSlot(
  offeringId: string | null,
  durationMinutes: number | null,
): NextSlot | null {
  const [slot, setSlot] = useState<NextSlot | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!offeringId || !durationMinutes) {
      setSlot(null);
      return;
    }
    fetchLiveSlots(offeringId, durationMinutes)
      .then(({ slots }) => {
        const start = firstSlotStart(slots);
        if (!cancelled) setSlot(start ? { offeringId, slotStart: start } : null);
      })
      .catch(() => {
        if (!cancelled) setSlot(null);
      });
    return () => {
      cancelled = true;
    };
  }, [offeringId, durationMinutes]);
  return slot;
}
