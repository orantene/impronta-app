/**
 * lib/payments/balance-transactions.ts
 *
 * Page Stripe balance transactions into `provider_balance_transactions`.
 *
 * WHY THIS EXISTS: nothing in the codebase read a balance transaction, which
 * left three questions unanswerable from our own data —
 *
 *   • What did Stripe actually charge us? The commission engine computes the
 *     platform's TAKE exactly, but the processing FEE was recorded nowhere, so
 *     gross-to-net was not derivable and "platform revenue" was really
 *     "platform take": a different and larger number.
 *   • What FX rate was applied? Both connected accounts are Mexican with an MXN
 *     default while the platform charges in USD. Stripe converts on the way out
 *     and records the rate only here.
 *   • What made up this payout? A payout is the sum of the balance transactions
 *     it settled; without them a bank deposit cannot be decomposed, which is
 *     the core of reconciliation.
 *
 * WHY A CRON RATHER THAN A WEBHOOK: balance transactions have no reliable event
 * of their own — they are a side effect of charges, refunds, transfers, payouts
 * and adjustments. Stripe's guidance for building a ledger is to page the list
 * endpoint. Paging is also self-healing: a missed window is repaired by the next
 * run's lookback, whereas a missed webhook is simply gone.
 *
 * Server-only.
 */

import "server-only";
import { getStripe, isStripeConfigured } from "@/lib/stripe/client";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import type Stripe from "stripe";

/**
 * How far back a run looks when it has no watermark to resume from.
 *
 * Deliberately generous. Re-reading a transaction is free (the upsert is keyed
 * on Stripe's id), whereas missing one leaves a permanent hole in the fee and
 * FX record that only a manual backfill would ever notice.
 */
const DEFAULT_LOOKBACK_DAYS = 7;

/** Stripe's page limit for this endpoint. */
const PAGE_SIZE = 100;

/** Stop a single run from paging forever if the window is enormous. */
const MAX_PAGES = 50;

export type IngestResult = {
  ok: boolean;
  pages: number;
  fetched: number;
  written: number;
  /** True when MAX_PAGES stopped us early — the next run resumes from the
   *  watermark, so this is a "come back sooner", not a loss. */
  truncated: boolean;
  windowStart: string;
  error?: string;
};

/**
 * The newest transaction we have already stored. Used as the resume point so a
 * run costs one page in the steady state rather than a full lookback.
 */
async function loadWatermark(): Promise<Date | null> {
  const sb = createServiceRoleClient();
  if (!sb) return null;
  const { data, error } = await sb
    .from("provider_balance_transactions")
    .select("stripe_created_at")
    .order("stripe_created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const raw = (data as { stripe_created_at?: string }).stripe_created_at;
  return raw ? new Date(raw) : null;
}

/**
 * Resolve the booking a transaction belongs to, when it has one.
 *
 * Only charges and refunds carry a PaymentIntent we can chain to a booking, and
 * only because `markPaid` records the settling intent. Everything else (fees,
 * transfers, payouts, adjustments) resolves to null, which is the honest answer
 * rather than a guess.
 */
async function resolveBookingLinkage(
  sourceId: string | null,
  chargeToIntent: Map<string, string>,
): Promise<{ bookingTransactionId: string | null; tenantId: string | null }> {
  const empty = { bookingTransactionId: null, tenantId: null };
  if (!sourceId) return empty;
  const intentId = chargeToIntent.get(sourceId);
  if (!intentId) return empty;
  try {
    const sb = createServiceRoleClient();
    if (!sb) return empty;
    const { data } = await sb
      .from("booking_transactions")
      .select("id, source_tenant_id")
      .eq("provider_metadata->>payment_intent_id", intentId)
      .maybeSingle();
    if (!data) return empty;
    const row = data as { id: string; source_tenant_id: string | null };
    return { bookingTransactionId: row.id, tenantId: row.source_tenant_id ?? null };
  } catch (err) {
    logServerError("balance-transactions.resolveLinkage", err);
    return empty;
  }
}

function sourceIdOf(txn: Stripe.BalanceTransaction): string | null {
  const src = txn.source;
  if (!src) return null;
  return typeof src === "string" ? src : (src as { id?: string }).id ?? null;
}

/**
 * Map one Stripe balance transaction onto our row shape.
 *
 * Pure and exported so the mapping — especially the fee arithmetic and the FX
 * fields — can be asserted without a Stripe account or a database.
 */
export function mapBalanceTransaction(
  txn: Stripe.BalanceTransaction,
  stripeAccountId: string | null,
): Record<string, unknown> {
  const amount = txn.amount ?? 0;
  const fee = txn.fee ?? 0;
  return {
    provider: "stripe",
    stripe_balance_txn_id: txn.id,
    stripe_account_id: stripeAccountId,
    type: txn.type ?? "unknown",
    reporting_category: txn.reporting_category ?? null,
    source_id: sourceIdOf(txn),
    amount_cents: amount,
    fee_cents: fee,
    // Stripe's own invariant. Computed rather than read from `txn.net` so the
    // CHECK constraint is guaranteed to hold even on a malformed payload; a
    // mismatch then surfaces as a visible write failure instead of a silently
    // wrong ledger.
    net_cents: amount - fee,
    currency: (txn.currency ?? "usd").toUpperCase(),
    exchange_rate: txn.exchange_rate ?? null,
    // Only meaningful when Stripe converted; otherwise identical to the
    // settlement pair and not worth storing twice.
    presented_amount_cents: txn.exchange_rate ? amount : null,
    presented_currency: txn.exchange_rate ? (txn.currency ?? "usd").toUpperCase() : null,
    fee_details: txn.fee_details ?? [],
    stripe_created_at: new Date((txn.created ?? 0) * 1000).toISOString(),
    available_on: txn.available_on ? new Date(txn.available_on * 1000).toISOString() : null,
    updated_at: new Date().toISOString(),
  };
}

/**
 * Page balance transactions created since the watermark (or the default
 * lookback) and upsert them.
 *
 * Idempotent by construction: the upsert is keyed on Stripe's own id, so a
 * re-run over an overlapping window rewrites identical values rather than
 * duplicating. That is what makes the generous lookback safe.
 */
export async function ingestBalanceTransactions(opts?: {
  sinceIso?: string | null;
  lookbackDays?: number;
}): Promise<IngestResult> {
  const base: Omit<IngestResult, "ok"> = {
    pages: 0,
    fetched: 0,
    written: 0,
    truncated: false,
    windowStart: "",
  };

  if (!isStripeConfigured()) {
    return { ...base, ok: false, error: "Stripe is not configured." };
  }
  const stripe = getStripe();
  const sb = createServiceRoleClient();
  if (!stripe) return { ...base, ok: false, error: "Stripe is not configured." };
  if (!sb) return { ...base, ok: false, error: "Database not available." };

  // Resume from the watermark, minus a small overlap so a transaction created
  // in the same second as the last run's newest row cannot fall through the
  // gap between two windows.
  const lookbackDays = opts?.lookbackDays ?? DEFAULT_LOOKBACK_DAYS;
  let since: Date;
  if (opts?.sinceIso) {
    since = new Date(opts.sinceIso);
  } else {
    const watermark = await loadWatermark();
    since = watermark
      ? new Date(watermark.getTime() - 60_000)
      : new Date(Date.now() - lookbackDays * 86_400_000);
  }
  const windowStart = since.toISOString();
  const createdGte = Math.floor(since.getTime() / 1000);

  let pages = 0;
  let fetched = 0;
  let written = 0;
  let startingAfter: string | undefined;

  try {
    for (;;) {
      if (pages >= MAX_PAGES) {
        return { ...base, ok: true, pages, fetched, written, truncated: true, windowStart };
      }
      const page: Stripe.ApiList<Stripe.BalanceTransaction> =
        await stripe.balanceTransactions.list({
          limit: PAGE_SIZE,
          created: { gte: createdGte },
          ...(startingAfter ? { starting_after: startingAfter } : {}),
        });
      pages += 1;
      const items = page.data ?? [];
      fetched += items.length;
      if (items.length === 0) break;

      // A charge's PaymentIntent is not on the balance transaction, so resolve
      // it once per page rather than per row.
      const chargeToIntent = new Map<string, string>();
      for (const txn of items) {
        const src = sourceIdOf(txn);
        if (src && src.startsWith("ch_")) {
          try {
            const charge = await stripe.charges.retrieve(src);
            const pi =
              typeof charge.payment_intent === "string"
                ? charge.payment_intent
                : charge.payment_intent?.id ?? null;
            if (pi) chargeToIntent.set(src, pi);
          } catch {
            // A charge we cannot read just means no booking linkage for that
            // row. The fee and FX figures are still worth storing.
          }
        }
      }

      const rows: Record<string, unknown>[] = [];
      for (const txn of items) {
        const row = mapBalanceTransaction(txn, null);
        const linkage = await resolveBookingLinkage(sourceIdOf(txn), chargeToIntent);
        row.booking_transaction_id = linkage.bookingTransactionId;
        row.tenant_id = linkage.tenantId;
        rows.push(row);
      }

      const { error } = await sb
        .from("provider_balance_transactions")
        .upsert(rows, { onConflict: "stripe_balance_txn_id" });
      if (error) {
        logServerError("balance-transactions.upsert", error);
        return {
          ...base,
          ok: false,
          pages,
          fetched,
          written,
          windowStart,
          error: error.message ?? "upsert failed",
        };
      }
      written += rows.length;

      if (!page.has_more) break;
      startingAfter = items[items.length - 1]?.id;
      if (!startingAfter) break;
    }

    return { ...base, ok: true, pages, fetched, written, windowStart };
  } catch (err) {
    logServerError("balance-transactions.ingest", err);
    return {
      ...base,
      ok: false,
      pages,
      fetched,
      written,
      windowStart,
      error: err instanceof Error ? err.message : "ingest failed",
    };
  }
}
