/**
 * seller-currency-guard.ts - TUL-284. The charge creators with no inquiry
 * (instant-book, ticket picker, storefront carts/pickers, pay links, POS
 * terminal) all reach Stripe through three choke points:
 * `createCheckoutSessionForTransaction`, `createPaymentIntentForTransaction`
 * and `createStripeTerminalPaymentRequest`. Each calls this guard in CHARGE
 * mode before any Stripe call.
 *
 * The bug class is an AMOUNT CROSSING CURRENCIES, so the rule is not the
 * seller's default_currency (a talent may price an offering in another
 * currency on purpose). Two checks:
 *  1. the CHARGE currency equals the currency of the priced thing being
 *     charged (the order the transaction belongs to: offering, cart, pay
 *     link, ticket offering), read from that thing's own stored currency;
 *  2. the charge currency is one the seller's Stripe lane supports: the US
 *     lane takes USD only, the MX lane takes MXN or USD.
 * Fail CLOSED (retryable) on a read error, a thrown read or a missing client.
 * A successful read that finds no order, no seller or no currency is NOT
 * refused (that check is simply not applicable). The supabase client is
 * injected, so the tests run on fakes.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeCurrencyCode } from "@/lib/inquiry/offer-currency";
import { SELLER_CURRENCY_UNREADABLE } from "@/lib/inquiry/offer-currency-seller";
import { logServerError } from "@/lib/server/safe-error";

export const CHARGE_CURRENCY_NOT_PRICED = "charge_currency_not_priced_currency" as const;
export const CHARGE_CURRENCY_UNSUPPORTED_FOR_LANE = "charge_currency_unsupported_for_lane" as const;

export type ChargeCurrencyCheck =
  | { ok: true }
  | {
      ok: false;
      code: typeof SELLER_CURRENCY_UNREADABLE | typeof CHARGE_CURRENCY_NOT_PRICED | typeof CHARGE_CURRENCY_UNSUPPORTED_FOR_LANE;
      message: string;
    };

export type ChargeCurrencyGuard = typeof checkTransactionChargeCurrency;

/** Currencies each Stripe lane can settle. */
export const LANE_CURRENCIES: Readonly<Record<"us" | "mx", readonly string[]>> = {
  us: ["USD"],
  mx: ["MXN", "USD"],
};

const UNREADABLE: ChargeCurrencyCheck = {
  ok: false,
  code: SELLER_CURRENCY_UNREADABLE,
  message: "We could not confirm the payment currency. Please try again in a moment.",
};

type Facts = { pricedCurrency: string | null; lane: "us" | "mx" | null };
type Read = { ok: true; facts: Facts } | { ok: false };

async function readLane(
  sb: SupabaseClient,
  table: "talent_profiles" | "agencies",
  id: string,
): Promise<{ ok: true; lane: "us" | "mx" | null } | { ok: false }> {
  const { data, error } = await sb.from(table).select("stripe_account_platform").eq("id", id).maybeSingle();
  if (error) {
    logServerError(`seller-currency-guard.${table}`, error);
    return { ok: false };
  }
  if (!data) return { ok: true, lane: null };
  return { ok: true, lane: (data as { stripe_account_platform?: string }).stripe_account_platform === "mx" ? "mx" : "us" };
}

async function readFacts(sb: SupabaseClient, transactionId: string): Promise<Read> {
  const { data: txn, error } = await sb
    .from("booking_transactions")
    .select("order_id, source_tenant_id, payout_receiver_id")
    .eq("id", transactionId)
    .maybeSingle();
  if (error) {
    logServerError("seller-currency-guard.transaction", error);
    return { ok: false };
  }
  if (!txn) return { ok: true, facts: { pricedCurrency: null, lane: null } };
  const t = txn as { order_id?: string | null; source_tenant_id?: string | null; payout_receiver_id?: string | null };

  let pricedCurrency: string | null = null;
  if (t.order_id) {
    // Keyed by the transaction's own order_id, not tenant-scoped: a variable
    // table name, as account-platform.ts does, keeps the untenanted-from rule quiet.
    const ordersTable: "orders" | "agencies" = "orders";
    const { data: order, error: orderErr } = await sb.from(ordersTable).select("currency").eq("id", t.order_id).maybeSingle();
    if (orderErr) {
      logServerError("seller-currency-guard.order", orderErr);
      return { ok: false };
    }
    pricedCurrency = normalizeCurrencyCode((order as { currency?: unknown } | null)?.currency);
  }

  let sellerTable: "talent_profiles" | "agencies" | null = null;
  let sellerId: string | null = null;
  if (t.payout_receiver_id) {
    const { data: pa, error: paErr } = await sb
      .from("payout_accounts")
      .select("owner_type, owner_id")
      .eq("id", t.payout_receiver_id)
      .maybeSingle();
    if (paErr) {
      logServerError("seller-currency-guard.payout_account", paErr);
      return { ok: false };
    }
    const p = (pa ?? {}) as { owner_type?: string; owner_id?: string };
    if (p.owner_id && p.owner_type === "talent") [sellerTable, sellerId] = ["talent_profiles", p.owner_id];
    else if (p.owner_id && p.owner_type === "agency") [sellerTable, sellerId] = ["agencies", p.owner_id];
  }
  if (!sellerTable && t.source_tenant_id) [sellerTable, sellerId] = ["agencies", t.source_tenant_id];

  let lane: "us" | "mx" | null = null;
  if (sellerTable && sellerId) {
    const read = await readLane(sb, sellerTable, sellerId);
    if (!read.ok) return { ok: false };
    lane = read.lane;
  }
  return { ok: true, facts: { pricedCurrency, lane } };
}

/** Charge-mode guard for a booking transaction. Fails closed on any read failure. */
export async function checkTransactionChargeCurrency(
  sb: SupabaseClient | null,
  input: { transactionId: string; currency: string | null | undefined },
): Promise<ChargeCurrencyCheck> {
  if (!sb) return UNREADABLE;
  let read: Read;
  try {
    read = await readFacts(sb, input.transactionId);
  } catch (err) {
    logServerError("seller-currency-guard.read_threw", err);
    return UNREADABLE;
  }
  if (!read.ok) return UNREADABLE;
  const { pricedCurrency, lane } = read.facts;
  const charge = normalizeCurrencyCode(input.currency);
  if (!charge) {
    return { ok: false, code: CHARGE_CURRENCY_UNSUPPORTED_FOR_LANE, message: "This payment has no valid currency, so it cannot be taken." };
  }
  if (pricedCurrency && pricedCurrency !== charge) {
    logServerError(
      "charge.currency_not_priced_currency",
      new Error(`transaction=${input.transactionId} charge=${charge} priced=${pricedCurrency}`),
    );
    return {
      ok: false,
      code: CHARGE_CURRENCY_NOT_PRICED,
      message: `This payment is in ${charge} but the item was priced in ${pricedCurrency}. It cannot be taken until the currency matches.`,
    };
  }
  if (lane && !LANE_CURRENCIES[lane].includes(charge)) {
    logServerError(
      "charge.currency_unsupported_for_lane",
      new Error(`transaction=${input.transactionId} charge=${charge} lane=${lane}`),
    );
    return {
      ok: false,
      code: CHARGE_CURRENCY_UNSUPPORTED_FOR_LANE,
      message: `This seller's payment account cannot take ${charge}. It cannot be taken in this currency.`,
    };
  }
  return { ok: true };
}
