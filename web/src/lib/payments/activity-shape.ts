/**
 * Pure shaping for the Payments page — "what actually moved."
 *
 * Every row here traces to a `booking_transactions` row or a `pos_shifts`
 * row (see `_data-bridge/payments-activity.ts` for the reads). Nothing in
 * this module invents a figure: it only groups, sums, and labels rows that
 * were already read.
 *
 * Grouped PER CURRENCY, same discipline as `lib/orders/orders-list.ts`'s
 * `totalsFor` — summing 100000 ARS and 50 USD into one number is a
 * plausible, confidently labelled, wrong figure. Never done here.
 */

export type PaymentsLocale = "en" | "es" | "fr";

// ── Takings by method ───────────────────────────────────────────────────

export type TakingsSourceRow = {
  grossAmountCents: number;
  currency: string;
  /** `booking_transactions.provider` — 'manual', 'stripe', 'mercado_pago_point', etc. */
  provider: string;
  /**
   * `booking_transactions.provider_metadata.paid_via` when the caller found
   * one — only meaningful when `provider === 'manual'` (cash and at-counter
   * card both write `provider: 'manual'`; the metadata is what tells them
   * apart). `null` when absent, never guessed.
   */
  paidVia: string | null;
};

export type PaymentMethodKey =
  | "cash"
  | "card_manual"
  | "manual_other"
  | (string & {});

/**
 * A provider row on its own does not say HOW cash was collected — cash and
 * an at-counter card swipe both write `provider: 'manual'` (see
 * `settle-at-door.ts`); `paidVia` is what tells them apart. Any other
 * provider (stripe, mercado_pago_point, stripe_terminal, ...) already names
 * its own rail, so it passes through unchanged rather than being collapsed
 * into a generic "card" bucket that would hide which processor actually
 * moved the money.
 */
export function paymentMethodKey(row: { provider: string; paidVia: string | null }): PaymentMethodKey {
  if (row.provider === "manual") {
    if (row.paidVia === "cash") return "cash";
    if (row.paidVia === "card") return "card_manual";
    return "manual_other";
  }
  return row.provider;
}

const METHOD_LABEL_KEYS: Record<string, string> = {
  cash: "methodCash",
  card_manual: "methodCardManual",
  manual_other: "methodManualOther",
  stripe: "methodStripe",
  stripe_terminal: "methodStripeTerminal",
  mercado_pago: "methodMercadoPago",
  mercado_pago_point: "methodMercadoPagoPoint",
};

/**
 * The `dashboard.payments.*` message key for a method, or `null` for a
 * method this module does not have a translated label for. A `null` here
 * must render the raw method string, never disappear — an unrecognised
 * payment rail is exactly the kind of row a manager most needs to see.
 */
export function paymentMethodLabelKey(method: string): string | null {
  return METHOD_LABEL_KEYS[method] ?? null;
}

export type TakingsByMethod = {
  method: PaymentMethodKey;
  currency: string;
  totalCents: number;
  count: number;
};

export function groupTakingsByMethod(rows: readonly TakingsSourceRow[]): TakingsByMethod[] {
  const buckets = new Map<string, TakingsByMethod>();
  for (const row of rows) {
    const method = paymentMethodKey(row);
    const currency = (row.currency || "USD").toUpperCase();
    const key = `${currency}:${method}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { method, currency, totalCents: 0, count: 0 };
      buckets.set(key, bucket);
    }
    bucket.totalCents += row.grossAmountCents;
    bucket.count += 1;
  }
  return [...buckets.values()].sort((a, b) => {
    if (a.currency !== b.currency) return a.currency.localeCompare(b.currency);
    return b.totalCents - a.totalCents;
  });
}

// ── Currency totals (used for takings, refunds, and owed headers) ──────

export type CurrencyTotal = {
  currency: string;
  totalCents: number;
  count: number;
};

export function sumByCurrency(
  rows: readonly { grossAmountCents: number; currency: string }[],
): CurrencyTotal[] {
  const buckets = new Map<string, CurrencyTotal>();
  for (const row of rows) {
    const currency = (row.currency || "USD").toUpperCase();
    let bucket = buckets.get(currency);
    if (!bucket) {
      bucket = { currency, totalCents: 0, count: 0 };
      buckets.set(currency, bucket);
    }
    bucket.totalCents += row.grossAmountCents;
    bucket.count += 1;
  }
  return [...buckets.values()].sort((a, b) => a.currency.localeCompare(b.currency));
}

// ── Cash drawer sessions ────────────────────────────────────────────────

export type DrawerSessionRow = {
  id: string;
  status: "open" | "closed";
  openedAt: string | null;
  closedAt: string | null;
  openingCashCents: number;
  closingCashCents: number | null;
  expectedCashCents: number | null;
};

export type DrawerSessionView = DrawerSessionRow & {
  /** `closingCashCents - expectedCashCents`. `null` on an open shift — there is nothing to compare yet, not a zero. */
  varianceCents: number | null;
};

export function withVariance(row: DrawerSessionRow): DrawerSessionView {
  const varianceCents =
    row.closingCashCents != null && row.expectedCashCents != null
      ? row.closingCashCents - row.expectedCashCents
      : null;
  return { ...row, varianceCents };
}
