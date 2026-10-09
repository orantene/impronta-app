/**
 * D5 renewal billing: what to do about ONE purchased domain right now (pure).
 *
 * A domain bought through Tulala auto-renews at the registrar, and the registrar bills Tulala. So the talent
 * is charged at cost BEFORE that happens, and if she has not paid by the deadline auto-renew is turned OFF
 * at the registrar: Tulala never silently carries a renewal.
 *
 *   d > CHARGE_WINDOW_DAYS ........ nothing
 *   DEADLINE < d <= WINDOW ........ none -> charge (saved card, else a pay link); awaiting -> remind (spaced)
 *   d <= DEADLINE_DAYS, unpaid .... turn auto-renew off, tell the talent
 *
 * `d` is whole days to the registrar expiry. State belongs to one cycle (one expiry): a different expiry
 * than the one the state was written for starts a fresh cycle.
 */

export const RENEWAL_CHARGE_WINDOW_DAYS = 21;
export const RENEWAL_DEADLINE_DAYS = 7;
export const RENEWAL_REMINDER_GAP_HOURS = 72;
export const RENEWAL_MAX_REMINDERS = 3;

export type RenewalState = "none" | "awaiting_payment" | "paid" | "unpaid_autorenew_off" | "needs_attention";

export type RenewalRow = {
  registrarExpiresAt: string | null;
  registrarAutoRenew: boolean | null;
  renewalPriceCents: number | null;
  renewalState: RenewalState;
  renewalCycleExpiresAt: string | null;
  renewalAttempts: number;
  renewalLastAttemptAt: string | null;
};

export type RenewalAction =
  | { kind: "none"; reason: string }
  /** Charge the talent: saved card first, a pay link when that is not possible. */
  | { kind: "charge"; priceCents: number }
  | { kind: "remind" }
  /** Deadline passed unpaid (or no price is known): stop the registrar renewing at Tulala's cost. */
  | { kind: "turn_off_autorenew" }
  /** Price unknown inside the charge window: ops must look; nothing is billed or guessed. */
  | { kind: "needs_attention"; reason: string };

export function daysUntil(iso: string, nowMs: number): number {
  return Math.floor((Date.parse(iso) - nowMs) / 86_400_000);
}

/** The state that belongs to THIS expiry; a new expiry means a new cycle (state resets to none). */
export function effectiveState(row: RenewalRow): RenewalState {
  if (!row.registrarExpiresAt) return "none";
  const sameCycle =
    row.renewalCycleExpiresAt != null && Date.parse(row.renewalCycleExpiresAt) === Date.parse(row.registrarExpiresAt);
  return sameCycle ? row.renewalState : "none";
}

export function planRenewal(row: RenewalRow, nowMs: number): RenewalAction {
  if (!row.registrarExpiresAt || Number.isNaN(Date.parse(row.registrarExpiresAt))) {
    return { kind: "none", reason: "expiry_unknown" };
  }
  const d = daysUntil(row.registrarExpiresAt, nowMs);
  if (d < 0) return { kind: "none", reason: "already_expired" };
  if (d > RENEWAL_CHARGE_WINDOW_DAYS) return { kind: "none", reason: "outside_window" };

  const state = effectiveState(row);
  if (state === "paid") return { kind: "none", reason: "paid" };
  if (state === "unpaid_autorenew_off") return { kind: "none", reason: "autorenew_off" };
  // Someone (the talent, ops) already stopped the registrar: nothing renews at Tulala's cost, nothing to bill.
  if (row.registrarAutoRenew === false && state === "none") return { kind: "none", reason: "autorenew_already_off" };

  if (d <= RENEWAL_DEADLINE_DAYS) return { kind: "turn_off_autorenew" };

  if (state === "needs_attention") return { kind: "none", reason: "needs_attention" };
  if (state === "awaiting_payment") {
    if (row.renewalAttempts >= RENEWAL_MAX_REMINDERS) return { kind: "none", reason: "reminders_exhausted" };
    const last = row.renewalLastAttemptAt ? Date.parse(row.renewalLastAttemptAt) : 0;
    const gapMs = RENEWAL_REMINDER_GAP_HOURS * 3_600_000;
    return nowMs - last >= gapMs ? { kind: "remind" } : { kind: "none", reason: "reminded_recently" };
  }
  if (row.renewalPriceCents == null || row.renewalPriceCents <= 0) {
    return { kind: "needs_attention", reason: "renewal_price_unknown" };
  }
  return { kind: "charge", priceCents: row.renewalPriceCents };
}
