/**
 * mint-admissions.ts — turning one paid order line into admission rows.
 *
 * Pure: no Supabase import, so it gates in CI.
 *
 * THIS MODULE EXISTS BECAUSE OF A DECISION NOTHING ELSE FORCES ANYONE TO GET
 * RIGHT. Given "someone bought 4 of tier X", there are two shapes:
 *
 *     four admissions of party_size 1     (four tickets, four QRs)
 *     one admission of party_size 4       (one party of four)
 *
 * Both typecheck. Both satisfy every constraint on `admissions`. They differ in
 * what a door sees, what a host stand shows, and how many QRs land on a receipt
 * -- and the wrong one is only discovered by a human at a door. Sessions &
 * Classes and the Director both flagged this as the real risk that no column
 * fixes, so the answer is the `tier-pools.ts` treatment: a function that takes
 * the sold thing and RETURNS the rows, so the choice is made once, here, rather
 * than by whoever writes the insert.
 *
 * THE RULE, in one line: `units` is how many things were bought, and
 * `admitsPerUnit` is how many people each of those things lets in.
 *
 *     4 GA tickets      units=4, admitsPerUnit=1  ->  4 rows, party_size 1
 *     1 VIP table for 6 units=1, admitsPerUnit=6  ->  1 row,  party_size 6
 *     2 VIP tables      units=2, admitsPerUnit=6  ->  2 rows, party_size 6
 *
 * ONE ROW PER UNIT, ALWAYS. Two VIP tables are two rows, not one of twelve,
 * because the two tables are admitted separately, seated separately and
 * potentially refunded separately -- and `capacity_allocations.order_line_id`
 * is what refund-by-line reads.
 *
 * NOTE ON `admitsPerUnit`: it is a PARAMETER here and has no column yet. It
 * cannot be derived -- `consumes_units` is how much POOL a purchase eats (a VIP
 * table eats one table) and says nothing about how many people sit at it, and a
 * space group may hold tables of different sizes so the group cannot answer it
 * either. It therefore wants a `talent_offering_variants.admits_per_unit`, which
 * is raised for review rather than added, because a column that sounds like the
 * `units` column just removed from `admissions` deserves someone else's eyes.
 * They are different facts on different tables -- that one was a second
 * denominator duplicating `party_size` on the admission; this is a catalog fact
 * used ONCE to compute that denominator -- but "different, honestly" is exactly
 * what the last one looked like too.
 */

export type MintPlan = {
  /** One entry per admission row to insert. */
  rows: MintRow[];
  /** Total people this line admits. `sum(rows.partySize)`. */
  totalPeople: number;
};

export type MintRow = {
  orderLineId: string;
  allocationId: string | null;
  sessionId: string | null;
  spaceId: string | null;
  customerId: string | null;
  holderName: string | null;
  holderEmail: string | null;
  partySize: number;
  startsAt: string | null;
};

/**
 * Coerce a count that may arrive as PostgREST's NUMERIC string.
 *
 * `order_lines.units` is `NUMERIC(12,3)`, so PostgREST sends `"4.000"` — a
 * STRING. Requiring a number here made this module depend on the caller
 * remembering to coerce, which is a dependency on a stranger's strictness: it
 * fails closed (every mint refused with a vague `not_a_count`) rather than
 * loudly, and the reason names the symptom rather than the cause.
 *
 * So the boundary coerces and stays strict about MEANING: `"4.000"` is four,
 * `"4.500"` is not a count of things and is refused. Accepting the shape the
 * database actually sends is not laxity; pretending it sends something else is.
 */
function toWholeCount(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  if (!Number.isInteger(n)) return null;
  return n;
}

export type MintRefusal =
  | { ok: false; reason: "not_a_count" }
  | { ok: false; reason: "not_anchored" }
  | { ok: false; reason: "holder_count_mismatch"; expected: number; got: number };

export type MintInput = {
  orderLineId: string;
  /** May arrive as PostgREST's NUMERIC string (`"4.000"`); coerced here. */
  units: number | string;
  /** Same: an int column, but coerced so the boundary owns the shape. */
  admitsPerUnit: number | string;
  sessionId?: string | null;
  spaceId?: string | null;
  allocationId?: string | null;
  startsAt?: string | null;
  customerId?: string | null;
  /**
   * Optional per-admission holders, when the buyer named each attendee.
   * Must be either absent or exactly `units` long: a partial list silently
   * leaves some tickets nameless while looking deliberate.
   */
  holders?: ReadonlyArray<{ name?: string | null; email?: string | null }>;
};

/**
 * The rows for one paid line, or a refusal.
 *
 * Refuses rather than emitting a degenerate plan, because every alternative
 * writes real rows that a human meets at a door.
 */
export function planAdmissions(input: MintInput): ({ ok: true } & MintPlan) | MintRefusal {
  const units = toWholeCount(input.units);
  const admitsPerUnit = toWholeCount(input.admitsPerUnit);

  if (units === null || units <= 0) return { ok: false, reason: "not_a_count" };
  if (admitsPerUnit === null || admitsPerUnit <= 0) {
    return { ok: false, reason: "not_a_count" };
  }

  // The anchor rule from `20261229000360`, enforced BEFORE the insert so the
  // refusal names the problem instead of surfacing as a CHECK violation from a
  // batch of forty rows.
  const anchored =
    Boolean(input.allocationId) ||
    Boolean(input.sessionId) ||
    Boolean(input.spaceId) ||
    Boolean(input.orderLineId);
  if (!anchored) return { ok: false, reason: "not_anchored" };

  if (input.holders && input.holders.length !== units) {
    return {
      ok: false,
      reason: "holder_count_mismatch",
      expected: units,
      got: input.holders.length,
    };
  }

  const rows: MintRow[] = [];
  for (let i = 0; i < units; i += 1) {
    const holder = input.holders?.[i];
    rows.push({
      orderLineId: input.orderLineId,
      // Every row of a line shares the line's allocation: one allocation of 4
      // units backs four ticket rows. Attribution stays honest because
      // refund-by-line reads `order_line_id`, which is per row.
      allocationId: input.allocationId ?? null,
      sessionId: input.sessionId ?? null,
      spaceId: input.spaceId ?? null,
      customerId: input.customerId ?? null,
      holderName: holder?.name ?? null,
      holderEmail: holder?.email ?? null,
      partySize: admitsPerUnit,
      startsAt: input.startsAt ?? null,
    });
  }

  return { ok: true, rows, totalPeople: units * admitsPerUnit };
}
