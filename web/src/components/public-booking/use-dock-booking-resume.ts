"use client";

import { useEffect, useRef } from "react";

import {
  BOOKING_RESUME_EVENT,
  clearBookingResume,
  peekBookingResume,
  setBookingResume,
  subscribeBookingResume,
} from "./booking-resume-store";

/**
 * CH-3 for a selection that only exists in the menu dock (service picked, sheet
 * never opened). It publishes that selection so the chat can offer "Volver a mi
 * reserva", and carries on with `onContinue` (the dock's own Continuar) when the
 * chat asks. A selection stashed from inside the sheet is never overwritten.
 */
export function useDockBookingResume(
  item: { title: string; totalCents: number; priceLabel: string | null; currency: string } | null,
  onContinue: () => void,
): void {
  const continueRef = useRef(onContinue);
  useEffect(() => {
    continueRef.current = onContinue;
  });
  const title = item?.title ?? null;
  const totalCents = item?.totalCents ?? 0;
  const priceLabel = item?.priceLabel ?? null;
  const currency = item?.currency ?? "";
  useEffect(() => {
    const publish = () => {
      const current = peekBookingResume();
      if (title === null) {
        if (current && current.detail === null) clearBookingResume();
        return;
      }
      if (current) return; // a stash from inside the sheet (or ours) stands
      setBookingResume({ detail: null, step: "choose", title, totalCents: priceLabel ? null : totalCents, currency, priceLabel });
    };
    const stale = peekBookingResume();
    if (stale && stale.detail === null && (title === null || stale.title !== title)) clearBookingResume();
    publish();
    // A fresh sheet open clears the store; the pick is still in the dock, so put it back.
    return subscribeBookingResume(publish);
  }, [title, totalCents, priceLabel, currency]);
  useEffect(() => {
    const onResume = () => {
      const snap = peekBookingResume();
      if (snap && snap.detail === null) continueRef.current();
    };
    window.addEventListener(BOOKING_RESUME_EVENT, onResume);
    return () => window.removeEventListener(BOOKING_RESUME_EVENT, onResume);
  }, []);
}
