import type { CapabilityKey } from "@/lib/access";

/**
 * TUL-1708: the capability each Classes-mode action requires. The local `staff()` helper in
 * `classes-actions.ts` used to call `requireWorkspaceStaffAction()` with no capability, which defaults to
 * `agency.workspace.view` — a capability `viewer` holds. `staff()` then ran a SECOND, manual
 * `userHasCapability("booking.payment.request", ...)` check, so the hole was partly closed in practice, but
 * the primary guard itself stayed capability-less and the ratchet (rightly) still counts it.
 *
 * Every action here — check-in, attendance, the walk-in slots/services reads that feed the booking UI, booking
 * a walk-in, holding a seat on the counter's draft, and naming a seat holder — is the SAME day-to-day
 * Classes-mode operation the file's own header already documents as gated on `booking.payment.request`
 * (manager+; see `lib/access/roles.ts` MANAGER_CAPS). There is no narrower existing capability for
 * "run a class session", so every entry maps to this one, now passed directly to the guard instead of
 * checked separately afterward.
 */
export const CLASSES_WRITE_CAPABILITY = {
  checkIn: "booking.payment.request",
  markAttendance: "booking.payment.request",
  walkInSlots: "booking.payment.request",
  services: "booking.payment.request",
  moveSlots: "booking.payment.request",
  bookWalkIn: "booking.payment.request",
  holdSeat: "booking.payment.request",
  nameSeatHolders: "booking.payment.request",
} as const satisfies Record<string, CapabilityKey>;

export type ClassesWriteAction = keyof typeof CLASSES_WRITE_CAPABILITY;
