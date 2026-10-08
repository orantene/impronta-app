import "server-only";

/**
 * THEME CORE P0-4: loads what `canPinSiteToVersion` needs and answers for one
 * writer. Never throws: a failed read REFUSES (fail closed) and logs, so a
 * flaky read cannot let an unreleased pin through. Callers return their own
 * typed failure on `ok: false` and write nothing.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import { canPinSiteToVersion, type PinGuardRelease, type PinGuardResult } from "./pin-guard";

const READ_FAILED: PinGuardResult = {
  ok: false,
  code: "unreleased_version",
  latestReleased: null,
  reason: {
    en: "Could not check this design version. Try again in a moment.",
    es: "No se pudo comprobar la versión de este diseño. Inténtalo de nuevo en un momento.",
  },
};

export async function checkSitePin(
  admin: SupabaseClient,
  input: { talentProfileId: string; design: string; version: number; where: string },
): Promise<PinGuardResult> {
  const [prof, rel] = await Promise.all([
    admin.from("talent_profiles").select("is_demo").eq("id", input.talentProfileId).maybeSingle(),
    admin
      .from("talent_theme_releases")
      .select("design_slug, to_version, channel, status")
      .eq("design_slug", input.design),
  ]);
  if (prof.error || rel.error || !prof.data || !Array.isArray(rel.data)) {
    logServerError("themePinGuard.read", {
      where: input.where,
      design: input.design,
      error: prof.error?.message ?? rel.error?.message ?? "no profile row",
    });
    return READ_FAILED;
  }
  const res = canPinSiteToVersion({
    design: input.design,
    version: input.version,
    isDemoSite: (prof.data as { is_demo?: boolean | null }).is_demo === true,
    releases: rel.data as PinGuardRelease[],
  });
  if (!res.ok) {
    logServerError("themePinGuard.refused", {
      where: input.where,
      design: input.design,
      version: input.version,
      latestReleased: res.latestReleased,
      talentProfileId: input.talentProfileId,
    });
  }
  return res;
}

/** Same check for a writer that only knows the site id (reads the site's profile + design). */
export async function checkSitePinBySiteId(
  admin: SupabaseClient,
  input: { siteId: string; version: number; where: string },
): Promise<PinGuardResult> {
  const { data, error } = await admin
    .from("talent_sites")
    .select("talent_profile_id, theme_design_slug")
    .eq("id", input.siteId)
    .maybeSingle();
  const row = data as { talent_profile_id?: string | null; theme_design_slug?: string | null } | null;
  if (error || !row?.talent_profile_id || !row.theme_design_slug) {
    logServerError("themePinGuard.siteRead", {
      where: input.where,
      siteId: input.siteId,
      error: error?.message ?? "no site design",
    });
    return READ_FAILED;
  }
  return checkSitePin(admin, {
    talentProfileId: row.talent_profile_id,
    design: row.theme_design_slug,
    version: input.version,
    where: input.where,
  });
}
