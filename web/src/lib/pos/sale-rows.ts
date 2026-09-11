import "server-only";

/**
 * The row shapes a POS sale is read and written through, in one place.
 *
 * Extracted when `draft.ts` crossed the 800-line cap. Row shapes are the right
 * thing to move: they have no behaviour, both the command file and the read
 * file need exactly the same ones, and a second copy of `LINE_COLUMNS` is how a
 * column gets added to the writer's select and forgotten in the reader's — the
 * shape of the add-on defect this file was extracted during.
 */

import { addonCentsOnLine } from "./addons";

export type Admin = {
  // Tests inject a fake PostgREST builder. Same seam as expire-orders.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
  // Real PostgREST rpc() is thenable; tests inject a Promise.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc?: (fn: string, args: Record<string, unknown>) => any;
};

/** Numeric columns arrive as strings from PostgREST often enough to matter. */
export function num(value: number | string | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export type OrderRow = {
  id: string;
  tenant_id: string;
  status: string;
  currency: string;
  customer_id: string | null;
  guest_session_id: string | null;
  source_page: string | null;
  visit_id: string | null;
  space_id: string | null;
  version: number;
  subtotal_cents: number | string;
  discount_cents: number | string;
  tax_cents: number | string;
  total_cents: number | string;
  tip_cents?: number | string;
  promo_code_id?: string | null;
};

export type LineRow = {
  id: string;
  offering_id: string | null;
  variant_id: string | null;
  addon_ids: string[] | null;
  session_id: string | null;
  label: string;
  units: number | string;
  unit_cents: number | string;
  total_cents: number | string;
  kind?: string | null;
  operator_user_id?: string | null;
  booking_id?: string | null;
  booking_kind?: string | null;
};

export const ORDER_COLUMNS =
  "id, tenant_id, status, currency, customer_id, guest_session_id, source_page, visit_id, space_id, version, subtotal_cents, discount_cents, tax_cents, total_cents, tip_cents";

export const LINE_COLUMNS =
  "id, offering_id, variant_id, addon_ids, session_id, label, units, unit_cents, total_cents, kind, operator_user_id, booking_id, booking_kind";

/**
 * A stored line, as `cartTotals` wants it.
 *
 * Every command that rebuilds the order's totals goes through this, because
 * every one of them used to drop the add-on charge on the lines it was NOT
 * touching: change the quantity of the coffee and the bacon on the burger
 * stopped being billed. The residue carries it without a second catalog read
 * — see `addonCentsOnLine`.
 */
export function totalsInput(line: LineRow): { unitCents: number; units: number; addonCents: number } {
  const unitCents = num(line.unit_cents);
  const units = num(line.units);
  return {
    unitCents,
    units,
    addonCents: addonCentsOnLine({ unitCents, units, totalCents: num(line.total_cents) }),
  };
}
