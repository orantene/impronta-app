import "server-only";

/**
 * TUL-1466 / TUL-1702: the member's net sales in one Mexico City month of THIS workspace, the base of a percentage
 * rent. Orders count in the month their FIRST payment landed (booking_transactions.paid_at), not the month they were
 * created; each line is NET of its share of the order discount and of refunds (rent-sales-net.ts). Only paid,
 * fulfilled or partially refunded orders in the plan currency; the rent invoices themselves (source_page 'rent') are
 * never part of the base. Every read is paged and fails closed: null = unreadable or too big to read safely.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import { nextRentPeriodOf, zonedMonthStartUtc } from "./rent-cycle";
import { netSalesCents, ordersPaidInWindow, type NetLine, type NetOrder } from "./rent-sales-net";
import { PAGE_SIZE, readAllPages } from "./rent-sales-paging";

/** Money has reached the platform. A payment that was later refunded or disputed still fixes WHEN the order was first paid. */
const PAID_STATES = ["paid", "payout_pending", "payout_sent"];
const FIRST_PAYMENT_STATES = [...PAID_STATES, "refunded", "disputed"];

const CHUNK = 150;
const chunks = <T,>(xs: T[]): T[][] => Array.from({ length: Math.ceil(xs.length / CHUNK) }, (_, i) => xs.slice(i * CHUNK, (i + 1) * CHUNK));

export async function loadMemberSalesBase(
  admin: SupabaseClient,
  p: { tenantId: string; talentProfileId: string; period: string; currency: string },
): Promise<number | null> {
  try {
    const from = zonedMonthStartUtc(p.period).toISOString();
    const to = zonedMonthStartUtc(nextRentPeriodOf(p.period)).toISOString();
    const fail = (where: string, error: unknown): null => {
      logServerError(`rent.salesBase.${where}`, error);
      return null;
    };

    // 1. Orders with a payment in the month (candidates).
    const inMonth = await readAllPages<{ order_id: string | null }>(async (a, b) => {
      const { data, error } = await admin
        .from("booking_transactions")
        .select("order_id")
        .eq("source_tenant_id", p.tenantId)
        .in("status", PAID_STATES)
        .not("order_id", "is", null)
        .gte("paid_at", from)
        .lt("paid_at", to)
        .order("id", { ascending: true })
        .range(a, Math.min(b, a + PAGE_SIZE - 1));
      return Array.isArray(data) ? { rows: data as Array<{ order_id: string | null }>, error: false } : { rows: null, error: true };
    });
    if (!inMonth) return fail("payments", "unreadable");
    const candidates = [...new Set(inMonth.map((r) => r.order_id).filter((x): x is string => !!x))];
    if (candidates.length === 0) return 0;

    // 2. Keep the orders whose FIRST payment is in the month (an earlier payment means an earlier month).
    const paidTimes: Array<{ orderId: string; paidAt: string }> = [];
    for (const ids of chunks(candidates)) {
      const rows = await readAllPages<{ order_id: string; paid_at: string | null }>(async (a, b) => {
        const { data, error } = await admin
          .from("booking_transactions")
          .select("order_id, paid_at")
          .eq("source_tenant_id", p.tenantId)
          .in("status", FIRST_PAYMENT_STATES)
          .in("order_id", ids)
          .order("id", { ascending: true })
          .range(a, Math.min(b, a + PAGE_SIZE - 1));
        return Array.isArray(data) ? { rows: data as Array<{ order_id: string; paid_at: string | null }>, error: false } : { rows: null, error: true };
      });
      if (!rows) return fail("paidTimes", "unreadable");
      for (const r of rows) if (r.paid_at) paidTimes.push({ orderId: r.order_id, paidAt: r.paid_at });
    }
    const inWindow = ordersPaidInWindow(paidTimes, from, to);

    // 3. Those orders (status, currency, discount) and ALL their lines (the discount divides over every line).
    const orders: NetOrder[] = [];
    const lines: NetLine[] = [];
    for (const ids of chunks(inWindow)) {
      const { data: oRows, error: oErr } = await tenantScopedQuery(admin, "orders", p.tenantId)
        .select("id, discount_cents, source_page")
        .in("id", ids)
        .in("status", ["paid", "fulfilled", "partially_refunded"])
        .eq("currency", p.currency);
      if (oErr || !Array.isArray(oRows)) return fail("orders", oErr);
      const keep = (oRows as Array<{ id: string; discount_cents: number | string | null; source_page: string | null }>).filter((o) => o.source_page !== "rent");
      for (const o of keep) orders.push({ id: o.id, discountCents: Number(o.discount_cents) || 0 });
      const keepIds = keep.map((o) => o.id);
      if (keepIds.length === 0) continue;
      const lRows = await readAllPages<{ id: string; order_id: string; talent_profile_id: string | null; total_cents: number | string; refunded_cents: number | string | null; discount_cents: number | string | null }>(async (a, b) => {
        const { data, error } = await tenantScopedQuery(admin, "order_lines", p.tenantId)
          .select("id, order_id, talent_profile_id, total_cents, refunded_cents, discount_cents")
          .in("order_id", keepIds)
          .order("id", { ascending: true })
          .range(a, Math.min(b, a + PAGE_SIZE - 1));
        return Array.isArray(data) ? { rows: data as never, error: false } : { rows: null, error: true };
      });
      if (!lRows) return fail("lines", "unreadable");
      for (const l of lRows) lines.push({ id: l.id, orderId: l.order_id, talentProfileId: l.talent_profile_id, totalCents: Number(l.total_cents) || 0, refundedCents: Number(l.refunded_cents) || 0, discountCents: Number(l.discount_cents) || 0 });
    }
    const total = netSalesCents({ orders, lines, talentProfileId: p.talentProfileId });
    return Number.isSafeInteger(total) ? total : null;
  } catch (err) {
    logServerError("rent.salesBase", err);
    return null;
  }
}
