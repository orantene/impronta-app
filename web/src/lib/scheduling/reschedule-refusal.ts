/**
 * reschedule-refusal.ts — turning `reschedule_booking_set`'s reason into a
 * sentence that names what collided.
 *
 * WHY THIS IS A SEPARATE, PURE MODULE
 * ═══════════════════════════════════
 * `reschedule-booking.ts` already carries a `REASON_TEXT` map, and it is fine
 * for what it is: an English string for a server log and for the one caller
 * (`rescheduleBookingAction`) that had nowhere to put anything richer. It
 * throws away the two fields that make the refusal useful to a person —
 * `failed_talent_id` and `failed_pool_id` — because a flat
 * `{ ok: false, error: string }` has no room for them.
 *
 * "That time is already booked" tells an operator nothing they can act on.
 * "Ana is already booked at that time" tells them who to ask. The RPC knows
 * which talent and which pool refused; this module is where that id, once
 * resolved to a name, becomes the difference between the two sentences.
 *
 * PURE. No Supabase import, no message catalogue import. It returns a KEY and
 * its parameters, and the surface renders it through `useT`, so the same
 * decision produces the same sentence in three languages and can be tested
 * without a browser or a database.
 *
 * THE KEY CHANGES WITH THE NAME, NOT THE PARAMS. A sentence with a `{person}`
 * hole and no person to put in it renders "is already booked at that time",
 * which reads like a bug. So an unresolved name selects a DIFFERENT key whose
 * sentence never had a hole. Absence is structurally distinct from a value
 * here, rather than being a value that happens to be empty.
 */

import type { RescheduleBookingReason } from "@/lib/scheduling/reschedule-booking";

/** The catalogue leaf under `dashboard.adminAppointments.reschedule.refusal`. */
export type RescheduleRefusalKey =
  | "slotTakenNamed"
  | "slotTaken"
  | "roomFullNamed"
  | "roomFull"
  | "ancestorFullNamed"
  | "ancestorFull"
  | "changedSinceOpened"
  | "notReschedulable"
  | "notFound"
  | "invalidWindow"
  | "tryAgain"
  | "unavailable";

export type RescheduleRefusal = {
  readonly key: RescheduleRefusalKey;
  /** Substituted into the sentence by the caller. Empty when it takes none. */
  readonly params: Readonly<Record<string, string>>;
};

export type RescheduleRefusalInput = {
  readonly reason: RescheduleBookingReason;
  /** Display name for `failed_talent_id`, when the surface could resolve one. */
  readonly personName?: string | null;
  /** Display name for the space behind `failed_pool_id`, when there is one. */
  readonly spaceName?: string | null;
};

/** Trimmed, or null. A whitespace name is an absent name. */
function usableName(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * The one place a reschedule refusal becomes words.
 *
 * `conflict` is the stale-screen refusal and deliberately never names anything:
 * the operator's window is not the stored window, so any name this sentence
 * carried would describe a state they were not looking at.
 */
export function describeRescheduleRefusal(input: RescheduleRefusalInput): RescheduleRefusal {
  const person = usableName(input.personName);
  const space = usableName(input.spaceName);

  switch (input.reason) {
    case "slot_taken":
      return person
        ? { key: "slotTakenNamed", params: { person } }
        : { key: "slotTaken", params: {} };
    case "sold_out":
      return space ? { key: "roomFullNamed", params: { room: space } } : { key: "roomFull", params: {} };
    case "ancestor_full":
      return space
        ? { key: "ancestorFullNamed", params: { room: space } }
        : { key: "ancestorFull", params: {} };
    case "conflict":
      return { key: "changedSinceOpened", params: {} };
    case "not_reschedulable":
      return { key: "notReschedulable", params: {} };
    case "not_found":
    case "wrong_tenant":
      // One answer for both. A staff member of another workspace must not learn
      // that an id they guessed is real, only that it is not theirs to move.
      return { key: "notFound", params: {} };
    case "invalid":
      return { key: "invalidWindow", params: {} };
    case "deadlock":
      return { key: "tryAgain", params: {} };
    case "unavailable":
      return { key: "unavailable", params: {} };
  }
}

/**
 * Substitute `{name}` holes. The catalogue is authored with braces, the same
 * shape `dashboard.adminSessions` already uses, so this is the same
 * `.replace()` the Schedule surface does, in one place instead of at each site.
 */
export function fillRefusalSentence(
  template: string,
  params: Readonly<Record<string, string>>,
): string {
  let out = template;
  for (const [key, value] of Object.entries(params)) {
    out = out.split(`{${key}}`).join(value);
  }
  return out;
}
