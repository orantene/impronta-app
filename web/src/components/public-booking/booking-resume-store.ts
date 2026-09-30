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
  detail: OfferingRequestDetail;
  /** The step she left from; "done" is never stashed. */
  step: "choose" | "when" | "who";
  title: string;
  totalCents: number | null;
  currency: string;
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

/** Ask the sheet to re-open where she left it. No-op when nothing was stashed. */
export function requestBookingResume(): void {
  if (typeof window === "undefined" || snapshot === null) return;
  window.dispatchEvent(new window.CustomEvent(BOOKING_RESUME_EVENT));
}
