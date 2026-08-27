/**
 * Plan roster caps — THE single source of truth.
 *
 * These numbers are the product contract and they are ENFORCED by
 * `agencies.talent_seat_limit` (see the column comment, kept in step by
 * migrations `20260902130000_free_plan_seat_limit_five.sql` and
 * `20261130000000_studio_roster_fifteen_and_team_seat_caps.sql`) and by
 * `checkRosterSeatAvailability`. Every surface that *states* a cap to a
 * human — pricing ladder, upgrade modals, plan-comparison tables, seat
 * meters — must read it from here rather than hard-coding a number.
 *
 * Why this module exists: on 2026-08-04 the caps were written out in six
 * different places and four of them disagreed with what the product
 * actually enforces (Free was advertised as 10 while signup refused
 * profile 6; Studio was variously 15, 25 and 50). A customer reading the
 * pricing page and hitting a wall is the worst kind of bug — the product
 * calling the user a liar. Numbers live here; copy interpolates them.
 *
 * Changing a cap is a COMMERCIAL decision: update this table, ship a
 * migration that moves `agencies.talent_seat_limit` for existing tenants,
 * and update the column comment. `plan-seat-caps.test.ts` fails if this
 * table and the enforcement defaults drift apart.
 */

export type SeatCapPlan = "free" | "studio" | "agency" | "network";

/**
 * Roster profile cap per plan. `null` = unlimited (Agency, Network).
 * Mirrors the `agencies.talent_seat_limit` documented defaults exactly.
 */
export const PLAN_SEAT_CAPS: Record<SeatCapPlan, number | null> = {
  free: 5,
  studio: 15,
  agency: null,
  network: null,
};

/** Seat cap for a plan, falling back to Free for an unknown tier. */
export function seatCapForPlan(plan: string): number | null {
  return plan in PLAN_SEAT_CAPS
    ? PLAN_SEAT_CAPS[plan as SeatCapPlan]
    : PLAN_SEAT_CAPS.free;
}

/**
 * Human cap for UI copy: the number, or the caller's unlimited wording.
 * e.g. `seatCapLabel("studio")` → "15"; `seatCapLabel("network")` → "Unlimited".
 */
export function seatCapLabel(plan: string, unlimited = "Unlimited"): string {
  const cap = seatCapForPlan(plan);
  return cap === null ? unlimited : String(cap);
}
