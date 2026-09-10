/**
 * The queries behind every figure the money journey reads.
 *
 * ONE RULE PER FUNCTION, AND EACH IS THE PAGE'S OWN RULE RESTATED IN SQL. That
 * is the point: a cross-check written against a different rule proves the two
 * agree about nothing. `owedCents` is `isMoneyOwed` + `outstandingCents` in
 * words — a pending_payment order with a positive total, minus what PAID
 * transactions landed on it — so a screen that started counting cancelled or
 * draft orders would break these rather than agree with them.
 *
 * WHOLE SETS, NOT WINDOWS. "Still owed" is a total, so `owedOrdersInWorkspace`
 * pages through every order in the owed state rather than the 200 most recent
 * the Orders desk lists. The page used to sum the desk's window and call it
 * the total; this helper read the same window and would have agreed with it
 * on any workspace past 200 orders. Both now read the set.
 */
import { isolatedService, JOURNEYS_TENANT_ID } from "./_isolated-db";

export type OrderFact = {
  id: string;
  status: string;
  currency: string;
  totalCents: number;
  collectedCents: number;
  customerId: string | null;
  inquiryId: string | null;
  createdAt: string;
};

/** What PAID transactions landed on each order: the desk's own collected rule. */
async function collectedByOrder(orderIds: string[]): Promise<Map<string, number>> {
  const sb = isolatedService();
  const collected = new Map<string, number>();
  if (orderIds.length === 0) return collected;
  const { data, error } = await sb
    .from("booking_transactions")
    .select("order_id, gross_amount_cents")
    .in("order_id", orderIds)
    .eq("status", "paid");
  if (error) throw new Error(`collectedByOrder: ${error.message}`);
  for (const raw of data ?? []) {
    const row = raw as { order_id: string | null; gross_amount_cents: number | string | null };
    if (!row.order_id) continue;
    collected.set(row.order_id, (collected.get(row.order_id) ?? 0) + Number(row.gross_amount_cents ?? 0));
  }
  return collected;
}

type RawOrder = {
  id: string;
  status: string;
  currency: string | null;
  total_cents: number | string;
  customer_id: string | null;
  inquiry_id: string | null;
  created_at: string;
};

const PAGE = 500;

async function toFacts(rows: RawOrder[]): Promise<OrderFact[]> {
  const collected = new Map<string, number>();
  for (let i = 0; i < rows.length; i += PAGE) {
    const part = await collectedByOrder(rows.slice(i, i + PAGE).map((r) => r.id));
    for (const [k, v] of part) collected.set(k, v);
  }
  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    currency: (r.currency ?? "USD").toUpperCase(),
    totalCents: Number(r.total_cents ?? 0),
    collectedCents: collected.get(r.id) ?? 0,
    customerId: r.customer_id,
    inquiryId: r.inquiry_id,
    createdAt: r.created_at,
  }));
}

/** Every order of the workspace, paged, with what has landed on each. */
export async function allOrdersInWorkspace(): Promise<OrderFact[]> {
  const sb = isolatedService();
  const rows: RawOrder[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from("orders")
      .select("id, status, currency, total_cents, customer_id, inquiry_id, created_at")
      .eq("tenant_id", JOURNEYS_TENANT_ID)
      .order("created_at", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`allOrdersInWorkspace: ${error.message}`);
    const page = (data ?? []) as RawOrder[];
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return toFacts(rows);
}

/**
 * The owed SET: the page's own predicate at the query (`pending_payment`,
 * positive total), then what landed on each. What "Still owed" must sum.
 */
export async function owedOrdersInWorkspace(): Promise<OrderFact[]> {
  const sb = isolatedService();
  const rows: RawOrder[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from("orders")
      .select("id, status, currency, total_cents, customer_id, inquiry_id, created_at")
      .eq("tenant_id", JOURNEYS_TENANT_ID)
      .eq("status", "pending_payment")
      .gt("total_cents", 0)
      .order("created_at", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`owedOrdersInWorkspace: ${error.message}`);
    const page = (data ?? []) as RawOrder[];
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return toFacts(rows);
}

/**
 * `isMoneyOwed` + `outstandingCents`, in SQL terms.
 *
 * A draft, a quote, a cancelled order and a refunded one owe nothing; a
 * complimentary place (total 0) is settled rather than overdue.
 */
export function owedCents(row: Pick<OrderFact, "status" | "totalCents" | "collectedCents">): number {
  if (row.totalCents <= 0) return 0;
  if (row.status !== "pending_payment") return 0;
  return Math.max(0, row.totalCents - row.collectedCents);
}

/** What "Still owed" must read, per currency, over the rows the reader sees. */
export function owedByCurrency(rows: readonly OrderFact[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const row of rows) {
    const owed = owedCents(row);
    if (owed === 0) continue;
    out.set(row.currency, (out.get(row.currency) ?? 0) + owed);
  }
  return out;
}

export type TakingsBucket = { method: string; currency: string; totalCents: number; count: number };

/**
 * Takings by method, from `booking_transactions`.
 *
 * The method is `paymentMethodKey`'s rule: a manual row is told apart by
 * `metadata.paid_via` (cash, card, or neither), and any other provider names
 * its own rail.
 */
export async function takingsByMethod(): Promise<TakingsBucket[]> {
  const sb = isolatedService();
  const { data, error } = await sb
    .from("booking_transactions")
    .select("gross_amount_cents, currency, provider, metadata")
    .eq("source_tenant_id", JOURNEYS_TENANT_ID)
    .eq("status", "paid")
    .order("paid_at", { ascending: false })
    .limit(1000);
  if (error) throw new Error(`takingsByMethod: ${error.message}`);
  const buckets = new Map<string, TakingsBucket>();
  for (const raw of data ?? []) {
    const row = raw as {
      gross_amount_cents: number | string;
      currency: string | null;
      provider: string | null;
      metadata: unknown;
    };
    const provider = row.provider ?? "manual";
    const meta = row.metadata && typeof row.metadata === "object" ? (row.metadata as Record<string, unknown>) : {};
    const paidVia = typeof meta.paid_via === "string" ? meta.paid_via : null;
    const method =
      provider === "manual"
        ? paidVia === "cash"
          ? "cash"
          : paidVia === "card"
            ? "card_manual"
            : "manual_other"
        : provider;
    const currency = (row.currency ?? "USD").toUpperCase();
    const key = `${currency}:${method}`;
    const bucket = buckets.get(key) ?? { method, currency, totalCents: 0, count: 0 };
    bucket.totalCents += Number(row.gross_amount_cents ?? 0);
    bucket.count += 1;
    buckets.set(key, bucket);
  }
  return [...buckets.values()];
}

export type DrawerFact = {
  id: string;
  status: string;
  openingCashCents: number;
  closingCashCents: number | null;
  expectedCashCents: number | null;
};

export async function drawerSession(shiftId: string): Promise<DrawerFact | null> {
  const sb = isolatedService();
  const { data, error } = await sb
    .from("pos_shifts")
    .select("id, status, opening_cash_cents, closing_cash_cents, expected_cash_cents")
    .eq("id", shiftId)
    .maybeSingle();
  if (error) throw new Error(`drawerSession: ${error.message}`);
  if (!data) return null;
  const row = data as {
    id: string;
    status: string;
    opening_cash_cents: number | string;
    closing_cash_cents: number | string | null;
    expected_cash_cents: number | string | null;
  };
  return {
    id: row.id,
    status: row.status,
    openingCashCents: Number(row.opening_cash_cents ?? 0),
    closingCashCents: row.closing_cash_cents == null ? null : Number(row.closing_cash_cents),
    expectedCashCents: row.expected_cash_cents == null ? null : Number(row.expected_cash_cents),
  };
}

/** The open shift for this workspace, if any. */
export async function openShiftId(): Promise<string | null> {
  const sb = isolatedService();
  const { data, error } = await sb
    .from("pos_shifts")
    .select("id")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .eq("status", "open")
    .maybeSingle();
  if (error) throw new Error(`openShiftId: ${error.message}`);
  return (data as { id: string } | null)?.id ?? null;
}

export async function orderById(orderId: string): Promise<OrderFact | null> {
  const sb = isolatedService();
  const { data, error } = await sb
    .from("orders")
    .select("id, status, currency, total_cents, customer_id, inquiry_id, created_at")
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw new Error(`orderById: ${error.message}`);
  if (!data) return null;
  const row = data as {
    id: string;
    status: string;
    currency: string | null;
    total_cents: number | string;
    customer_id: string | null;
    inquiry_id: string | null;
    created_at: string;
  };
  const collected = await collectedByOrder([row.id]);
  return {
    id: row.id,
    status: row.status,
    currency: (row.currency ?? "USD").toUpperCase(),
    totalCents: Number(row.total_cents ?? 0),
    collectedCents: collected.get(row.id) ?? 0,
    customerId: row.customer_id,
    inquiryId: row.inquiry_id,
    createdAt: row.created_at,
  };
}

/** The project a conversation was converted into, if it was. */
export async function bookingOnInquiry(inquiryId: string): Promise<{ id: string; orderId: string | null } | null> {
  const sb = isolatedService();
  const { data, error } = await sb
    .from("agency_bookings")
    .select("id, order_id")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .eq("source_inquiry_id", inquiryId)
    .maybeSingle();
  if (error) throw new Error(`bookingOnInquiry: ${error.message}`);
  const row = data as { id: string; order_id: string | null } | null;
  return row ? { id: row.id, orderId: row.order_id } : null;
}

/** Every order attached to a project's conversation. The Projects reader's own join. */
export async function ordersOnInquiry(inquiryId: string): Promise<OrderFact[]> {
  const sb = isolatedService();
  const { data, error } = await sb
    .from("orders")
    .select("id, status, currency, total_cents, customer_id, inquiry_id, created_at")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .eq("inquiry_id", inquiryId);
  if (error) throw new Error(`ordersOnInquiry: ${error.message}`);
  const rows = (data ?? []) as Array<{
    id: string;
    status: string;
    currency: string | null;
    total_cents: number | string;
    customer_id: string | null;
    inquiry_id: string | null;
    created_at: string;
  }>;
  const collected = await collectedByOrder(rows.map((r) => r.id));
  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    currency: (r.currency ?? "USD").toUpperCase(),
    totalCents: Number(r.total_cents ?? 0),
    collectedCents: collected.get(r.id) ?? 0,
    customerId: r.customer_id,
    inquiryId: r.inquiry_id,
    createdAt: r.created_at,
  }));
}

export type ShiftCashRow = { transactionId: string; orderId: string | null; grossAmountCents: number };

/**
 * `expectedCashForShift`'s rule: every PAID transaction whose tender bag names
 * this shift and was taken in cash. The drawer's Expected must be the float
 * plus exactly these rows, no more and no fewer.
 */
export async function cashTakenOnShift(shiftId: string): Promise<ShiftCashRow[]> {
  const sb = isolatedService();
  const { data, error } = await sb
    .from("booking_transactions")
    .select("id, order_id, gross_amount_cents, metadata")
    .eq("source_tenant_id", JOURNEYS_TENANT_ID)
    .eq("status", "paid")
    .contains("metadata", { shift_id: shiftId, paid_via: "cash" });
  if (error) throw new Error(`cashTakenOnShift: ${error.message}`);
  return ((data ?? []) as Array<{ id: string; order_id: string | null; gross_amount_cents: number | string }>).map(
    (r) => ({ transactionId: r.id, orderId: r.order_id, grossAmountCents: Number(r.gross_amount_cents ?? 0) }),
  );
}

/**
 * Money exactly as the screens print it.
 *
 * `formatOrderMoney` is the platform's ONE formatter (see its own header for
 * why `Intl` was rejected), so the cross-check imports it rather than rolling a
 * second one: a helper that formatted `$1,234.00` while the page printed
 * `1,234.00 USD` would fail on a true figure.
 */
export { formatOrderMoney as money } from "@/lib/orders/money-format";
