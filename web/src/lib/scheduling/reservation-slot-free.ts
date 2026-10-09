/**
 * Is a requested reservation window still free? (QA on Jor, 2026-10-01: the
 * guest "Reserve a time" drawer placed a firm hold on top of a booking Jor had
 * already made from her agenda.)
 *
 * The hold insert only collides with other HOLDS (the gist constraint on
 * `talent_holds`); it never saw `talent_bookings`. This check reads the SAME
 * busy source the public slots API uses (`loadBusyIntervals`: live holds,
 * non-cancelled bookings with travel, availability blocks), so the drawer, the
 * guest chat reserve and the slot grid agree on what is taken.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { BusyInterval } from "./slots";
import { loadBusyIntervals } from "./load-busy";

/** Pure: true when [startsAt, endsAt) overlaps none of the busy intervals. */
export function isWindowFree(busy: readonly BusyInterval[], startsAt: string, endsAt: string): boolean {
  const s = Date.parse(startsAt);
  const e = Date.parse(endsAt);
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return false;
  return !busy.some((b) => b.startsAt.getTime() < e && b.endsAt.getTime() > s);
}

export type SlotFreeResult = { ok: true } | { ok: false; code: "slot_taken" | "unavailable" };

/** Fails closed: a busy read that errors is not a free slot. */
export async function checkReservationWindowFree(
  admin: SupabaseClient,
  input: {
    talentProfileId: string;
    startsAt: string;
    endsAt: string;
    now?: Date;
    /** Hold ids that must not count as busy (own hold on post-insert re-check). */
    excludeHoldIds?: readonly string[];
  },
  deps: { loadBusy?: typeof loadBusyIntervals } = {},
): Promise<SlotFreeResult> {
  const load = deps.loadBusy ?? loadBusyIntervals;
  const s = Date.parse(input.startsAt);
  const e = Date.parse(input.endsAt);
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return { ok: false, code: "slot_taken" };
  let busy: BusyInterval[];
  try {
    // Widen by a day each side so travel padding on neighbours is seen.
    busy = await load({
      admin,
      talentProfileId: input.talentProfileId,
      from: new Date(s - 86_400_000),
      to: new Date(e + 86_400_000),
      now: input.now,
      excludeHoldIds: input.excludeHoldIds,
    });
  } catch {
    return { ok: false, code: "unavailable" };
  }
  return isWindowFree(busy, input.startsAt, input.endsAt) ? { ok: true } : { ok: false, code: "slot_taken" };
}
