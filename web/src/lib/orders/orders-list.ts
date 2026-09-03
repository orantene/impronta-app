/**
 * The Orders desk — filtering and shaping, pure and testable.
 *
 * The I/O half is `_data-bridge/orders.ts`; everything that decides WHAT a
 * staff member sees lives here so it can be tested without a database. The
 * Clients page taught this the hard way: its filtering lived inside the loader
 * and could only be checked by rendering a page.
 */

export type OrderListStatus =
  | "draft"
  | "quoted"
  | "pending_payment"
  | "paid"
  | "fulfilled"
  | "cancelled"
  | "refunded"
  | "partially_refunded";

/** The buckets a staff member actually thinks in, not the raw states. */
export type OrderListBucket = "open" | "to_pay" | "settled" | "reversed" | "all";

export type OrderListRow = {
  id: string;
  status: OrderListStatus | string;
  currency: string;
  totalCents: number;
  collectedCents: number;
  sourceChannel: string;
  createdAt: string;
  customerName: string | null;
  customerEmail: string | null;
  lineCount: number;
  /** Null when the order has no conversation yet. */
  inquiryId: string | null;
};

export type OrderListFilter = {
  bucket?: OrderListBucket;
  /** Matches customer name, email, or the order's own id prefix. */
  query?: string | null;
  channel?: string | null;
};

const BUCKETS: Record<Exclude<OrderListBucket, "all">, readonly string[]> = {
  // Still being built or awaiting the client's word. Nothing owed yet.
  open: ["draft", "quoted"],
  // Money is expected. This is the bucket a staff member chases.
  to_pay: ["pending_payment"],
  settled: ["paid", "fulfilled"],
  // Money went back, or the order died. Grouped because both are "not revenue"
  // and a desk reads them together when reconciling.
  reversed: ["cancelled", "refunded", "partially_refunded"],
};

export function bucketOf(status: string): OrderListBucket {
  for (const [bucket, states] of Object.entries(BUCKETS)) {
    if (states.includes(status)) return bucket as OrderListBucket;
  }
  // An unknown state shows in "open" rather than vanishing. A row a staff
  // member cannot see is worse than one in a slightly wrong column.
  return "open";
}

/** What is still owed on this order. Clamped: over-collection is a refund, not a negative. */
export function outstandingCents(row: Pick<OrderListRow, "totalCents" | "collectedCents">): number {
  return Math.max(0, row.totalCents - row.collectedCents);
}

export function filterOrders(
  rows: readonly OrderListRow[],
  filter: OrderListFilter,
): OrderListRow[] {
  const bucket = filter.bucket ?? "all";
  const q = (filter.query ?? "").trim().toLowerCase();
  const channel = (filter.channel ?? "").trim();

  return rows.filter((row) => {
    if (bucket !== "all" && bucketOf(row.status) !== bucket) return false;
    if (channel && row.sourceChannel !== channel) return false;
    if (!q) return true;

    // Id prefix search, because the id is what a staff member has when a
    // customer reads it off a receipt.
    return (
      (row.customerName ?? "").toLowerCase().includes(q)
      || (row.customerEmail ?? "").toLowerCase().includes(q)
      || row.id.toLowerCase().startsWith(q)
    );
  });
}

export type OrderListTotals = {
  count: number;
  /** Gross of what was charged, settled orders only. */
  settledCents: number;
  /** What is still owed across the visible rows. */
  outstandingCents: number;
};

/**
 * Totals for the rows ON SCREEN, not for the tenant.
 *
 * Deliberate: a figure beside a filtered list that silently describes something
 * else is how a staff member reads a number and acts on the wrong one. If a
 * tenant-wide total is wanted it should be labelled as such and computed
 * separately.
 */
export function totalsFor(rows: readonly OrderListRow[]): OrderListTotals {
  let settled = 0;
  let outstanding = 0;
  for (const row of rows) {
    if (bucketOf(row.status) === "settled") settled += row.totalCents;
    if (bucketOf(row.status) === "to_pay") outstanding += outstandingCents(row);
  }
  return { count: rows.length, settledCents: settled, outstandingCents: outstanding };
}

/**
 * Whether a line on this order may be refunded.
 *
 * Money must actually have moved. Refunding a `pending_payment` order would
 * call Stripe for a charge that never completed, and refunding a `draft` is
 * refunding a shopping basket.
 */
export function canRefund(row: Pick<OrderListRow, "status" | "collectedCents">): boolean {
  const settled = ["paid", "fulfilled", "partially_refunded"].includes(row.status);
  return settled && row.collectedCents > 0;
}
