/**
 * lib/billing/dunning-grace.ts (TUL-835)
 *
 * Pure grace policy for failed subscription payments. No Stripe, no Supabase.
 *
 * Policy: a subscription that goes past_due keeps its paid features for
 * GRACE_DAYS from the FIRST failure. After that, entitlements resolve as Free
 * (content is kept, nothing is deleted) and the UI offers "Restore plan".
 */

export const DUNNING_GRACE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export type DunningGraceState =
  /** Not past_due: nothing to do. */
  | { phase: "none" }
  /** past_due, still inside the window: paid features stay on. */
  | { phase: "grace"; graceEndsAt: string; daysLeft: number }
  /** past_due and the window is over: treat as Free. */
  | { phase: "expired"; graceEndsAt: string };

export type DunningGraceInput = {
  status: string | null | undefined;
  /** When the subscription first went past_due (ISO). Null/unparseable = just now. */
  pastDueSince: string | null | undefined;
  now: Date;
};

export function resolveDunningGrace(input: DunningGraceInput): DunningGraceState {
  if (input.status !== "past_due") return { phase: "none" };
  const parsed = input.pastDueSince ? Date.parse(input.pastDueSince) : NaN;
  // Unknown start (legacy row, column not yet backfilled): fail open to the
  // start of grace rather than stripping a paying customer.
  const startMs = Number.isFinite(parsed) ? parsed : input.now.getTime();
  const endMs = startMs + DUNNING_GRACE_DAYS * DAY_MS;
  const graceEndsAt = new Date(endMs).toISOString();
  const nowMs = input.now.getTime();
  if (nowMs >= endMs) return { phase: "expired", graceEndsAt };
  return { phase: "grace", graceEndsAt, daysLeft: Math.max(1, Math.ceil((endMs - nowMs) / DAY_MS)) };
}

/** True when paid access must be withheld (grace over). */
export function isDunningExpired(input: DunningGraceInput): boolean {
  return resolveDunningGrace(input).phase === "expired";
}

/**
 * The past_due_since value a writer should store. Keeps the ORIGINAL failure
 * time across Smart Retry updates, sets it on the transition into past_due,
 * and clears it once the status recovers or ends.
 */
export function nextPastDueSince(
  status: string,
  existingSince: string | null | undefined,
  now: Date,
): string | null {
  if (status !== "past_due") return null;
  return existingSince ?? now.toISOString();
}
