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
import {
  createTalentOnboardingLink,
  getTalentConnectedAccountSnapshot,
  type TalentConnectedAccountSnapshot,
} from "@/lib/payments/stripe-connect-talent";

export type StartOnboardingResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

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
