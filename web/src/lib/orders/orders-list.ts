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

export type OrderListCurrencyTotal = {
  currency: string;
  settledCents: number;
  outstandingCents: number;
};

export type OrderListTotals = {
  count: number;
  /** Gross of what was charged, settled orders only. */
  settledCents: number;
  /** What is still owed across the visible rows. */
  outstandingCents: number;
  /**
   * The currency the two figures above are denominated in, or `null` when the
   * rows span MORE THAN ONE currency -- in which case those sums add different
   * minor units together and mean nothing. Callers must check this before
   * rendering them.
   */
  currency: string | null;
  /** Per-currency breakdown. One entry in the ordinary case. */
  byCurrency: OrderListCurrencyTotal[];
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
  // Totalled PER CURRENCY. `orders.currency` is per row, so a tenant that has
  // ever changed its default currency can produce a mixed list -- and adding
  // 100000 ARS to 50 USD yields a number that is plausibly shaped, confidently
  // labelled, and wrong in a way nobody can see by looking at it.
  const buckets = new Map<string, OrderListCurrencyTotal>();
  for (const row of rows) {
    const currency = (row.currency || "USD").toUpperCase();
    let b = buckets.get(currency);
    if (!b) {
      b = { currency, settledCents: 0, outstandingCents: 0 };
      buckets.set(currency, b);
    }
    if (bucketOf(row.status) === "settled") b.settledCents += row.totalCents;
    if (bucketOf(row.status) === "to_pay") b.outstandingCents += outstandingCents(row);
  }
  const byCurrency = [...buckets.values()].sort((a, b) => a.currency.localeCompare(b.currency));

  // The flat figures stay for the ordinary single-currency case, and are only
  // meaningful when `currency` is non-null. Mixed lists get zeros here so a
  // caller that ignores `currency` shows an obvious nothing rather than a
  // convincing wrong number.
  const single = byCurrency.length === 1 ? byCurrency[0] : null;
  return {
    count: rows.length,
    settledCents: single?.settledCents ?? 0,
    outstandingCents: single?.outstandingCents ?? 0,
    currency: single?.currency ?? null,
    byCurrency,
  };
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
