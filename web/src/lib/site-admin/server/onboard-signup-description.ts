/**
 * onboard-signup-description.ts — park the signup's "what do you do?" blurb on
 * the workspace.
 *
 * `saas_marketing_signups.business_description` is collected by the
 * /get-started disclosure and its migration comment promises it "seeds the
 * page-builder AI 'describe your page' front door during onboarding". It never
 * did: `loadLead`'s SELECT did not list the column, so the value stopped at the
 * lead row and the workspace never saw it.
 *
 * The provisioner now stamps it into `agencies.settings.signup_business_
 * description` at insert time, alongside the other `signup_*` provenance keys.
 * This helper is the BACKFILL half, run from the starter seed so the two
 * crash-recovery paths (and any workspace provisioned before this landed) also
 * pick it up the next time the signup trampoline runs.
 *
 * Write-once and non-fatal by design: it never overwrites a value that is
 * already there, and any failure degrades a future AI prefill, never the seed.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";

/** The `agencies.settings` key. Shared so readers and writers cannot drift. */
export const SIGNUP_BUSINESS_DESCRIPTION_KEY = "signup_business_description";

/** Trimmed, or null when there is nothing worth storing. */
export function normalizeSignupBusinessDescription(
  raw: unknown,
): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function persistSignupBusinessDescription(
  client: SupabaseClient,
  params: { tenantId: string; businessDescription?: string | null },
): Promise<void> {
  const description = normalizeSignupBusinessDescription(
    params.businessDescription,
  );
  if (!description || !params.tenantId) return;

  const { data, error } = await client
    .from("agencies")
    .select("settings")
    .eq("id", params.tenantId)
    .maybeSingle<{ settings: Record<string, unknown> | null }>();
  if (error || !data) {
    if (error) logServerError("onboardStarterContent.signupDescription.read", error);
    return;
  }

  const settings =
    data.settings && typeof data.settings === "object" ? data.settings : {};
  // Never clobber. The provisioner writes this at insert time; an operator or a
  // later feature may well have edited it since.
  if (normalizeSignupBusinessDescription(settings[SIGNUP_BUSINESS_DESCRIPTION_KEY])) {
    return;
  }

  const { error: writeError } = await client
    .from("agencies")
    .update({
      settings: { ...settings, [SIGNUP_BUSINESS_DESCRIPTION_KEY]: description },
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.tenantId);
  if (writeError) {
    logServerError("onboardStarterContent.signupDescription.write", writeError);
  }
}
