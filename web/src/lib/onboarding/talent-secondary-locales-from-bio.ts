/**
 * TUL-442 · when onboarding writes a non-primary bio (usually `en` beside an
 * `es` preferred locale), enable that locale on the public site.
 *
 * `/en` is gated by `talent_profiles.secondary_locales` via
 * `loadTalentLocaleSettingsForProxy` → `decideTalentSiteLocale`. Writing
 * `bio_i18n.en` alone leaves `/en` as a branded 404. Add-only merge: never
 * wipe a list the person already set, and never put the primary in secondary.
 * Best effort: a failure is logged and never fails the build.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";
import { invalidateTalentLocaleSettings } from "@/lib/site-admin/server/talent-locale-settings";

import {
  secondaryLocalesFromBioEntries,
  type BioLocale,
  type DraftedBio,
} from "./bilingual-bio";

/** Locales to add into `secondary_locales`, or empty when nothing new is needed. */
export function secondaryLocalesToEnable(
  entries: readonly DraftedBio[],
  primary: BioLocale,
  current: readonly string[] | null | undefined,
): BioLocale[] {
  const wanted = secondaryLocalesFromBioEntries(entries, primary);
  const have = new Set(current ?? []);
  return wanted.filter((locale) => !have.has(locale));
}

export async function enableSecondaryLocalesFromBios(
  admin: SupabaseClient,
  talentProfileId: string,
  entries: readonly DraftedBio[],
  primary: BioLocale,
): Promise<void> {
  if (!talentProfileId || !entries.length) return;
  const wanted = secondaryLocalesFromBioEntries(entries, primary);
  if (!wanted.length) return;
  try {
    const { data, error: readErr } = await admin
      .from("talent_profiles")
      .select("secondary_locales")
      .eq("id", talentProfileId)
      .maybeSingle();
    if (readErr) {
      logServerError("onboarding.talentWriter.secondaryLocalesRead", readErr);
      return;
    }
    const current = (data?.secondary_locales as string[] | null | undefined) ?? [];
    const missing = secondaryLocalesToEnable(entries, primary, current);
    if (!missing.length) return;
    const next = [...current, ...missing];
    const { error } = await admin
      .from("talent_profiles")
      .update({ secondary_locales: next })
      .eq("id", talentProfileId);
    if (error) {
      logServerError("onboarding.talentWriter.secondaryLocales", error);
      return;
    }
    invalidateTalentLocaleSettings(talentProfileId);
  } catch (err) {
    logServerError("onboarding.talentWriter.secondaryLocales", err);
  }
}
