/**
 * Turning a cart's capacity needs into reservation requests.
 *
 * TWO SHAPES, AND THE BRANCH IS DELIBERATE.
 *
 * Capacity overruled a uniform per-unit reserve, and the reason is not row
 * count — it is that per-unit rows only give you the identity property when a
 * per-unit DOMAIN ROW exists to carry the allocation id.
 *
 *   An admission carries its own `allocation_id`. Refunding that admission
 *   releases exactly that allocation, and a retry is a no-op because
 *   `released_at` is already set. Identity.
 *
 *   Fifty allocations for fifty coffees carry nothing. Refunding 2 means
 *   something picks "any 2 live ones", and a RETRY PICKS TWO MORE. That is
 *   quantity release wearing row clothing — the feeling of identity without
 *   the property, which is worse than one row of fifty because the defect is
 *   invisible instead of obvious.
 *
 * So: one allocation per unit exactly where a per-unit domain row exists.
 * Otherwise one allocation of N. The caller DECLARES which, because the
 * pipeline cannot infer it and inferring is what produces these bugs.
 *
 * A uniform shape that produces a false property in one branch is worse than a
 * divergence that is visible in the code — so the branch is named rather than
 * left to be reconstructed from row counts.
 */

export type CapacityNeed = {
  offeringId: string;
  poolId: string;
  startsAt?: string | null;
  endsAt?: string | null;
  units?: number;
  /**
   * Does a per-unit domain row exist for this line?
   *
   * True for session-backed lines: the mint writes one `admissions` row per
   * unit, each carrying its own `allocation_id`. False for fungible product
   * units, which have nothing to carry an id.
   */
  perUnitDomainRow?: boolean;
};

export type CapacityRequest = {
  poolId: string;
  startsAt: string | null;
  endsAt: string | null;
  units: number;
  orderLineId: string | null;
};

/**
 * Ceiling on allocations one order may reserve. With one allocation per unit a
 * mistyped quantity becomes an array of that many objects before the engine can
 * refuse it. 500 is far above any real cart and far below anything that hurts.
 */
export const MAX_ALLOCATIONS_PER_ORDER = 500;

export type BuildRequestsResult =
  | { ok: true; requests: CapacityRequest[] }
  | { ok: false; reason: "too_many_allocations"; count: number }
  | { ok: false; reason: "fractional_units_unsupported"; offeringId: string; units: number };

export function buildCapacityRequests(
  needs: readonly CapacityNeed[],
  lineIdByOffering: ReadonlyMap<string, string>,
): BuildRequestsResult {
  const requests: CapacityRequest[] = [];

  for (const need of needs) {
    const units = need.units ?? 1;

    // REFUSES, never rounds. `order_lines.units` is NUMERIC(12,3) and the
    // policy gate admits any finite positive value, so 2.5 reaches here today —
    // two and a half hours, kilos, metres. `capacity_allocations.units` is
    // INTEGER, and `reserve_capacity_batch` does `(r->>'units')::int`, which
    // fails on "2.5" with `invalid_text_representation`: an opaque cast error
    // from deep inside a function, not a refusal anyone can act on.
    //
    // Rounding it would be worse than the crash. `Math.floor` on a 2.5-unit
    // line reserves 2 and sells 2.5 — half a unit of stock vanishing at
    // checkout, silently, on the one path whose entire job is not to oversell.
    if (!Number.isInteger(units)) {
      return { ok: false, reason: "fractional_units_unsupported", offeringId: need.offeringId, units };
    }
    // Clamp UPWARD: a zero or negative units still holds one seat. Reserving
    // nothing for a line that was sold is the oversell this path prevents.
    const whole = Math.max(1, units);
    const orderLineId = lineIdByOffering.get(need.offeringId) ?? null;
    const base = {
      poolId: need.poolId,
      startsAt: need.startsAt ?? null,
      endsAt: need.endsAt ?? null,
      orderLineId,
    };

    if (!need.perUnitDomainRow) {
      // ONE allocation of N. Nothing here can carry an allocation id per unit,
      // so splitting would only disguise a quantity release. When a partial
      // product refund is genuinely needed, the right primitive is Capacity's
      // allocation SPLIT — one released row, one live row, both carrying the
      // original's identity — and that is theirs to build when a caller exists.
      requests.push({ ...base, units: whole });
      if (requests.length > MAX_ALLOCATIONS_PER_ORDER) {
        return { ok: false, reason: "too_many_allocations", count: requests.length };
      }
      continue;
    }

    for (let i = 0; i < whole; i += 1) {
      requests.push({ ...base, units: 1 });
      // Bounded INSIDE the loop, so one absurd `units` cannot build a huge
      // array before anything measures its length.
      if (requests.length > MAX_ALLOCATIONS_PER_ORDER) {
        return { ok: false, reason: "too_many_allocations", count: requests.length };
      }
    }
  }

  return { ok: true, requests };
}
