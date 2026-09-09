import "server-only";

/**
 * Add-on money for the register, priced the way the web checkout prices it.
 *
 * THE DEFECT THIS CLOSES. `addLine` persisted `addon_ids` on the order line and
 * then computed `total_cents` from `unit_cents * units` alone. The ids were
 * stored, shown on the ticket and sent to the kitchen; the money was not. So a
 * burger with bacon rang up as a burger, and the same basket cost less at the
 * counter than on the website — a discount nobody authorised, applied by
 * whichever door the customer walked through.
 *
 * WHY THIS IS A MODULE AND NOT A FEW LINES IN `draft.ts`
 * ═════════════════════════════════════════════════════
 * Two call sites need identical arithmetic and identical refusals: `addLine`,
 * which prices a new line, and `repriceAndValidate`, which re-reads the catalog
 * before money is taken. A second copy in the second place is how the two
 * answers drift, and a drift here is a receipt that disagrees with the charge.
 *
 *
 * PER LINE, NOT PER UNIT — copied deliberately, not by accident
 * ════════════════════════════════════════════════════════════
 * `purchase-pricing.ts` charges each chosen add-on ONCE per line regardless of
 * `units`, and its header argues the case at length: `talent_offering_addons`
 * has no column saying whether an extra is per-unit ("beard trim") or
 * per-booking ("travel fee"), so the distinction is unmodelled, and of the two
 * ways to be wrong overcharging is the worse one.
 *
 * That reasoning does not change at a till. What WOULD be wrong is for the two
 * pipelines to disagree: this defect exists precisely because the register and
 * the website priced the same basket differently, and closing it by inventing a
 * third rule would leave the gap open in the other direction. When the catalog
 * gains a per-unit flag, `purchase-pricing.ts` and this file change together.
 *
 *
 * THE RESIDUE IS THE CARRIER
 * ══════════════════════════
 * A POS line stores the BASE unit price in `unit_cents` and
 * `unit_cents * units + addonCents` in `total_cents`, so `total - unit * units`
 * recovers the add-on charge exactly, with no extra read, whenever a later
 * command (change the quantity, remove a different line) has to rebuild the
 * order's totals. `addonCentsOnLine` is that recovery, and it is clamped at
 * zero so a line written by some other pipeline — the web checkout stores an
 * EFFECTIVE unit price, which can round below the true total — degrades to "no
 * add-on charge" rather than to a negative one.
 */

import { logServerError } from "@/lib/server/safe-error";

type Admin = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

export type PricedAddons = {
  /** The ids that survived validation, in catalog order. */
  readonly addonIds: string[];
  /** Charged once per line. Integer cents, never negative. */
  readonly addonCents: number;
  /** ` + Bacon + Extra cheese`, appended to the line label. */
  readonly labelSuffix: string;
};

export type PriceAddonsResult =
  | { ok: true; priced: PricedAddons }
  | { ok: false; reason: "unavailable" | "invalid"; error: string };

/**
 * Price the extras chosen for one line, refusing anything that is not on the
 * offering being sold.
 *
 * A foreign add-on id is REFUSED rather than dropped. Dropping it would ring up
 * the base item while the ticket the kitchen reads still says "with bacon" —
 * the operator sees the extra go on the screen, the customer is charged for a
 * plain burger, and nothing anywhere reports a problem. Same argument
 * `purchase-pricing` makes for a variant belonging to another offering.
 */
export async function priceAddons(
  admin: Admin,
  input: { tenantId: string; offeringId: string; addonIds: readonly string[] | null | undefined },
): Promise<PriceAddonsResult> {
  const requested = [...new Set((input.addonIds ?? []).filter((id) => typeof id === "string" && id.length > 0))];
  if (requested.length === 0) {
    return { ok: true, priced: { addonIds: [], addonCents: 0, labelSuffix: "" } };
  }

  const { data, error } = await admin
    .from("talent_offering_addons")
    .select("id, offering_id, label, amount_cents")
    .in("id", requested);
  if (error) {
    logServerError("pos.priceAddons", error);
    return { ok: false, reason: "unavailable", error: "Could not read the extras." };
  }

  const rows = (data ?? []) as Array<{
    id: string;
    offering_id: string | null;
    label: string | null;
    amount_cents: number | null;
  }>;
  const byId = new Map(rows.map((r) => [r.id, r]));

  const addonIds: string[] = [];
  let addonCents = 0;
  let labelSuffix = "";
  for (const id of requested) {
    const row = byId.get(id);
    if (!row || row.offering_id !== input.offeringId) {
      return { ok: false, reason: "invalid", error: "That extra does not belong to this item." };
    }
    const cents = Math.max(0, Math.trunc(Number(row.amount_cents ?? 0)));
    if (!Number.isSafeInteger(cents)) {
      return { ok: false, reason: "invalid", error: "That extra is not priced." };
    }
    addonIds.push(row.id);
    addonCents += cents;
    const label = row.label?.trim();
    if (label) labelSuffix += ` + ${label}`;
  }

  return { ok: true, priced: { addonIds, addonCents, labelSuffix } };
}

/**
 * Recover a stored line's add-on charge from its own amounts.
 *
 * Used when a command rebuilds the order's totals and must not lose the extras
 * on lines it is not touching. Reading `talent_offering_addons` again would be
 * worse than this arithmetic, not better: the catalog price may have changed
 * since the line was rung up, and re-reading it would silently reprice a line
 * the operator never touched. Repricing is `repriceAndValidate`'s job and it is
 * explicit about doing it.
 */
export function addonCentsOnLine(line: { unitCents: number; units: number; totalCents: number }): number {
  const base = Math.max(0, Math.trunc(line.unitCents)) * Math.max(0, Math.trunc(line.units));
  const total = Math.max(0, Math.trunc(line.totalCents));
  const residue = total - base;
  return Number.isSafeInteger(residue) && residue > 0 ? residue : 0;
}
