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

import { isValidIanaTimeZone } from "@/lib/scheduling/tz";
import { outstandingCents, salesBucket } from "@/lib/orders/orders-list";

export type PaymentsLocale = "en" | "es" | "fr";

// ── Moments a person reads ──────────────────────────────────────────────

/**
 * A stored instant, rendered on the WORKSPACE's clock and wearing its name.
 *
 * THREE CLOCKS, ONE ANSWER. The row's `paid_at` / `opened_at` is a UTC
 * instant. The server that renders this page runs on UTC in production. The
 * manager reading it stands in the venue. `Intl.DateTimeFormat` with no
 * `timeZone` silently uses the RENDERER's zone, so "Opened 09:03" meant
 * nine in the morning on Vercel's clock and was never labelled as such.
 * `timeZone` is therefore required by the signature, and `timeZoneName:
 * "short"` puts the zone on screen so a figure can never be read as the
 * wrong hour without the reader seeing why.
 *
 * The caller gets that zone from `tenantTimezone`, which is the platform's
 * one ladder (venue, then workspace, then UTC) and only ever returns a zone
 * that parses.
 *
 * REFUSES RATHER THAN ANSWERS. `null` for a missing instant, an unparseable
 * one, or a zone that is not a real IANA zone. Falling back to UTC in that
 * last case would print a confident time that is wrong by hours, which is
 * the failure this function exists to end. The caller renders its own
 * translated "not recorded" line for a `null`.
 */
export function formatVenueDateTime(
  iso: string | null | undefined,
  opts: { locale: string; timeZone: string },
): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  if (!isValidIanaTimeZone(opts.timeZone)) return null;
  // Spelled out field by field rather than `dateStyle`/`timeStyle`, because
  // `Intl` REFUSES `timeZoneName` alongside either of those: pairing them
  // throws "Can't set option timeZoneName when dateStyle is used" at render.
  // The fields below are what `dateStyle: "medium"` + `timeStyle: "short"`
  // produce, plus the zone this function exists to show.
  return new Intl.DateTimeFormat(opts.locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: opts.timeZone,
    timeZoneName: "short",
  }).format(at);
}

// ── Takings by method ───────────────────────────────────────────────────

export type TakingsSourceRow = {
  grossAmountCents: number;
  currency: string;
  /** `booking_transactions.provider` — 'manual', 'stripe', 'mercado_pago_point', etc. */
  provider: string;
  /**
   * `booking_transactions.metadata.paid_via` when the caller found one — only
   * meaningful when `provider === 'manual'` (cash and at-counter card both
   * write `provider: 'manual'`; the tender bag is what tells them apart).
   * `null` when absent, never guessed.
   *
   * THAT COLUMN, not `provider_metadata`. `settleAtDoor` is the only writer of
   * an at-counter tender and it writes `metadata`; reading the provider's bag
   * instead returned `null` for every manual row and collapsed cash and card
   * into one "other" total. See `_data-bridge/payments-activity.ts`.
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

// ── Still owed ──────────────────────────────────────────────────────────

/** The four facts the owed rule reads. Nothing else on an order enters the sum. */
export type OwedSourceRow = {
  status: string;
  currency: string;
  totalCents: number;
  collectedCents: number;
};

/**
 * "Still owed", per currency, over EVERY row handed in.
 *
 * The rule is the Orders desk's own — `salesBucket` decides whether a row is
 * awaiting payment (a cancelled, draft, quoted or refunded order is not, and
 * neither is a complimentary place) and `outstandingCents` decides how much
 * of it is still open. Both are imported rather than restated, so the desk
 * and this page cannot drift apart on what "owed" means.
 *
 * WHY THIS IS NOT `totalsFor` OVER THE DESK'S LIST. The desk's reader stops at
 * the 200 most recent orders, which is right for a list a person scrolls and
 * wrong for a total: an unpaid order older than the newest 200 simply fell
 * out of the figure, and the page still called it the sum. This function
 * takes the whole owed set (`loadTenantOwedOrders` pages through it) and
 * returns only currencies with something owed, so an empty result means
 * nothing is owed rather than nothing was read.
 */
export function sumOwedByCurrency(rows: readonly OwedSourceRow[]): CurrencyTotal[] {
  const buckets = new Map<string, CurrencyTotal>();
  for (const row of rows) {
    if (salesBucket(row) !== "to_pay") continue;
    const owed = outstandingCents(row);
    if (owed <= 0) continue;
    const currency = (row.currency || "USD").toUpperCase();
    let bucket = buckets.get(currency);
    if (!bucket) {
      bucket = { currency, totalCents: 0, count: 0 };
      buckets.set(currency, bucket);
    }
    bucket.totalCents += owed;
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
