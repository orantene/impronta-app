"use server";

/**
 * Maison Review loaders (W37–W39) — readiness + site address for the Review screen.
 */

import { isTalentMaisonThemeEnabled } from "@/lib/access/talent-maison-theme";
import { getCachedServerSupabase } from "@/lib/server/request-cache";
import { logServerError } from "@/lib/server/safe-error";
import { isTalentSiteSubdomainsEnabled } from "@/lib/access/talent-site-subdomains";
import {
  talentSitePathUrl,
  talentSitePublicUrl,
} from "@/lib/talent-site/site-public-url";
import { isPlatformSubdomainLabelTaken } from "@/lib/saas/platform-subdomain-namespace.server";
import { gate } from "./site-action-gate";
import type { ThemeActionResult } from "./theme-action-types";
import {
  evaluateMaisonPublishReadiness,
  type MaisonPublishReadiness,
} from "./maison-publish-readiness";
import { isMaisonPendingUndo } from "./maison-design-snapshot";
import { MAISON_PALETTES, type MaisonPaletteKey } from "@/lib/talent-site/theme-catalog/maison/seed";
import { designSummaryLine } from "@/lib/talent-site/maison-summary-line";
import {
  parseMaisonCustomPaletteStored,
  type MaisonCustomPaletteStored,
} from "@/lib/talent-site/theme-catalog/maison/maison-custom-palette";

export type MaisonReviewState = {
  siteSlug: string | null;
  publicSiteUrl: string | null;
  themeDesignSlug: string | null;
  themeLookSlug: string | null;
  canUndo: boolean;
  readiness: MaisonPublishReadiness;
  /** e.g. "Maison · Lilac & Plum · Your content" or "Maison · My colors · Your content" (W66) */
  summaryLine: string;
  contentMode: "demo" | "mine";
  paletteKey: MaisonPaletteKey | null;
  customPalette: MaisonCustomPaletteStored | null;
};

function siteUrl(slug: string | null, isDemo = false): string | null {
  if (!slug) return null;
  if (isTalentSiteSubdomainsEnabled()) {
    const hostUrl = talentSitePublicUrl(slug, { isDemo });
    if (hostUrl) return hostUrl;
  }
  return talentSitePathUrl(slug);
}

function lookSlugToPaletteKey(lookSlug: string | null): MaisonPaletteKey | null {
  if (!lookSlug?.startsWith("maison-")) return null;
  const key = lookSlug.slice("maison-".length);
  return key in MAISON_PALETTES ? (key as MaisonPaletteKey) : null;
}

function buildSummaryLine(input: {
  designSlug: string | null;
  lookSlug: string | null;
  paletteKey: MaisonPaletteKey | null;
  customPalette: MaisonCustomPaletteStored | null;
  contentMode: "demo" | "mine";
  locale: "en" | "es";
}): string {
  const content =
    input.contentMode === "mine"
      ? input.locale === "es"
        ? "Tu contenido"
        : "Your content"
      : input.locale === "es"
        ? "Contenido demo"
        : "Demo content";
  // F33: the applied design + look from the saved row, never "Maison" by default.
  return designSummaryLine({ ...input, tail: content });
}

export async function loadMaisonReviewStateAction(input?: {
  contentMode?: string;
  locale?: string;
}): Promise<ThemeActionResult<MaisonReviewState>> {
  const g = await gate("personalSiteEdit");
  if (!g.ok) return g;
  if (!isTalentMaisonThemeEnabled(g.talentProfileId)) {
    return { ok: false, code: "feature_disabled", error: "Maison is not available yet." };
  }
  const sb = await getCachedServerSupabase();
  if (!sb) return { ok: false, code: "server_error", error: "Not configured." };

  const [{ data, error }, demoRes] = await Promise.all([
    sb
      .from("talent_sites")
      .select("site_slug, theme_design_slug, theme_look_slug, pending_design, custom_palette")
      .eq("talent_profile_id", g.talentProfileId)
      .maybeSingle(),
    sb.from("talent_profiles").select("is_demo").eq("id", g.talentProfileId).maybeSingle(),
  ]);
  if (error) {
    logServerError("maison.review.load", error);
    return { ok: false, code: "server_error", error: "Could not load review state." };
  }
  const isDemo = (demoRes.data as { is_demo?: boolean } | null)?.is_demo === true;
  const row = (data ?? null) as {
    site_slug: string | null;
    theme_design_slug: string | null;
    theme_look_slug: string | null;
    pending_design: unknown;
    custom_palette: unknown;
  } | null;

  const contentMode = input?.contentMode === "mine" ? "mine" : "demo";
  const locale = input?.locale === "es" ? "es" : "en";
  const paletteKey = lookSlugToPaletteKey(row?.theme_look_slug ?? null);
  const pending = row?.pending_design;
  const appliedMode =
    isMaisonPendingUndo(pending) && pending.applied.contentMode === "mine" ? "mine" : contentMode;
  const appliedCustom =
    (isMaisonPendingUndo(pending) && pending.applied.customPalette
      ? parseMaisonCustomPaletteStored(pending.applied.customPalette)
      : null) ?? parseMaisonCustomPaletteStored(row?.custom_palette);
  const appliedPalette =
    appliedCustom
      ? null
      : isMaisonPendingUndo(pending) && pending.applied.paletteKey
        ? pending.applied.paletteKey
        : paletteKey;

  const slugForCheck = (row?.site_slug ?? "").trim();
  const slugTaken = slugForCheck
    ? await isPlatformSubdomainLabelTaken(slugForCheck, {
        excludeTalentProfileId: g.talentProfileId,
      })
    : null;
  const readiness = evaluateMaisonPublishReadiness({
    siteSlug: row?.site_slug ?? null,
    themeDesignSlug: row?.theme_design_slug ?? null,
    slugTaken,
    locale,
  });

  return {
    ok: true,
    data: {
      siteSlug: row?.site_slug ?? null,
      publicSiteUrl: siteUrl(row?.site_slug ?? null, isDemo),
      themeDesignSlug: row?.theme_design_slug ?? null,
      themeLookSlug: row?.theme_look_slug ?? null,
      canUndo: isMaisonPendingUndo(pending),
      readiness,
      summaryLine: buildSummaryLine({
        designSlug: row?.theme_design_slug ?? null,
        lookSlug: row?.theme_look_slug ?? null,
        paletteKey: appliedPalette,
        customPalette: appliedCustom,
        contentMode: appliedMode,
        locale,
      }),
      contentMode: appliedMode,
      paletteKey: appliedPalette,
      customPalette: appliedCustom,
    },
  };
}
