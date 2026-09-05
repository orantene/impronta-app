/**
 * session-plan.ts — deciding what a scheduled session and its pools SHOULD be,
 * before anything is written.
 *
 * Pure: no Supabase import, so it gates in CI and can be tested without a
 * database. The writer beside it does the I/O and makes no decisions.
 *
 *
 * WHY A SESSION WITH NO POOL IS REFUSED RATHER THAN ALLOWED
 * ════════════════════════════════════════════════════════
 * A session with no capacity pool is not a session with unlimited seats. It is
 * a night that renders on the public page, looks correct in every list, and
 * refuses every purchase — because the picker resolves
 * `(session_tier, session.id, pool_key)` and finds nothing. The failure is
 * invisible to whoever created it and visible only to a customer trying to buy.
 *
 * That is this area's most-repeated defect shape: the cron already carries a
 * `poolBackfill` repair path precisely because a session outliving its pool
 * creation was judged likely enough to build a repair for. The cheaper fix is
 * to refuse to plan one.
 *
 *
 * WHY A DUPLICATE POOL KEY IS REFUSED, WHICH IS THE SUBTLE ONE
 * ═══════════════════════════════════════════════════════════
 * `upsert_capacity_pool` is ON CONFLICT DO UPDATE SET units_total = EXCLUDED.
 * So planning `[{ga, 300}, {ga, 6}]` does not fail and does not create two
 * pools: it creates one pool with **6** seats, silently, because the last write
 * wins. A venue that meant 300 general admission opens the doors to 6.
 *
 * Nothing downstream can detect this — one pool with a plausible number is
 * exactly what a correct plan looks like. It has to be caught here.
 *
 *
 * WHY AN UNKNOWN POOL KEY IS REFUSED
 * ══════════════════════════════════
 * Units for a key that is not a tier of this event create a real pool that no
 * tier resolves: seats that exist, cost capacity, and cannot be sold. A typo in
 * a form field is enough. The caller passes the event's known keys and anything
 * else is a refusal with the offending key named, rather than a pool nobody
 * will ever look for.
 */

/** Seats for one tier of one night. `units` is seats, never money. */
export type TierUnits = {
  poolKey: string;
  units: number;
};

export type SessionPlanRefusal =
  | { reason: "bad_start" }
  | { reason: "bad_end" }
  | { reason: "bad_window" }
  | { reason: "no_pools" }
  | { reason: "blank_pool_key" }
  | { reason: "duplicate_pool_key"; poolKey: string }
  | { reason: "unknown_pool_key"; poolKey: string }
  | { reason: "bad_units"; poolKey: string };

export type SessionPlan =
  | { ok: true; startsAt: string; endsAt: string; pools: TierUnits[] }
  | ({ ok: false } & SessionPlanRefusal);

export type PlanSessionInput = {
  startsAt: string;
  endsAt: string;
  /** Seats per tier for THIS night. A tier is not a table: these are input. */
  tiers: ReadonlyArray<TierUnits>;
  /**
   * The pool keys this event's tiers actually have. Pass the empty array for a
   * session with no event, which then admits only the default key.
   */
  knownPoolKeys: ReadonlyArray<string>;
};

/** The key used by a session that sells one undifferentiated pool of seats. */
export const DEFAULT_POOL_KEY = "default";

/**
 * Normalise and check one night's session and its per-tier seats.
 *
 * Returns a refusal rather than throwing, and never returns a partially valid
 * plan: a caller that gets `ok: true` can write every pool in it.
 */
export function planSession(input: PlanSessionInput): SessionPlan {
  const start = Date.parse(input.startsAt ?? "");
  if (!Number.isFinite(start)) return { ok: false, reason: "bad_start" };
  const end = Date.parse(input.endsAt ?? "");
  if (!Number.isFinite(end)) return { ok: false, reason: "bad_end" };
  // Mirrors the sessions_range CHECK rather than leaving the database to raise
  // it, so the operator sees "the end is not after the start" and not a
  // constraint name.
  if (end <= start) return { ok: false, reason: "bad_window" };

  if (input.tiers.length === 0) return { ok: false, reason: "no_pools" };

  const allowed = new Set(
    input.knownPoolKeys.length > 0 ? input.knownPoolKeys : [DEFAULT_POOL_KEY],
  );
  const seen = new Set<string>();
  const pools: TierUnits[] = [];

  for (const tier of input.tiers) {
    const poolKey = (tier.poolKey ?? "").trim();
    if (!poolKey) return { ok: false, reason: "blank_pool_key" };
    if (seen.has(poolKey)) return { ok: false, reason: "duplicate_pool_key", poolKey };
    if (!allowed.has(poolKey)) return { ok: false, reason: "unknown_pool_key", poolKey };
    // Seats. Not money, not fractional, not zero: a zero-seat pool is a tier
    // that renders as buyable and refuses everyone, which is the no-pool
    // failure wearing a different mask.
    if (!Number.isFinite(tier.units) || !Number.isInteger(tier.units) || tier.units <= 0) {
      return { ok: false, reason: "bad_units", poolKey };
    }
    seen.add(poolKey);
    pools.push({ poolKey, units: tier.units });
  }

  return {
    ok: true,
    startsAt: new Date(start).toISOString(),
    endsAt: new Date(end).toISOString(),
    pools,
  };
}

/**
 * The sentence an operator reads. English only on purpose: this is a staff
 * surface, and the customer-facing copy in this area is the reminder, which is
 * translated. If this ever reaches a customer, it needs es and this comment is
 * the reason it did not have one.
 */
export function describeSessionRefusal(refusal: SessionPlanRefusal): string {
  switch (refusal.reason) {
    case "bad_start":
      return "The start time is not a valid date and time.";
    case "bad_end":
      return "The end time is not a valid date and time.";
    case "bad_window":
      return "The end time must be after the start time.";
    case "no_pools":
      return "Give this session at least one tier with seats. A session with no seats cannot be sold and looks correct until somebody tries to buy.";
    case "blank_pool_key":
      return "One of the tiers has no pool key.";
    case "duplicate_pool_key":
      return `The tier "${refusal.poolKey}" was given seats twice. The second number would silently replace the first.`;
    case "unknown_pool_key":
      return `"${refusal.poolKey}" is not a tier of this event. Seats for it would create a pool nothing can sell.`;
    case "bad_units":
      return `The seat count for "${refusal.poolKey}" must be a whole number above zero.`;
  }
}
