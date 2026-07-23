/**
 * Stripe Connect — talent-keyed helpers.
 *
 * Messages Consolidation Plan v2 — Slice K.
 *
 * Mirrors the agency-keyed flow in `stripe-connect.ts` but binds the
 * Connect Express account to a talent profile instead of an agency.
 * Used when:
 *
 *   - A talent (or talent-coord) needs to receive payouts on bookings
 *     they're contracted for. Per plan §11 stage 7, talent payouts
 *     flow via Stripe Connect transfers from the platform account
 *     after a successful charge.
 *
 *   - The Offer tab on a talent's view of an accepted booking shows
 *     an inline "Connect your bank to receive your payout" prompt
 *     when the talent's Connect account is not yet KYC-enabled.
 *
 * Schema: a `stripe_account_id` column on `talent_profiles` (added by
 * the migration shipped alongside this module). Mirror of the agencies
 * schema added in 20260907150100. RLS allows the talent to read +
 * trigger their own onboarding; service-role for engine writes.
 */

import type Stripe from "stripe";
import { getStripe, isStripeConfigured } from "@/lib/stripe/client";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import {
  normalizePayoutCountry,
  payoutCountryLabel,
  isStablecoinPayoutCountry,
} from "@/lib/payments/payout-countries";
import { loadActivePayoutSystem } from "@/lib/payments/active-payout-system";

export type TalentConnectStatus =
  | "none"
  | "pending"
  | "enabled"
  | "restricted"
  | "disabled";

export type TalentConnectedAccountSnapshot = {
  stripeAccountId: string | null;
  status: TalentConnectStatus;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  syncedAt: string | null;
};

export type TalentConnectResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/** Derive the bucketed status from a Stripe.Account response.
 *
 *  A brand-new Express account reports `disabled_reason: "requirements.past_due"`
 *  (or `requirements.pending_verification`) simply because onboarding isn't
 *  finished — that is NOT a real disablement and must never surface the scary
 *  "Disabled by Stripe" copy. Only genuine rejections / reviews count as
 *  "disabled"; everything else is "pending" (in progress) or "restricted"
 *  (submitted, action needed). */
function deriveStatus(account: Stripe.Account): TalentConnectStatus {
  if (account.charges_enabled && account.payouts_enabled) return "enabled";
  const r = account.requirements?.disabled_reason ?? "";
  if (r.startsWith("rejected") || r === "listed" || r === "under_review" || r === "platform_paused") {
    return "disabled";
  }
  if (account.details_submitted) return "restricted";
  return "pending";
}

type AdminClient = NonNullable<ReturnType<typeof createServiceRoleClient>>;

/** Look up a country's ISO-2 code from its `countries.id`. */
async function iso2FromCountryId(
  admin: AdminClient,
  countryId: string | null,
): Promise<string | null> {
  if (!countryId) return null;
  const { data } = await admin
    .from("countries")
    .select("iso2")
    .eq("id", countryId)
    .maybeSingle();
  return (data?.iso2 as string | null) ?? null;
}

/**
 * Resolve a country's ISO-2 from a free-text country name (e.g. the profile's
 * `home_country_text` = "Mexico"), or pass through a value that's already an
 * ISO-2. Lets the payout flow honour a country the talent set on their profile
 * even when the structured `residence_country_id` FK was never populated.
 */
async function iso2FromCountryText(
  admin: AdminClient,
  text: string | null,
): Promise<string | null> {
  const t = (text ?? "").trim();
  if (!t) return null;
  if (/^[A-Za-z]{2}$/.test(t)) return t.toUpperCase();
  const { data } = await admin
    .from("countries")
    .select("iso2")
    .ilike("name_en", t)
    .limit(1)
    .maybeSingle();
  return (data?.iso2 as string | null) ?? null;
}

/**
 * Create-or-get the talent's Stripe Connect Express account.
 *
 * On first call: creates a new Express account, persists its id to
 * `talent_profiles.stripe_account_id`. Subsequent calls return the
 * existing id.
 */
export async function createOrGetTalentConnectedAccount(
  talentProfileId: string,
  opts: { country?: string | null; businessUrl?: string | null } = {},
): Promise<TalentConnectResult<{ stripeAccountId: string; existed: boolean }>> {
  if (!isStripeConfigured()) {
    return { ok: false, error: "Stripe not configured." };
  }
  const stripe = getStripe();
  if (!stripe) return { ok: false, error: "Stripe client unavailable." };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Database unavailable." };

  // 1. Fetch the talent_profiles row + the talent's RESIDENCE country (where
  //    they bank / get paid). The account's country is immutable, so it must
  //    match the payee — never the platform's default.
  const { data: tp, error: readErr } = await admin
    .from("talent_profiles")
    .select("id, display_name, stripe_account_id, profile_code, residence_country_id, home_country_text")
    .eq("id", talentProfileId)
    .maybeSingle();
  if (readErr || !tp) {
    logServerError("stripe-connect-talent.readProfile", readErr ?? "missing");
    return { ok: false, error: "Talent profile not found." };
  }

  if (tp.stripe_account_id) {
    return { ok: true, data: { stripeAccountId: tp.stripe_account_id as string, existed: true } };
  }

  // 2. Resolve the payout country: an explicit override (the talent picked it
  //    on the payouts page) wins, else their residence country. If neither is
  //    known we can't create the account yet — the UI shows a country picker.
  // Structured residence FK first; if unset, fall back to the profile's
  // free-text country ("home_country_text") so a country the talent already
  // set on their profile is honoured instead of falsely asking again.
  const residenceIso2 =
    (await iso2FromCountryId(admin, tp.residence_country_id as string | null)) ??
    (await iso2FromCountryText(admin, tp.home_country_text as string | null));
  const country = normalizePayoutCountry(opts.country) ?? normalizePayoutCountry(residenceIso2);
  if (!country) {
    return { ok: false, error: "country_required" };
  }

  // If the talent had no country on file and just picked one for payouts, sync
  // it back to their profile so it shows up there too (single source of truth).
  if (!residenceIso2 && opts.country) {
    const { data: matchedCountry } = await admin
      .from("countries")
      .select("id")
      .eq("iso2", country)
      .maybeSingle();
    if (matchedCountry?.id) {
      await admin
        .from("talent_profiles")
        .update({
          residence_country_id: matchedCountry.id as string,
          home_country_text: payoutCountryLabel(country),
        })
        .eq("id", talentProfileId);
    }
  }

  // 3. Prefill the connected account's business website with the talent's
  //    public Tulala page so they don't have to type/hunt for a URL.
  const businessUrl =
    opts.businessUrl ??
    (tp.profile_code ? `https://tulala.digital/t/${tp.profile_code}` : undefined);

  // 4. Create the Express account in the payee's country.
  let account: Stripe.Account;
  try {
    account = await stripe.accounts.create({
      type: "express",
      country,
      // Talent recipients are individuals / sole-props only — pin business_type so
      // a talent can't self-select "Company" in Express onboarding (a USDC payout
      // requirement: stablecoin recipients must be individuals, confirmed by Stripe).
      // This is the platform-set default; Express still collects the person's KYC.
      business_type: "individual",
      capabilities: {
        transfers: { requested: true },
        card_payments: { requested: false },
      },
      business_profile: businessUrl ? { url: businessUrl } : undefined,
      metadata: {
        account_type: "talent",
        talent_profile_id: talentProfileId,
      },
    });
  } catch (err) {
    logServerError("stripe-connect-talent.createAccount", err);
    // Most commonly: Stripe Connect (a US-based platform) can't open a connected
    // account in `country` (e.g. Mexico, Argentina). In Global Payouts mode the
    // "local bank" rail below covers it, so point the talent there. But when the
    // platform master switch is on Connect, that GP card is hidden — so a pointer
    // to it would be a dead end. Word the error for the active rail.
    const activePayoutSystem = await loadActivePayoutSystem();
    return {
      ok: false,
      error:
        activePayoutSystem === "connect"
          ? `Payouts aren't available in ${payoutCountryLabel(country)} yet. Please reach out to support so we can set you up.`
          : `${payoutCountryLabel(country)} isn't supported for direct Stripe payouts. Use "Get paid to your local bank" below, it covers ${payoutCountryLabel(country)}.`,
    };
  }

  // 5. Persist the id.
  const { error: writeErr } = await admin
    .from("talent_profiles")
    .update({ stripe_account_id: account.id })
    .eq("id", talentProfileId);
  if (writeErr) {
    logServerError("stripe-connect-talent.writeId", writeErr);
    return { ok: false, error: "Could not save Stripe account id." };
  }

  return { ok: true, data: { stripeAccountId: account.id, existed: false } };
}

/** Resolve the talent's preferred payout country (ISO-2), or null if unknown
 *  and the UI must ask. Cheap read — used by the payouts page to decide
 *  whether to show a country picker before "Connect". */
export async function resolveTalentPayoutCountry(
  talentProfileId: string,
): Promise<string | null> {
  const admin = createServiceRoleClient();
  if (!admin) return null;
  const { data } = await admin
    .from("talent_profiles")
    .select("residence_country_id, home_country_text")
    .eq("id", talentProfileId)
    .maybeSingle();
  const iso2 =
    (await iso2FromCountryId(admin, (data?.residence_country_id as string | null) ?? null)) ??
    (await iso2FromCountryText(admin, (data?.home_country_text as string | null) ?? null));
  return normalizePayoutCountry(iso2);
}

/**
 * Mint an onboarding link for the talent's Express account. The
 * resulting URL is hosted by Stripe; on completion Stripe redirects
 * back to `returnUrl`.
 */
export async function createTalentOnboardingLink(
  talentProfileId: string,
  returnUrl: string,
  refreshUrl: string,
): Promise<TalentConnectResult<{ url: string }>> {
  const ensure = await createOrGetTalentConnectedAccount(talentProfileId);
  if (!ensure.ok) return { ok: false, error: ensure.error };

  const stripe = getStripe();
  if (!stripe) return { ok: false, error: "Stripe client unavailable." };

  const link = await stripe.accountLinks.create({
    account: ensure.data.stripeAccountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: "account_onboarding",
  });

  return { ok: true, data: { url: link.url } };
}

/**
 * Persist a snapshot of the talent's Connect account state. Called
 * by both the pull-side (manual refresh) + push-side (account.updated
 * webhook for talent-bound accounts).
 */
export async function persistTalentAccountSnapshot(
  talentProfileId: string,
  account: Stripe.Account,
): Promise<TalentConnectResult<TalentConnectedAccountSnapshot>> {
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Database unavailable." };

  const status = deriveStatus(account);
  const chargesEnabled = !!account.charges_enabled;
  const payoutsEnabled = !!account.payouts_enabled;
  const detailsSubmitted = !!account.details_submitted;
  const syncedAt = new Date().toISOString();

  const { error } = await admin
    .from("talent_profiles")
    .update({
      stripe_account_status: status,
      stripe_charges_enabled: chargesEnabled,
      stripe_payouts_enabled: payoutsEnabled,
      stripe_details_submitted: detailsSubmitted,
      stripe_account_synced_at: syncedAt,
    })
    .eq("id", talentProfileId);

  if (error) {
    logServerError("stripe-connect-talent.persist", error);
    return { ok: false, error: "Could not save talent Stripe status." };
  }

  return {
    ok: true,
    data: {
      stripeAccountId: account.id,
      status,
      chargesEnabled,
      payoutsEnabled,
      detailsSubmitted,
      syncedAt,
    },
  };
}

/**
 * Read the current persisted snapshot. Cheap; no Stripe API hit.
 * Used by Offer tab inline prompt to decide whether to show the
 * "Connect bank" CTA.
 */
export async function getTalentConnectedAccountSnapshot(
  talentProfileId: string,
): Promise<TalentConnectResult<TalentConnectedAccountSnapshot>> {
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Database unavailable." };

  const { data, error } = await admin
    .from("talent_profiles")
    .select("stripe_account_id, stripe_account_status, stripe_charges_enabled, stripe_payouts_enabled, stripe_details_submitted, stripe_account_synced_at")
    .eq("id", talentProfileId)
    .maybeSingle();

  if (error || !data) {
    return { ok: false, error: "Talent profile not found." };
  }

  return {
    ok: true,
    data: {
      stripeAccountId: (data.stripe_account_id as string | null) ?? null,
      status: ((data.stripe_account_status as TalentConnectStatus | null) ?? "none"),
      chargesEnabled: !!data.stripe_charges_enabled,
      payoutsEnabled: !!data.stripe_payouts_enabled,
      detailsSubmitted: !!data.stripe_details_submitted,
      syncedAt: (data.stripe_account_synced_at as string | null) ?? null,
    },
  };
}

/** Pull the latest account state from Stripe and persist it. Used by the
 *  post-onboarding return route so the talent sees fresh status immediately
 *  rather than waiting on the async account.updated webhook. */
export async function refreshTalentAccountStatus(
  talentProfileId: string,
): Promise<TalentConnectResult<TalentConnectedAccountSnapshot>> {
  const stripe = getStripe();
  if (!stripe) return { ok: false, error: "Stripe is not configured." };

  const snap = await getTalentConnectedAccountSnapshot(talentProfileId);
  if (!snap.ok) return snap;
  if (!snap.data.stripeAccountId) return snap; // nothing to refresh yet

  try {
    const account = await stripe.accounts.retrieve(snap.data.stripeAccountId);
    return persistTalentAccountSnapshot(talentProfileId, account);
  } catch (err) {
    logServerError("payments.stripe-connect-talent.refresh", err);
    return { ok: false, error: "Could not refresh status from Stripe." };
  }
}

/** Resolve a Stripe Connect account id back to a talent profile —
 *  used by the webhook handler when a talent-bound account.updated
 *  event arrives. Returns null when no talent owns the account. */
export async function findTalentByStripeAccountId(
  stripeAccountId: string,
): Promise<{ talentProfileId: string } | null> {
  const admin = createServiceRoleClient();
  if (!admin) return null;
  const { data } = await admin
    .from("talent_profiles")
    .select("id")
    .eq("stripe_account_id", stripeAccountId)
    .maybeSingle();
  if (!data) return null;
  return { talentProfileId: data.id as string };
}

/** Is this talent's account in a state that can RECEIVE transfers?
 *  Per Stripe: needs both transfers capability enabled + payouts
 *  enabled. Used by Offer-tab inline-prompt logic + by the booking-
 *  payout pipeline to gate transfer attempts. */
export function canRouteTransfersToTalent(snap: TalentConnectedAccountSnapshot): boolean {
  return snap.status === "enabled" && snap.payoutsEnabled && !!snap.stripeAccountId;
}

/**
 * Mint an Express Dashboard LOGIN link for the talent's connected account.
 *
 * Unlike the account-onboarding link (KYC), this drops an already-onboarded
 * talent straight into their Stripe Express Dashboard — where, for stablecoin
 * (Global Payouts) markets, they link a crypto wallet and set USDC as their
 * default currency to receive payouts as USDC instead of to a local bank.
 *
 * Login links require the account to exist; Stripe errors for not-yet-onboarded
 * accounts, which we surface as a clean "finish onboarding first" message.
 */
export async function createTalentDashboardLink(
  talentProfileId: string,
): Promise<TalentConnectResult<{ url: string }>> {
  const stripe = getStripe();
  if (!stripe) return { ok: false, error: "Stripe client unavailable." };

  const snap = await getTalentConnectedAccountSnapshot(talentProfileId);
  if (!snap.ok) return { ok: false, error: snap.error };
  if (!snap.data.stripeAccountId) {
    return { ok: false, error: "Connect your Stripe account first." };
  }

  try {
    const link = await stripe.accounts.createLoginLink(snap.data.stripeAccountId);
    return { ok: true, data: { url: link.url } };
  } catch (err) {
    logServerError("stripe-connect-talent.dashboardLink", err);
    return {
      ok: false,
      error: "Your Stripe dashboard isn't available for this account type.",
    };
  }
}

/**
 * Is the talent in a country where we can pay them via stablecoin (USDC)
 * Global Payouts? Cheap residence/override-based read for the payouts UI to
 * decide whether to surface the "link a crypto wallet" path. Falls back to the
 * talent's residence country (the same source the Connect account is created
 * with), so for an existing account this matches its immutable country.
 */
export async function getTalentStablecoinEligibility(
  talentProfileId: string,
): Promise<{ eligible: boolean; country: string | null }> {
  const country = await resolveTalentPayoutCountry(talentProfileId);
  return { eligible: isStablecoinPayoutCountry(country), country };
}
