/**
 * usd-literal-ban.static.test.ts - no NEW silent USD fallback in a money path.
 *
 * A `?? "USD"`, `|| "USD"` or `= "USD"` default on a charge / order / price /
 * offering / link / POS / cart / transaction / refund / ledger path creates or
 * charges money in USD when the seller, order or workspace is MXN or unknown.
 * The currency must be RESOLVED (order currency, seller default_currency,
 * workspace default_currency) and an unreadable one must fail closed.
 *
 * Every remaining hit is pinned below (file -> count) as a reviewed class-(a)
 * use: a display fallback for a legacy row that already carries its currency,
 * a Stripe-API lowercasing of a resolved code, the platform operating
 * currency, or a comparison. A new fallback anywhere under the scanned
 * directories fails here. If you believe a new one is legitimate, add it to
 * the allow-list in the same PR with the reason; do not widen a count to
 * silence a charge/create path.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCAN_DIRS = [
  "lib/payments",
  "lib/stripe",
  "lib/bookings",
  "lib/storefront",
  "lib/pos",
  "lib/orders",
  "lib/ledger",
  "lib/catalog",
  "lib/talent-agenda",
  "lib/messaging",
  "lib/server-actions",
];
const SCAN_FILES_BY_PREFIX = ["lib/talent/offerings"];
const FALLBACK = /(\?\?|\|\||[^=!<>]=(?!=))\s*["'](USD|usd)["']/g;

/** file (relative to src/) -> reviewed class-(a) count. */
const ALLOWED: Record<string, number> = {
  "lib/bookings/commission.ts": 1, // display/commission shape of a persisted row
  "lib/bookings/transactions.ts": 3, // labels of an already-persisted transaction currency
  "lib/messaging/client-link.ts": 2, // display of a persisted offer currency
  "lib/messaging/money.ts": 2, // read-side card money, legacy rows
  "lib/messaging/payment-card-sync.ts": 3, // card display of persisted rows
  "lib/messaging/post-payment-cards.ts": 2, // card display of a persisted sale
  "lib/messaging/sheets.ts": 1, // sheet display of a persisted offer
  "lib/messaging/talent-actor.ts": 1, // card display of a persisted sale
  "lib/messaging/talent-pov.ts": 1, // formatter fallback
  "lib/orders/display-currency.ts": 1, // BILLING_CURRENCY: platform billing is USD
  "lib/orders/money-format.ts": 1, // formatter fallback
  "lib/orders/orders-for-thread.ts": 1, // thread display of a persisted order
  "lib/orders/orders-list.ts": 1, // list grouping of a persisted order
  "lib/ledger/run-projection.ts": 5, // projection of persisted rows (columns NOT NULL)
  "lib/payments/activity-shape.ts": 3, // activity display of persisted rows
  "lib/payments/balance-transactions.ts": 2, // Stripe balance txn code, uppercased for display
  "lib/payments/booking-confirmation-pdf.ts": 2, // PDF display
  "lib/payments/booking-confirmation.ts": 1, // receipt of a persisted txn (txn.currency wins)
  "lib/payments/links-board.ts": 1, // board display of a persisted link
  "lib/payments/links.ts": 1, // confirm path: settle-at-door now refuses a currency that differs from the order
  "lib/payments/payout-countries.ts": 1, // country -> payout currency map default
  "lib/payments/payout-reversal-notify.ts": 2, // notification text
  "lib/payments/provider-disputes.ts": 1, // Stripe dispute code, uppercased for display
  "lib/payments/provider-invoices.ts": 1, // Stripe invoice code, uppercased for display
  "lib/payments/provider-payouts.ts": 1, // Stripe payout code, uppercased for display
  "lib/payments/refund-execute.ts": 1, // eligibility readout of a persisted txn (currency NOT NULL)
  "lib/payments/transfers.ts": 2, // Stripe API lowercase of the settled txn currency
  "lib/pos/classes/day.ts": 3, // day-sheet display of persisted orders
  "lib/pos/draft.ts": 2, // addLine currency comparisons of persisted rows (createDraftOrder resolves the workspace default)
  "lib/pos/sale-read.ts": 1, // sale display of a persisted order
  "lib/server-actions/admin-discount-stripe-import.ts": 1, // Stripe coupon code, uppercased
  "lib/server-actions/admin-product-discounts.ts": 1, // label text
  "lib/server-actions/admin-roster-rates.ts": 3, // read-side labels for legacy talents/rows; creates use the talent default_currency
  "lib/server-actions/booking-policy-overrides-settings.ts": 1, // settings display
  "lib/server-actions/messaging-client.ts": 2, // card/offer display of persisted rows
  "lib/server-actions/messaging-engine.ts": 2, // read-side card payloads of persisted rows
  "lib/server-actions/messaging-offers.ts": 2, // offer currency is overridden by followSeller; seed copies the order currency
  "lib/server-actions/messaging-sheets.ts": 1, // sheet display
  "lib/server-actions/talent-plan-summary.ts": 1, // plan catalog is USD
  "lib/server-actions/workspace-plan-summary.ts": 1, // plan catalog is USD
  "lib/storefront/appointment-picker.core.ts": 1, // storefront read of a persisted offering
  "lib/storefront/cart-checkout.core.ts": 2, // read of a persisted order
  "lib/storefront/catalog-grid.core.ts": 1, // read-side grid header
  "lib/storefront/class-timetable.core.ts": 2, // read of persisted rows
  "lib/storefront/order-lookup.core.ts": 1, // read of a persisted order
  "lib/storefront/package-selector.core.ts": 2, // read of persisted offerings
  "lib/storefront/portal-entry.core.ts": 1, // read of a persisted offering
  "lib/storefront/service-collection.core.ts": 1, // read of a persisted offering
  "lib/stripe/talent-domain-billing.ts": 1, // domain purchase is USD
  "lib/stripe/webhook-handler.ts": 1, // log text of a Stripe dispute code
  "lib/stripe/webhook-routing.ts": 6, // Stripe event codes recorded as received
  "lib/talent-agenda/refund-actions.ts": 1, // result shape; real currency comes from executeBookingRefund
  "lib/talent/offerings-money.ts": 1, // formatter fallback
  "lib/talent/offerings-types.ts": 2, // normalizers; write path validates isTalentCurrency
};

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) && !name.endsWith(".d.ts")) out.push(full);
  }
}

function scan(): Record<string, number> {
  const files: string[] = [];
  for (const d of SCAN_DIRS) walk(join(SRC, d), files);
  const libTalent: string[] = [];
  walk(join(SRC, "lib/talent"), libTalent);
  for (const f of libTalent) {
    const rel = relative(SRC, f);
    if (SCAN_FILES_BY_PREFIX.some((p) => rel.startsWith(p))) files.push(f);
  }
  const counts: Record<string, number> = {};
  for (const f of files) {
    const hits = readFileSync(f, "utf8").match(FALLBACK);
    if (hits) counts[relative(SRC, f)] = hits.length;
  }
  return counts;
}

test("no money-path file gains a USD fallback beyond the reviewed allow-list", () => {
  const found = scan();
  const problems: string[] = [];
  for (const [file, n] of Object.entries(found)) {
    const allowed = ALLOWED[file] ?? 0;
    if (n > allowed) problems.push(`${file}: ${n} USD fallback(s), ${allowed} allowed`);
  }
  assert.deepEqual(problems, [], `New hard-coded USD fallback in a money path. Resolve the currency (order / seller / workspace) and fail closed instead:\n${problems.join("\n")}`);
});

test("the allow-list does not carry stale entries (ratchet down when a fallback is removed)", () => {
  const found = scan();
  const stale = Object.entries(ALLOWED)
    .filter(([file, n]) => (found[file] ?? 0) < n)
    .map(([file, n]) => `${file}: allows ${n}, found ${found[file] ?? 0}`);
  assert.deepEqual(stale, [], `Lower these allow-list counts:\n${stale.join("\n")}`);
});
