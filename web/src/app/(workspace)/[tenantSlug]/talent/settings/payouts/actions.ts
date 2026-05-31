"use server";

/**
 * Talent payouts — server actions for Stripe Connect Express onboarding.
 *
 * Messages Consolidation Plan v2 — Item #13.
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
  getTalentConnectedAccountSnapshot,
  refreshTalentAccountStatus,
  type TalentConnectedAccountSnapshot,
} from "@/lib/payments/stripe-connect-talent";

export type StartOnboardingResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

export type AccountSessionResult =
  | { ok: true; clientSecret: string }
  | { ok: false; error: string };

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
 * onboarding). Powers the in-app, Tulala-branded embedded onboarding —
 * the talent never leaves for stripe.com.
 *
 * `external_account_collection` is enabled so the talent can attach
 * their bank account inside the embedded flow.
 */
export async function createTalentAccountSession(): Promise<AccountSessionResult> {
  try {
    if (!isStripeConfigured()) {
      return { ok: false, error: "Payouts are not available right now." };
    }
    const stripe = getStripe();
    if (!stripe) return { ok: false, error: "Payouts are not available right now." };

    const tp = await resolveOwnTalentProfileId();
    if (!tp.ok) return { ok: false, error: tp.error };

    const ensure = await createOrGetTalentConnectedAccount(tp.id);
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
 * URL — client redirects via window.location.href.
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
