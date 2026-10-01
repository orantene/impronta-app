/**
 * CH-3: "Volver a mi reserva". When a visitor leaves the booking sheet for the
 * chat (Ask / Chat now / Check availability) the sheet stashes what she was
 * building here. The card chat reads it to offer a way back, and the sheet
 * re-opens from it with every pick kept (the sheet keeps its own state while
 * closed; only a fresh open resets it).
 *
 * Module scope on purpose: the sheet and the chat are separate React trees.
 */
import type { OfferingRequestDetail } from "@/lib/talent/offering-request-detail";

export type BookingResumeSnapshot = {
  /**
   * The sheet's service when she left from inside the sheet. `null` when the
   * selection lives only in the menu dock (picked, sheet never opened): the
   * dock then continues exactly as its Continuar button does.
   */
  detail: OfferingRequestDetail | null;
  /** The step she left from; "done" is never stashed. */
  step: "choose" | "when" | "who";
  title: string;
  totalCents: number | null;
  currency: string;
  /** The menu's own price line ("Desde $120") when the total is not exact. */
  priceLabel?: string | null;
};

/** Fired by the chat; the booking sheet listens and re-opens from the snapshot. */
export const BOOKING_RESUME_EVENT = "tulala:booking-resume";

let snapshot: BookingResumeSnapshot | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const fn of listeners) fn();
}

export function setBookingResume(next: BookingResumeSnapshot): void {
  snapshot = next;
  notify();
}

export function peekBookingResume(): BookingResumeSnapshot | null {
  return snapshot;
}

export function clearBookingResume(): void {
  if (snapshot === null) return;
  snapshot = null;
  notify();
}

export function subscribeBookingResume(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Ask the sheet (or, for a dock-only selection, the dock) to carry on where she left it. No-op when nothing was stashed. */
export function requestBookingResume(): void {
  if (typeof window === "undefined" || snapshot === null) return;
  window.dispatchEvent(new window.CustomEvent(BOOKING_RESUME_EVENT));
}
