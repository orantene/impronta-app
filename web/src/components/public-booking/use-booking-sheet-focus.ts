"use client";

import { useCallback, useRef } from "react";

import { useFocusTrap } from "@/components/support/use-focus-trap";

import {
  clearBookingSheetOpener,
  consumeBookingSheetOpener,
  rememberBookingSheetOpener,
} from "./booking-sheet-opener";

/** GRK-097: capture CTA at event time; trap restores it on close. */
export function useBookingSheetFocusTrap(active: boolean) {
  const openerRef = useRef<HTMLElement | null>(null);
  const trapRef = useFocusTrap<HTMLDivElement>(active, { restoreTarget: openerRef });
  const captureOpener = useCallback(() => {
    rememberBookingSheetOpener();
    openerRef.current = consumeBookingSheetOpener();
  }, []);
  const clearStaleOpener = useCallback(() => {
    if (!openerRef.current) clearBookingSheetOpener();
  }, []);
  return { trapRef, captureOpener, clearStaleOpener };
}
