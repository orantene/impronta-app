"use server";

/**
 * Talent payouts, server actions for Stripe Connect Express onboarding.
 *
 * Messages Consolidation Plan v2, Item #13.
 *
 * Wraps the engine helpers in lib/payments/stripe-connect-talent.ts
 * with auth + path-aware return URLs. The talent settings page calls
 * `startTalentOnboarding` → server creates/retrieves the Express
 * account + mints a Stripe-hosted onboarding link → returns the URL
 * for client redirect.
 */

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { logServerError } from "@/lib/server/safe-error";
import { headers } from "next/headers";
import { getStripe, isStripeConfigured } from "@/lib/stripe/client";
import {
  createOrGetTalentConnectedAccount,
  createTalentOnboardingLink,
  createTalentDashboardLink,
  getTalentConnectedAccountSnapshot,
  getTalentStablecoinEligibility,
  refreshTalentAccountStatus,
  type TalentConnectedAccountSnapshot,
} from "@/lib/payments/stripe-connect-talent";
import { payoutCountryLabel } from "@/lib/payments/payout-countries";
import {
  getTalentGpStatus,
  listTalentGpPayoutMethods,
  removeTalentGpPayoutMethod,
  setTalentGpDefault,
  setupTalentGpBank,
  syncTalentGpRecipient,
  type TalentGpMethod,
  type TalentGpStatus,
} from "@/lib/payments/talent-global-payouts";

export type StartOnboardingResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

export type AccountSessionResult =
  | { ok: true; clientSecret: string }
  | { ok: false; error: string };

export type EnsurePayoutAccountResult =
  | { ok: true }
  | { ok: false; code: "country_required" }
  | { ok: false; code: "error"; error: string };

/**
 * Ensure the talent's Connect account exists in the right country BEFORE we
 * mount the embedded onboarding. Returns `country_required` when we don't yet
 * know the talent's payout country (residence unset + no override), the
 * payouts page then shows a country picker. The account's country is
 * immutable, so this must be settled up front.
 */
export async function ensureTalentPayoutAccount(
  opts: { country?: string } = {},
): Promise<EnsurePayoutAccountResult> {
  try {
    const tp = await resolveOwnTalentProfileId();
    if (!tp.ok) return { ok: false, code: "error", error: tp.error };
    const ensure = await createOrGetTalentConnectedAccount(tp.id, { country: opts.country });
    if (ensure.ok) return { ok: true };
    if (ensure.error === "country_required") return { ok: false, code: "country_required" };
    return { ok: false, code: "error", error: ensure.error };
  } catch (err) {
    logServerError("talent-payouts.ensureAccount", err);
    return { ok: false, code: "error", error: "Could not start payout setup. Please try again." };
  }
}

/**
 * Resolve the talent_profiles.id owned by the signed-in user, or an
 * error message. Shared by the embedded-onboarding actions below.
 */
async function resolveOwnTalentProfileId(): Promise<
  { ok: true; id: string } | { ok: false; error: string }
> {
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false, error: "Sign in required." };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, error: "Database unavailable." };
  const { data: tp } = await supabase
    .from("talent_profiles")
    .select("id")
    .eq("user_id", session.user.id)
    .maybeSingle();
  if (!tp) return { ok: false, error: "No talent profile linked to this account." };
  return { ok: true, id: tp.id as string };
}

/**
 * Mint a Stripe **Account Session** client secret for the current
 * talent's Connect Express account, scoped to the embedded
 * `account_onboarding` component. Lazily creates the Express account on
 * first call (so no account exists until the talent actually starts
 * onboarding). Powers the in-app, Tulala-branded embedded onboarding -
 * the talent never leaves for stripe.com.
 *
 * `external_account_collection` is enabled so the talent can attach
 * their bank account inside the embedded flow.
 */
export async function createTalentAccountSession(
  opts: { country?: string } = {},
): Promise<AccountSessionResult> {
  try {
    if (!isStripeConfigured()) {
      return { ok: false, error: "Payouts are not available right now." };
    }
    const stripe = getStripe();
    if (!stripe) return { ok: false, error: "Payouts are not available right now." };

    const tp = await resolveOwnTalentProfileId();
    if (!tp.ok) return { ok: false, error: tp.error };

    const ensure = await createOrGetTalentConnectedAccount(tp.id, { country: opts.country });
    if (!ensure.ok) return { ok: false, error: ensure.error };

    const session = await stripe.accountSessions.create({
      account: ensure.data.stripeAccountId,
      components: {
        account_onboarding: {
          enabled: true,
          features: { external_account_collection: true },
        },
      },
    });

    return { ok: true, clientSecret: session.client_secret };
  } catch (err) {
    logServerError("talent-payouts.accountSession", err);
    return { ok: false, error: "Could not start payout setup. Please try again." };
  }
}

/**
 * Pull fresh Connect status from Stripe + persist it. Called when the
 * embedded onboarding component signals exit/completion so the status
 * card reflects reality without waiting on the async account.updated
 * webhook. Returns the refreshed snapshot for an optimistic UI update.
 */
export async function refreshTalentPayoutStatus(): Promise<
  { ok: true; snapshot: TalentConnectedAccountSnapshot } | { ok: false; error: string }
> {
  const tp = await resolveOwnTalentProfileId();
  if (!tp.ok) return { ok: false, error: tp.error };
  const r = await refreshTalentAccountStatus(tp.id);
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, snapshot: r.data };
}

/**
 * Kick off Stripe Connect Express onboarding for the current talent.
 * Lazy-creates the account on first call. Returns the hosted Stripe
 * URL, client redirects via window.location.href.
 */
export async function startTalentOnboarding(
  tenantSlug: string,
): Promise<StartOnboardingResult> {
  try {
    const session = await getCachedActorSession();
    if (!session.user) return { ok: false, error: "Sign in required." };
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "Database unavailable." };

    // Find the talent profile owned by this user.
    const { data: tp } = await supabase
      .from("talent_profiles")
      .select("id")
      .eq("user_id", session.user.id)
      .maybeSingle();
    if (!tp) {
      return { ok: false, error: "No talent profile linked to this account." };
    }

    const hdrs = await headers();
    const host = hdrs.get("host") ?? "localhost";
    const proto = hdrs.get("x-forwarded-proto") ?? "https";
    const origin = process.env.NEXT_PUBLIC_BASE_URL ?? `${proto}://${host}`;
    const returnUrl = `${origin}/${tenantSlug}/talent/settings/payouts/return`;
    const refreshUrl = `${origin}/${tenantSlug}/talent/settings/payouts?refresh=1`;

    const r = await createTalentOnboardingLink(
      tp.id as string,
      returnUrl,
      refreshUrl,
    );
    if (!r.ok) return { ok: false, error: r.error };
    return { ok: true, url: r.data.url };
  } catch (err) {
    logServerError("talent-payouts.startOnboarding", err);
    return { ok: false, error: "Unexpected error." };
  }
}

/** Cheap snapshot read for the page's initial render. */
export async function loadTalentPayoutSnapshot(): Promise<
  | { ok: true; snapshot: TalentConnectedAccountSnapshot }
  | { ok: false; error: string }
> {
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false, error: "Sign in required." };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, error: "Database unavailable." };
  const { data: tp } = await supabase
    .from("talent_profiles")
    .select("id")
    .eq("user_id", session.user.id)
    .maybeSingle();
  if (!tp) return { ok: false, error: "No talent profile found." };
  const r = await getTalentConnectedAccountSnapshot(tp.id as string);
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, snapshot: r.data };
}

/**
 * Mint an Express Dashboard login link for the current talent so they can link
 * a crypto wallet + set USDC as default, i.e. switch their payouts to
 * stablecoin (Global Payouts). Opened in a new tab by the payouts UI.
 */
export async function createTalentDashboardLinkAction(): Promise<
  { ok: true; url: string } | { ok: false; error: string }
> {
  try {
    const tp = await resolveOwnTalentProfileId();
    if (!tp.ok) return { ok: false, error: tp.error };
    const r = await createTalentDashboardLink(tp.id);
    if (!r.ok) return { ok: false, error: r.error };
    return { ok: true, url: r.data.url };
  } catch (err) {
    logServerError("talent-payouts.dashboardLink", err);
    return { ok: false, error: "Could not open your Stripe dashboard. Please try again." };
  }
}

/**
 * Whether the current talent's country supports stablecoin (USDC) Global
 * Payouts, drives whether the payouts UI shows the "link a crypto wallet"
 * path. Returns a human country label for the badge.
 */
export async function loadTalentStablecoinEligibility(): Promise<
  | { ok: true; eligible: boolean; countryLabel: string | null }
  | { ok: false; error: string }
> {
  const tp = await resolveOwnTalentProfileId();
  if (!tp.ok) return { ok: false, error: tp.error };
  const r = await getTalentStablecoinEligibility(tp.id);
  return {
    ok: true,
    eligible: r.eligible,
    countryLabel: r.country ? payoutCountryLabel(r.country) : null,
  };
}

/**
 * Current Global Payouts (local-bank) setup status for the signed-in talent.
 * Drives the "Get paid globally" card.
 */
export async function loadTalentGpStatus(): Promise<
  { ok: true; status: TalentGpStatus } | { ok: false; error: string }
> {
  const tp = await resolveOwnTalentProfileId();
  if (!tp.ok) return { ok: false, error: tp.error };
  return { ok: true, status: await getTalentGpStatus(tp.id) };
}

/**
 * Set up (or update) the talent's local-bank Global Payouts: creates their v2
 * recipient account if needed + attaches a bank payout method.
 */
export async function setupTalentGpBankAction(input: {
  country: string;
  currency: string;
  accountNumber: string;
  routingNumber?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const session = await getCachedActorSession();
    if (!session.user) return { ok: false, error: "Sign in required." };
    const tp = await resolveOwnTalentProfileId();
    if (!tp.ok) return { ok: false, error: tp.error };
    const email = session.user.email ?? `talent-${tp.id}@payouts.invalid`;
    const r = await setupTalentGpBank(tp.id, {
      country: input.country,
      currency: input.currency,
      accountNumber: input.accountNumber.trim(),
      routingNumber: (input.routingNumber ?? "").trim(),
      email,
    });
    if (!r.ok) return { ok: false, error: r.error };
    return { ok: true };
  } catch (err) {
    logServerError("talent-payouts.setupGp", err);
    return { ok: false, error: "Could not set up global payouts. Please try again." };
  }
}

/**
 * Manual "Sync from profile": push the talent's current name + contact metadata
 * to their Stripe recipient (fixes a recipient stuck on missing info, refreshes
 * the TAL- code/phone). Email + country stay immutable.
 */
export async function syncTalentGpProfileAction(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  try {
    const session = await getCachedActorSession();
    if (!session.user) return { ok: false, error: "Sign in required." };
    const tp = await resolveOwnTalentProfileId();
    if (!tp.ok) return { ok: false, error: tp.error };
    const email = session.user.email ?? `talent-${tp.id}@payouts.invalid`;
    return await syncTalentGpRecipient(tp.id, { email });
  } catch (err) {
    logServerError("talent-payouts.syncGp", err);
    return { ok: false, error: "Could not sync your details. Please try again." };
  }
}

/** List the talent's Global Payouts destinations (banks), default flagged. */
export async function loadTalentGpMethods(): Promise<
  { ok: true; methods: TalentGpMethod[] } | { ok: false; error: string }
> {
  const tp = await resolveOwnTalentProfileId();
  if (!tp.ok) return { ok: false, error: tp.error };
  const r = await listTalentGpPayoutMethods(tp.id);
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, methods: r.methods };
}

/** Make one of the talent's accounts the default payout destination. */
export async function setTalentGpDefaultAction(
  payoutMethodId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const tp = await resolveOwnTalentProfileId();
    if (!tp.ok) return { ok: false, error: tp.error };
    return await setTalentGpDefault(tp.id, payoutMethodId);
  } catch (err) {
    logServerError("talent-payouts.setDefault", err);
    return { ok: false, error: "Could not set the default account. Please try again." };
  }
}

/** Remove (archive) one of the talent's payout accounts. */
export async function removeTalentGpMethodAction(
  payoutMethodId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const tp = await resolveOwnTalentProfileId();
    if (!tp.ok) return { ok: false, error: tp.error };
    return await removeTalentGpPayoutMethod(tp.id, payoutMethodId);
  } catch (err) {
    logServerError("talent-payouts.removeMethod", err);
    return { ok: false, error: "Could not remove the account. Please try again." };
  }
}
