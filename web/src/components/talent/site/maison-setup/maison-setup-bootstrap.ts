"use server";

/**
 * Maison Choose-a-design bootstrap. Flag-off → `{ enabled: false }` so the
 * host renders nothing and TalentMaxSiteManager keeps today's gallery path.
 */
import { isTalentMaisonThemeEnabled } from "@/lib/access/talent-maison-theme";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { parseMaisonCustomPaletteStored } from "@/lib/talent-site/theme-catalog/maison/maison-custom-palette";
import { gate } from "@/lib/talent-site/server/site-action-gate";

export type MaisonSetupBootstrap =
  | { enabled: false }
  | {
      enabled: true;
      talentProfileId: string;
      sitePublished: boolean;
      themeLookSlug: string | null;
      customPalette: ReturnType<typeof parseMaisonCustomPaletteStored>;
    };

export async function loadMaisonSetupBootstrapAction(): Promise<MaisonSetupBootstrap> {
  if (!isTalentMaisonThemeEnabled()) return { enabled: false };
  const g = await gate("personalSiteEdit");
  if (!g.ok) return { enabled: false };

  const admin = createServiceRoleClient();
  if (!admin) {
    return {
      enabled: true,
      talentProfileId: g.talentProfileId,
      sitePublished: false,
      themeLookSlug: null,
      customPalette: null,
    };
  }
  const { data, error } = await admin
    .from("talent_sites")
    .select("site_published_at, theme_look_slug, custom_palette")
    .eq("talent_profile_id", g.talentProfileId)
    .maybeSingle();
  if (error) {
    // Best-effort live metadata — host still mounts; detail falls back to choices.
    logServerError("maison.setup.bootstrap.site", error);
    return {
      enabled: true,
      talentProfileId: g.talentProfileId,
      sitePublished: false,
      themeLookSlug: null,
      customPalette: null,
    };
  }
  const row = data as {
    site_published_at?: string | null;
    theme_look_slug?: string | null;
    custom_palette?: unknown;
  } | null;

  return {
    enabled: true,
    talentProfileId: g.talentProfileId,
    sitePublished: Boolean(row?.site_published_at),
    themeLookSlug: typeof row?.theme_look_slug === "string" ? row.theme_look_slug : null,
    customPalette: parseMaisonCustomPaletteStored(row?.custom_palette),
  };
}
