/**
 * offer-currency-seller.ts — reads the sellers on an inquiry and applies the
 * pure rules in `offer-currency.ts`. The supabase client is injected, so the
 * tests run on fakes.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import {
  checkOfferMatchesSeller,
  normalizeCurrencyCode,
  resolveOfferCurrency,
  type OfferSellerCurrencyCheck,
} from "./offer-currency";

export type InquirySeller = {
  talentProfileId: string;
  defaultCurrency: string | null;
  platform: string | null;
};

/** A seller read that distinguishes "read FAILED" from "no sellers / unknown currency". */
export type InquirySellersRead = { ok: true; sellers: InquirySeller[] } | { ok: false };

export async function loadInquirySellersChecked(
  supabase: SupabaseClient,
  inquiryId: string,
): Promise<InquirySellersRead> {
  try {
    const { data: parts, error } = await supabase
      .from("inquiry_participants")
      .select("talent_profile_id")
      .eq("inquiry_id", inquiryId)
      .eq("role", "talent")
      .eq("status", "active");
    if (error) {
      logServerError("offer-currency-seller.participants", error);
      return { ok: false };
    }
    const ids = [
      ...new Set(
        (parts ?? [])
          .map((p) => (p as { talent_profile_id: string | null }).talent_profile_id)
          .filter((v): v is string => typeof v === "string" && v.length > 0),
      ),
    ];
    if (!ids.length) return { ok: true, sellers: [] };
    const { data: tps, error: tpErr } = await supabase
      .from("talent_profiles")
      .select("id, default_currency, stripe_account_platform")
      .in("id", ids);
    if (tpErr) {
      logServerError("offer-currency-seller.talent_profiles", tpErr);
      return { ok: false };
    }
    return {
      ok: true,
      sellers: (tps ?? []).map((r) => {
        const row = r as { id: string; default_currency?: string | null; stripe_account_platform?: string | null };
        return {
          talentProfileId: row.id,
          defaultCurrency: normalizeCurrencyCode(row.default_currency),
          platform: row.stripe_account_platform ?? null,
        };
      }),
    };
  } catch (err) {
    logServerError("offer-currency-seller.read_threw", err);
    return { ok: false };
  }
}

/** Active talent participants of the inquiry; a failed read reads as no sellers. */
export async function loadInquirySellers(
  supabase: SupabaseClient,
  inquiryId: string,
): Promise<InquirySeller[]> {
  const read = await loadInquirySellersChecked(supabase, inquiryId);
  return read.ok ? read.sellers : [];
}

/**
 * Currency for a NEW offer. `followSeller=false` keeps the caller's explicit
 * currency untouched (counter offers inherit the prior offer's currency).
 */
export async function resolveNewOfferCurrency(
  supabase: SupabaseClient,
  input: { inquiryId: string; platformCurrency: string; followSeller: boolean },
): Promise<string> {
  if (!input.followSeller) return input.platformCurrency;
  const sellers = await loadInquirySellers(supabase, input.inquiryId);
  return resolveOfferCurrency({
    sellerCurrencies: sellers.map((s) => s.defaultCurrency),
    platformCurrency: input.platformCurrency,
  });
}

export const SELLER_CURRENCY_UNREADABLE = "seller_currency_unreadable" as const;

export type SellerCurrencyCheck =
  | OfferSellerCurrencyCheck
  | { ok: false; code: typeof SELLER_CURRENCY_UNREADABLE; message: string };

/**
 * Hard guard at send and at charge creation: the currency being offered or
 * charged must equal the single seller's default_currency. Mixed, none or
 * unknown sellers resolved WITHOUT error pass (platform currency, as before).
 *
 * `mode` decides what a seller-READ ERROR means:
 *  - "send":   fail OPEN (logged). A draft can be re-sent; the charge guard is
 *              the backstop.
 *  - "charge": fail CLOSED (retryable). Money must not move on a guess. A null
 *              client (service role missing) counts as a read error.
 */
export async function checkInquiryCurrencyMatchesSeller(
  supabase: SupabaseClient | null,
  input: { inquiryId: string; currency: string | null | undefined; mode: "send" | "charge" },
): Promise<SellerCurrencyCheck> {
  const read = supabase ? await loadInquirySellersChecked(supabase, input.inquiryId) : ({ ok: false } as const);
  if (!read.ok) {
    if (input.mode === "send") return { ok: true };
    return {
      ok: false,
      code: SELLER_CURRENCY_UNREADABLE,
      message: "We could not confirm the seller's payment currency. Please try again in a moment.",
    };
  }
  const { sellers } = read;
  const check = checkOfferMatchesSeller({
    offerCurrency: input.currency,
    sellerCurrencies: sellers.map((s) => s.defaultCurrency),
  });
  if (!check.ok) {
    logServerError(
      "offer.currency_seller_mismatch",
      new Error(
        `inquiry=${input.inquiryId} mode=${input.mode} currency=${check.offerCurrency} sellerCurrency=${check.sellerCurrency} platform=${sellers[0]?.platform ?? "unknown"}`,
      ),
    );
  }
  return check;
}
