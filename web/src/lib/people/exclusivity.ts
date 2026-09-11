/**
 * exclusivity.ts — the CONTRACT half of the bookable gate, resolved the way
 * the booking engine resolves it.
 *
 * WHY THIS IS NOT A ONE-TENANT QUESTION. `resolveTalentBookingMode` reads a
 * person's roster rows across EVERY workspace, finds the one that is an
 * exclusive primary, and refuses booking anywhere else until that agency
 * releases them. A People screen that only read its own workspace's row would
 * show "Bookable: On" for a person the booking page then quietly refuses,
 * which is the exact failure this slice exists to stop.
 *
 * PURE: rows in, three booleans out. The read that produces the rows lives in
 * `people-data.ts`; the rule lives here so it can be tested without a database.
 */

import { rowIsExclusive } from "@/lib/inquiry/owning-party-resolver";

export type ExclusivityRosterRow = {
  readonly talentProfileId: string;
  readonly tenantId: string;
  readonly isPrimary: boolean;
  readonly exclusivityStatus: string | null;
  readonly externalBookingReleased: boolean;
};

export type ExclusivityVerdict = {
  /** Some workspace holds an exclusive primary claim on this person. */
  readonly isExclusive: boolean;
  /** That workspace is the one being looked at right now. */
  readonly isExclusivePrimarySite: boolean;
  /** The exclusive holder has released this person for other channels. */
  readonly externalBookingReleased: boolean;
};

export const NOT_EXCLUSIVE: ExclusivityVerdict = {
  isExclusive: false,
  isExclusivePrimarySite: false,
  externalBookingReleased: false,
};

/**
 * One verdict per talent id.
 *
 * `planTierByTenant` decides whether a primary row counts as exclusive at all:
 * a free workspace's primary row is not an exclusive claim. A tenant missing
 * from the map is treated as having no plan, which is the safe direction here
 * (it removes a claim rather than inventing one).
 */
export function resolveExclusivityByTalent(
  rows: readonly ExclusivityRosterRow[],
  planTierByTenant: ReadonlyMap<string, string | null>,
  thisTenantId: string,
): Map<string, ExclusivityVerdict> {
  const byTalent = new Map<string, ExclusivityRosterRow[]>();
  for (const row of rows) {
    const list = byTalent.get(row.talentProfileId);
    if (list) list.push(row);
    else byTalent.set(row.talentProfileId, [row]);
  }

  const out = new Map<string, ExclusivityVerdict>();
  for (const [talentProfileId, list] of byTalent) {
    const exclusiveRow = list.find((row) =>
      rowIsExclusive(row.isPrimary, row.exclusivityStatus, {
        plan_tier: planTierByTenant.get(row.tenantId) ?? null,
      }),
    );
    out.set(
      talentProfileId,
      exclusiveRow
        ? {
            isExclusive: true,
            isExclusivePrimarySite: exclusiveRow.tenantId === thisTenantId,
            externalBookingReleased: exclusiveRow.externalBookingReleased,
          }
        : NOT_EXCLUSIVE,
    );
  }
  return out;
}
