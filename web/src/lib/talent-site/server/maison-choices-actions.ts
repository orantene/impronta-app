"use server";

/**
 * Persist Maison setup choices on talent_sites.setup_choices (AUD-023 / W75).
 * localStorage in the host is only a same-device cache.
 */

import { assertNotImpersonating } from "@/lib/impersonation/readonly-guard";
import { isTalentMaisonThemeEnabled } from "@/lib/access/talent-maison-theme";
import { getCachedServerSupabase } from "@/lib/server/request-cache";
import { logServerError } from "@/lib/server/safe-error";
import {
  isMaisonSetupResumable,
  maisonResumeSummaryLine,
  parseMaisonChoices,
  persistableMaisonChoices,
  type MaisonSetupChoices,
} from "@/components/talent/site/maison-setup/maison-choices";
import { gate } from "./site-action-gate";
import type { ThemeActionResult } from "./theme-action-types";

export type MaisonResumeCardState = {
  choices: MaisonSetupChoices;
  summaryLine: string;
  talentProfileId: string;
};

export async function saveMaisonSetupChoicesAction(
  raw: unknown,
): Promise<ThemeActionResult<{ saved: true }>> {
  const readOnly = await assertNotImpersonating();
  if (!readOnly.ok) return { ok: false, code: "not_owner", error: readOnly.error };
  const g = await gate("personalSiteEdit");
  if (!g.ok) return g;
  if (!isTalentMaisonThemeEnabled(g.talentProfileId)) {
    return { ok: false, code: "feature_disabled", error: "Maison is not available yet." };
  }
  const sb = await getCachedServerSupabase();
  if (!sb) return { ok: false, code: "server_error", error: "Not configured." };

  const choices = parseMaisonChoices(raw);
  const payload = persistableMaisonChoices(choices);

  const { error, count } = await sb
    .from("talent_sites")
    .update(
      {
        setup_choices: payload,
        updated_at: new Date().toISOString(),
        updated_by: g.userId,
      },
      { count: "exact" },
    )
    .eq("talent_profile_id", g.talentProfileId);
  if (error) {
    logServerError("maison.choices.save", error);
    return { ok: false, code: "server_error", error: "Could not save your choices." };
  }
  if (!count) {
    return { ok: false, code: "server_error", error: "Site not found." };
  }
  return { ok: true, data: { saved: true } };
}

/**
 * Today resume card loader (cr_resume). Returns null when not mid-setup,
 * published, or Maison is off for this talent.
 */
export async function loadMaisonResumeCardAction(input?: {
  locale?: string;
}): Promise<MaisonResumeCardState | null> {
  const g = await gate("personalSiteEdit");
  if (!g.ok) return null;
  if (!isTalentMaisonThemeEnabled(g.talentProfileId)) return null;

  const sb = await getCachedServerSupabase();
  if (!sb) return null;

  const { data, error } = await sb
    .from("talent_sites")
    .select("setup_choices, site_published_at")
    .eq("talent_profile_id", g.talentProfileId)
    .maybeSingle();
  if (error) {
    logServerError("maison.choices.resume", error);
    return null;
  }
  const row = data as {
    setup_choices?: unknown;
    site_published_at?: string | null;
  } | null;
  if (!row || row.site_published_at) return null;
  if (row.setup_choices == null) return null;

  const choices = parseMaisonChoices(row.setup_choices);
  if (!isMaisonSetupResumable(choices)) return null;

  const locale = input?.locale === "es" ? "es" : "en";
  return {
    choices,
    summaryLine: maisonResumeSummaryLine(choices, locale),
    talentProfileId: g.talentProfileId,
  };
}
