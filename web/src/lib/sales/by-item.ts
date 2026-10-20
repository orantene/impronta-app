/**
 * Sales by item: `order_lines` grouped by `offering_id`.
 *
 * DISPLAY ONLY. Every figure is a stored `order_lines` amount summed as is
 * (`total_cents` gross, `refunded_cents` refunded); nothing is recomputed from
 * prices, fees or commission, and one row never mixes currencies (the order's
 * currency is part of the row key).
 */

/** Orders that hold a completed sale. Refunded ones stay: their refunds net out. */
export const SALES_ITEM_ORDER_STATUSES: readonly string[] = ["paid", "fulfilled", "partially_refunded", "refunded"];

export type ItemOrder = { id: string; status: string; currency: string; createdAt: string };

export type ItemLine = {
  orderId: string;
  offeringId: string | null;
  label: string;
  units: number;
  totalCents: number;
  refundedCents: number;
};

export type SalesItemVariantRow = {
  label: string;
  quantity: number;
  grossCents: number;
  refundedCents: number;
  netCents: number;
};

export type SalesItemRow = {
  key: string;
  offeringId: string | null;
  title: string;
  currency: string;
  quantity: number;
  grossCents: number;
  refundedCents: number;
  netCents: number;
  orderCount: number;
  /** Sub-rows by line label (size, extras). Their sums equal the row's totals. Empty for custom lines. */
  variants: SalesItemVariantRow[];
};

/** The part of a line label after the item title ("Burger · Large" -> "Large"). */
export function variantLabel(title: string, label: string): string {
  const prefix = `${title} · `;
  return title && label.startsWith(prefix) ? label.slice(prefix.length) : label;
}

export function aggregateSalesByItem(
  lines: readonly ItemLine[],
  orders: readonly ItemOrder[],
  /** Offering id -> the offering's own title. Names the row; the newest line label is only the fallback. */
  offeringTitles?: ReadonlyMap<string, string>,
): SalesItemRow[] {
  const byOrder = new Map<string, ItemOrder>();
  for (const o of orders) if (SALES_ITEM_ORDER_STATUSES.includes(o.status)) byOrder.set(o.id, o);

  const groups = new Map<string, Omit<SalesItemRow, "variants"> & { orderIds: Set<string>; latest: string; byLabel: Map<string, SalesItemVariantRow> }>();
  for (const l of lines) {
    const o = byOrder.get(l.orderId);
    if (!o) continue;
    const currency = (o.currency || "USD").toUpperCase();
    // A line with no offering (a custom charge) is grouped by its own label,
    // never folded into a real offering.
    const key = `${currency}|${l.offeringId ?? `label:${l.label}`}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        offeringId: l.offeringId,
        title: l.label,
        currency,
        quantity: 0,
        grossCents: 0,
        refundedCents: 0,
        netCents: 0,
        orderCount: 0,
        orderIds: new Set(),
        latest: "",
        byLabel: new Map(),
      };
      groups.set(key, g);
    }
    g.quantity += Number(l.units) || 0;
    g.grossCents += Number(l.totalCents) || 0;
    g.refundedCents += Number(l.refundedCents) || 0;
    g.orderIds.add(l.orderId);
    if (l.offeringId) {
      const v = g.byLabel.get(l.label) ?? { label: l.label, quantity: 0, grossCents: 0, refundedCents: 0, netCents: 0 };
      v.quantity += Number(l.units) || 0;
      v.grossCents += Number(l.totalCents) || 0;
      v.refundedCents += Number(l.refundedCents) || 0;
      v.netCents = v.grossCents - v.refundedCents;
      g.byLabel.set(l.label, v);
    }
    // The newest line's label names the row (an offering may have been renamed).
    if (l.label && o.createdAt >= g.latest) {
      g.title = l.label;
      g.latest = o.createdAt;
    }
  }

  const rows: SalesItemRow[] = [];
  for (const g of groups.values()) {
    const title = (g.offeringId ? offeringTitles?.get(g.offeringId)?.trim() : "") || g.title;
    rows.push({
      key: g.key,
      offeringId: g.offeringId,
      title,
      currency: g.currency,
      quantity: g.quantity,
      grossCents: g.grossCents,
      refundedCents: g.refundedCents,
      netCents: g.grossCents - g.refundedCents,
      orderCount: g.orderIds.size,
      variants: [...g.byLabel.values()]
        .map((v) => ({ ...v, label: variantLabel(title, v.label) }))
        .sort((a, b) => b.netCents - a.netCents || a.label.localeCompare(b.label)),
    });
  }
  rows.sort((a, b) => a.currency.localeCompare(b.currency) || b.netCents - a.netCents || a.title.localeCompare(b.title));
  return rows;
}
