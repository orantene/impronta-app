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

/** Active talent participants of the inquiry with their currency and lane. */
export async function loadInquirySellers(
  supabase: SupabaseClient,
  inquiryId: string,
): Promise<InquirySeller[]> {
  const { data: parts, error } = await supabase
    .from("inquiry_participants")
    .select("talent_profile_id")
    .eq("inquiry_id", inquiryId)
    .eq("role", "talent")
    .eq("status", "active");
  if (error) {
    logServerError("offer-currency-seller.participants", error);
    return [];
  }
  const ids = [
    ...new Set(
      (parts ?? [])
        .map((p) => (p as { talent_profile_id: string | null }).talent_profile_id)
        .filter((v): v is string => typeof v === "string" && v.length > 0),
    ),
  ];
  if (!ids.length) return [];
  const { data: tps, error: tpErr } = await supabase
    .from("talent_profiles")
    .select("id, default_currency, stripe_account_platform")
    .in("id", ids);
  if (tpErr) {
    logServerError("offer-currency-seller.talent_profiles", tpErr);
    return [];
  }
  return (tps ?? []).map((r) => {
    const row = r as { id: string; default_currency?: string | null; stripe_account_platform?: string | null };
    return {
      talentProfileId: row.id,
      defaultCurrency: normalizeCurrencyCode(row.default_currency),
      platform: row.stripe_account_platform ?? null,
    };
  });
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

/**
 * Hard guard used at send and at charge creation: the currency being offered
 * or charged must equal the single seller's default_currency. Mixed or unknown
 * sellers pass (platform currency, as before). The seller read FAILS OPEN to
 * "no sellers known" on a DB error (logged), matching the prior behaviour, so
 * a transient read failure cannot block every payment; a known mismatch never
 * passes.
 */
export async function checkInquiryCurrencyMatchesSeller(
  supabase: SupabaseClient,
  input: { inquiryId: string; currency: string | null | undefined },
): Promise<OfferSellerCurrencyCheck> {
  const sellers = await loadInquirySellers(supabase, input.inquiryId);
  const check = checkOfferMatchesSeller({
    offerCurrency: input.currency,
    sellerCurrencies: sellers.map((s) => s.defaultCurrency),
  });
  if (!check.ok) {
    logServerError(
      "offer.currency_seller_mismatch",
      new Error(
        `inquiry=${input.inquiryId} currency=${check.offerCurrency} sellerCurrency=${check.sellerCurrency} platform=${sellers[0]?.platform ?? "unknown"}`,
      ),
    );
  }
  return check;
}
