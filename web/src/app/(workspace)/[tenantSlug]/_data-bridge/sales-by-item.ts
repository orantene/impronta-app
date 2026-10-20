import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { aggregateSalesByItem, SALES_ITEM_ORDER_STATUSES, type ItemLine, type ItemOrder, type SalesItemRow } from "@/lib/sales/by-item";
import type { SalesMethod, SalesRange } from "@/lib/sales/period";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import { orderIdsPaidWith, readAllPages } from "./sales-method";

export type SalesByItemLoad = { ok: true; rows: SalesItemRow[] } | { ok: false };

const SLICE = 100;

/**
 * Sales by item for one workspace: paid orders in the period (and, when
 * asked, paid with one method), their `order_lines` grouped by offering.
 * Read only; every amount is the stored line amount. A read error is a
 * failed load, never an empty table.
 */
export async function loadSalesByItem(
  tenantId: string,
  opts: { range?: SalesRange; method?: SalesMethod } = {},
  client?: SupabaseClient | null,
): Promise<SalesByItemLoad> {
  const admin = client ?? createServiceRoleClient();
  if (!admin) return { ok: false };

  const ordersRes = await readAllPages<{ id: string; status: string; currency: string; created_at: string }>((from, to) => {
    let q = tenantScopedQuery(admin, "orders", tenantId)
      .select("id, status, currency, created_at")
      .in("status", [...SALES_ITEM_ORDER_STATUSES]);
    if (opts.range?.from) q = q.gte("created_at", opts.range.from);
    if (opts.range?.to) q = q.lt("created_at", opts.range.to);
    return q.order("id").range(from, to);
  });
  if (ordersRes.error) {
    logServerError("dataBridge.salesByItem/orders", ordersRes.error);
    return { ok: false };
  }

  let orders: ItemOrder[] = ordersRes.data.map((o) => ({
    id: o.id,
    status: o.status,
    currency: o.currency,
    createdAt: o.created_at,
  }));

  const matching = await orderIdsPaidWith(admin, orders.map((o) => o.id), opts.method ?? "any");
  if (matching === undefined) return { ok: false };
  if (matching) orders = orders.filter((o) => matching.has(o.id));

  const lines: ItemLine[] = [];
  for (let i = 0; i < orders.length; i += SLICE) {
    const slice = orders.slice(i, i + SLICE).map((o) => o.id);
    const res = await readAllPages<{
      order_id: string;
      offering_id: string | null;
      label: string;
      units: number;
      total_cents: number;
      refunded_cents: number;
    }>((from, to) =>
      tenantScopedQuery(admin, "order_lines", tenantId)
        .select("order_id, offering_id, label, units, total_cents, refunded_cents")
        .in("order_id", slice)
        .order("id")
        .range(from, to),
    );
    if (res.error) {
      logServerError("dataBridge.salesByItem/lines", res.error);
      return { ok: false };
    }
    for (const l of res.data) {
      lines.push({
        orderId: l.order_id,
        offeringId: l.offering_id,
        label: l.label,
        units: Number(l.units ?? 0),
        totalCents: Number(l.total_cents ?? 0),
        refundedCents: Number(l.refunded_cents ?? 0),
      });
    }
  }

  // The row is named after the offering itself, not its newest line label
  // (which carries the size and extras). A failed title read is non-fatal:
  // the aggregator falls back to the line label.
  const titles = new Map<string, string>();
  const ids = [...new Set(lines.map((l) => l.offeringId).filter((id): id is string => !!id))];
  for (let i = 0; i < ids.length; i += SLICE) {
    const res = await readAllPages<{ id: string; title: string | null }>((from, to) =>
      tenantScopedQuery(admin, "talent_offerings", tenantId)
        .select("id, title")
        .in("id", ids.slice(i, i + SLICE))
        .order("id")
        .range(from, to),
    );
    if (res.error) {
      logServerError("dataBridge.salesByItem/titles", res.error);
      continue;
    }
    for (const o of res.data) if (o.title) titles.set(o.id, o.title);
  }

  return { ok: true, rows: aggregateSalesByItem(lines, orders, titles) };
}
