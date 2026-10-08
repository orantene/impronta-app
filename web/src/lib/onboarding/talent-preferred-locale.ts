/**
 * TUL-117 · the /start flow's language becomes the talent's own language.
 *
 * `talent_profiles.preferred_locale` is what the talent dashboard seeds its
 * `locale` cookie from, so a person who built their page in Spanish must have
 * it stored or a fresh browser falls back to English. Fill-only-if-null: a
 * stored choice (the old flow, the language switch) is never overwritten, and
 * the guard lives in the UPDATE itself (`is null`) so two racing builds cannot
 * both write. Best effort: a failure is logged and never fails the build.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";
import { invalidateTalentLocaleSettings } from "@/lib/site-admin/server/talent-locale-settings";

export type TalentFlowLocale = "en" | "es";

/** The flow locale worth storing, or null when it is not one the platform ships. */
export function talentPreferredLocaleToFill(locale: string | null | undefined): TalentFlowLocale | null {
  return locale === "en" || locale === "es" ? locale : null;
}

export async function fillTalentPreferredLocale(
  admin: SupabaseClient,
  talentProfileId: string,
  locale: string | null | undefined,
): Promise<void> {
  const fill = talentPreferredLocaleToFill(locale);
  if (!fill || !talentProfileId) return;
  try {
    const { error } = await admin
      .from("talent_profiles")
      .update({ preferred_locale: fill })
      .eq("id", talentProfileId)
      .is("preferred_locale", null);
    if (error) {
      logServerError("onboarding.talentWriter.preferredLocale", error);
      return;
    }
    invalidateTalentLocaleSettings(talentProfileId);
  } catch (err) {
    logServerError("onboarding.talentWriter.preferredLocale", err);
  }
}
