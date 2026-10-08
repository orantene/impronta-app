/**
 * seller-currency-guard.ts - TUL-284. The charge creators with no inquiry
 * (instant-book, ticket picker, storefront carts, appointment/class/package
 * pickers, pay links, POS terminal) all reach Stripe through two choke points:
 * `createCheckoutSessionForTransaction` and `createPaymentIntentForTransaction`.
 * Both call this guard in CHARGE mode before any Stripe call.
 *
 * The seller of record is resolved from the transaction the same way the
 * Stripe platform is (payout receiver -> talent / workspace, else the source
 * workspace). Rules, matching `checkInquiryCurrencyMatchesSeller`:
 *  - a read ERROR, a thrown read or a missing client is REFUSED (retryable);
 *  - a read that succeeds but finds no seller, or an unknown seller currency,
 *    is NOT refused;
 *  - a charge currency different from the seller's default_currency is refused.
 * The supabase client is injected, so the tests run on fakes.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkOfferMatchesSeller, normalizeCurrencyCode } from "@/lib/inquiry/offer-currency";
import { SELLER_CURRENCY_UNREADABLE } from "@/lib/inquiry/offer-currency-seller";
import { logServerError } from "@/lib/server/safe-error";

export type ChargeCurrencyCheck =
  | { ok: true }
  | {
      ok: false;
      code: typeof SELLER_CURRENCY_UNREADABLE | "offer_currency_seller_mismatch";
      message: string;
    };

export type ChargeCurrencyGuard = typeof checkTransactionChargeCurrency;

const UNREADABLE: ChargeCurrencyCheck = {
  ok: false,
  code: SELLER_CURRENCY_UNREADABLE,
  message: "We could not confirm the seller's payment currency. Please try again in a moment.",
};

type SellerRead = { ok: true; currency: string | null } | { ok: false };

async function readCurrency(
  sb: SupabaseClient,
  table: "talent_profiles" | "agencies",
  id: string,
): Promise<SellerRead> {
  const { data, error } = await sb.from(table).select("default_currency").eq("id", id).maybeSingle();
  if (error) {
    logServerError(`seller-currency-guard.${table}`, error);
    return { ok: false };
  }
  return { ok: true, currency: normalizeCurrencyCode((data as { default_currency?: unknown } | null)?.default_currency) };
}

async function readTransactionSellerCurrency(sb: SupabaseClient, transactionId: string): Promise<SellerRead> {
  const { data: txn, error } = await sb
    .from("booking_transactions")
    .select("source_tenant_id, payout_receiver_id")
    .eq("id", transactionId)
    .maybeSingle();
  if (error) {
    logServerError("seller-currency-guard.transaction", error);
    return { ok: false };
  }
  if (!txn) return { ok: true, currency: null };
  const t = txn as { source_tenant_id?: string | null; payout_receiver_id?: string | null };
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
    if (p.owner_id && p.owner_type === "talent") return readCurrency(sb, "talent_profiles", p.owner_id);
    if (p.owner_id && p.owner_type === "agency") return readCurrency(sb, "agencies", p.owner_id);
  }
  if (t.source_tenant_id) return readCurrency(sb, "agencies", t.source_tenant_id);
  return { ok: true, currency: null };
}

/** Charge-mode guard for a booking transaction. Fails closed on any seller-read failure. */
export async function checkTransactionChargeCurrency(
  sb: SupabaseClient | null,
  input: { transactionId: string; currency: string | null | undefined },
): Promise<ChargeCurrencyCheck> {
  if (!sb) return UNREADABLE;
  let read: SellerRead;
  try {
    read = await readTransactionSellerCurrency(sb, input.transactionId);
  } catch (err) {
    logServerError("seller-currency-guard.read_threw", err);
    return UNREADABLE;
  }
  if (!read.ok) return UNREADABLE;
  if (read.currency === null) return { ok: true };
  const check = checkOfferMatchesSeller({ offerCurrency: input.currency, sellerCurrencies: [read.currency] });
  if (check.ok) return { ok: true };
  logServerError(
    "charge.currency_seller_mismatch",
    new Error(`transaction=${input.transactionId} currency=${check.offerCurrency} sellerCurrency=${check.sellerCurrency}`),
  );
  return {
    ok: false,
    code: check.code,
    message: `This payment is in ${check.offerCurrency} but the seller charges in ${check.sellerCurrency}. It cannot be taken until the currency matches.`,
  };
}
