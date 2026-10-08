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
 * Solo workspace: a `workspace_type='talent'` tenant with exactly one active
 * owner whose person talent profile is the seller (TUL-313). Returns that
 * owner-talent's default_currency, or null when the tenant is not solo or the
 * currency is unknown. A read error also yields null (the caller then falls to
 * the workspace default, and finally refuses).
 */
export async function loadSoloOwnerTalentCurrency(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<string | null> {
  try {
    const { data: ag, error: agErr } = await supabase
      .from("agencies")
      .select("workspace_type")
      .eq("id", tenantId)
      .maybeSingle();
    if (agErr) {
      logServerError("offer-currency-seller.solo_owner.agency", agErr);
      return null;
    }
    if ((ag as { workspace_type?: string } | null)?.workspace_type !== "talent") return null;
    const { data: owners, error: ownersErr } = await supabase
      .from("agency_memberships")
      .select("profile_id")
      .eq("tenant_id", tenantId)
      .eq("role", "owner")
      .eq("status", "active");
    if (ownersErr) {
      logServerError("offer-currency-seller.solo_owner.owners", ownersErr);
      return null;
    }
    const ownerIds = (owners ?? []).map((o) => (o as { profile_id: string }).profile_id);
    if (ownerIds.length !== 1) return null;
    const { data: tp, error: tpErr } = await supabase
      .from("talent_profiles")
      .select("default_currency")
      .eq("user_id", ownerIds[0])
      .eq("profile_kind", "person")
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();
    if (tpErr) {
      logServerError("offer-currency-seller.solo_owner.talent", tpErr);
      return null;
    }
    return normalizeCurrencyCode((tp as { default_currency?: string | null } | null)?.default_currency);
  } catch (err) {
    logServerError("offer-currency-seller.solo_owner", err);
    return null;
  }
}

/** The seller workspace's own default_currency (agencies.default_currency), or null. */
export async function loadWorkspaceDefaultCurrency(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<string | null> {
  try {
    const { data, error } = await supabase.from("agencies").select("default_currency").eq("id", tenantId).maybeSingle();
    if (error) {
      logServerError("offer-currency-seller.workspace_default", error);
      return null;
    }
    return normalizeCurrencyCode((data as { default_currency?: string | null } | null)?.default_currency);
  } catch (err) {
    logServerError("offer-currency-seller.workspace_default", err);
    return null;
  }
}

/**
 * Currency for a NEW offer (TUL-313). Order:
 *  1. active talent participants, when they all share one currency;
 *  2. the solo workspace's owner-talent;
 *  3. the seller workspace's agencies.default_currency;
 *  4. null: the caller REFUSES. The platform currency is never a silent default.
 * `followSeller=false` keeps the caller's explicit currency (counter offers
 * inherit the prior offer's currency).
 */
export async function resolveNewOfferCurrency(
  supabase: SupabaseClient,
  input: { inquiryId: string; tenantId: string; explicitCurrency?: string | null; followSeller: boolean },
): Promise<string | null> {
  if (!input.followSeller) return normalizeCurrencyCode(input.explicitCurrency);
  const read = await loadInquirySellersChecked(supabase, input.inquiryId);
  if (!read.ok) return null;
  const known = read.sellers.map((s) => s.defaultCurrency).filter((c): c is string => c !== null);
  if (known.length > 0 && known.every((c) => c === known[0])) return known[0];
  return (
    (await loadSoloOwnerTalentCurrency(supabase, input.tenantId)) ??
    (await loadWorkspaceDefaultCurrency(supabase, input.tenantId))
  );
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
