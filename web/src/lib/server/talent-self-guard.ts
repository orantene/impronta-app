import "server-only";

import {
  talentPlanGrantsAccessCapability,
  talentPlanGrantsCapability,
  talentPlanGrantsSiteCapability,
  talentPlanToTier,
  type TalentPlanKey,
} from "@/lib/access/talent-membership";
import { isTalentSiteTierExpansionEnabled } from "@/lib/access/talent-site-tier-expansion";
import { pickLocale } from "@/lib/i18n/pick-locale";
import {
  isTemplateAllowedForTier,
  type TalentSiteTemplateKey,
} from "@/lib/talent-site/templates/registry";
import { getTenantPortalScopeBySlug } from "@/lib/saas/scope";
import {
  loadTalentSelfProfile,
  loadTalentSelfProfileByUser,
  type TalentSelfProfile,
} from "@/app/(workspace)/[tenantSlug]/_data-bridge/talent";
import { requireSession, type GuardedSession } from "@/lib/server/action-guards";

export type TalentSelfScopeOk = {
  ok: true;
  session: GuardedSession;
  tenantId: string;
  tenantSlug: string;
  talentProfile: TalentSelfProfile;
  planKey: string;
};

export type TalentSelfScopeFail = {
  ok: false;
  code: "not_authenticated" | "workspace_not_found" | "talent_profile_not_found";
  error: string;
};

export type TalentSelfScopeResult = TalentSelfScopeOk | TalentSelfScopeFail;

/** Platform-scoped talent guard — no tenant slug in the URL. */
export async function requireTalentSelf(): Promise<TalentSelfScopeResult> {
  const session = await requireSession();
  if (!session.ok) {
    return {
      ok: false,
      code: "not_authenticated",
      error: session.error,
    };
  }

  const talentProfile = await loadTalentSelfProfileByUser(session.user.id);
  if (!talentProfile) {
    return {
      ok: false,
      code: "talent_profile_not_found",
      error: "Talent profile not found.",
    };
  }

  return {
    ok: true,
    session,
    tenantId: "",
    tenantSlug: "",
    talentProfile,
    planKey: talentProfile.talentPlanKey,
  };
}

export async function requireTalentSelfScope(
  tenantSlug: string,
): Promise<TalentSelfScopeResult> {
  const session = await requireSession();
  if (!session.ok) {
    return {
      ok: false,
      code: "not_authenticated",
      error: session.error,
    };
  }

  const scope = await getTenantPortalScopeBySlug(tenantSlug);
  if (!scope) {
    return {
      ok: false,
      code: "workspace_not_found",
      error: "Workspace not found.",
    };
  }

  const talentProfile = await loadTalentSelfProfile(session.user.id, scope.tenantId);
  if (!talentProfile) {
    return {
      ok: false,
      code: "talent_profile_not_found",
      error: "Talent profile not found in this workspace.",
    };
  }

  return {
    ok: true,
    session,
    tenantId: scope.tenantId,
    tenantSlug,
    talentProfile,
    planKey: talentProfile.talentPlanKey,
  };
}

function siteExpansionBlocked(planKey: string): boolean {
  return (
    !isTalentSiteTierExpansionEnabled() &&
    talentPlanToTier(planKey) !== "max"
  );
}

export function assertTalentCanEditPersonalSite(planKey: string): boolean {
  if (siteExpansionBlocked(planKey)) return false;
  return talentPlanGrantsAccessCapability(planKey, "talent.page.edit");
}

export function assertTalentCanPublishPersonalSite(planKey: string): boolean {
  if (siteExpansionBlocked(planKey)) return false;
  return talentPlanGrantsAccessCapability(planKey, "talent.page.publish");
}

export function assertTalentCanApplyTemplate(planKey: string): boolean {
  if (siteExpansionBlocked(planKey)) return false;
  return talentPlanGrantsCapability(planKey, "personalSiteTemplate");
}

export function assertTalentCanUseCustomBuilder(planKey: string): boolean {
  if (siteExpansionBlocked(planKey)) return false;
  return talentPlanGrantsCapability(planKey, "personalSiteCustomBuilder");
}

export function assertTalentCanSaveComposition(planKey: string): boolean {
  return assertTalentCanUseCustomBuilder(planKey);
}

// ── Phase 1 — personal WEBSITE guards ───────────────────────────────────────
// Each reads the SITE-scoped capability record, so while
// `TALENT_FREE_WEBSITE_ENABLED` is off every one of them is Max-only and the
// behaviour is identical to the single `assertTalentCanUseCustomBuilder` gate
// these replace. `siteExpansionBlocked` is deliberately NOT re-applied: the
// site reader already fails closed for every non-Max plan while the switch is
// off, and stacking the two would make the Free path un-openable when the
// operator disables only the tier-expansion escape hatch.

/** Web Office — add / delete / reorder / set-home EXTRA pages. */
export function assertTalentCanManageSitePages(planKey: string): boolean {
  return talentPlanGrantsSiteCapability(planKey, "personalSitePages");
}

/** Web Office — insert / paste / duplicate sections and nested blocks. */
export function assertTalentCanInsertSiteSections(planKey: string): boolean {
  return talentPlanGrantsSiteCapability(planKey, "personalSiteSections");
}

/** Web Office — write the per-page SEO columns (and have them rendered). */
export function assertTalentCanEditSiteSeo(planKey: string): boolean {
  return talentPlanGrantsSiteCapability(planKey, "personalSiteSeo");
}

/** Web Office — the personal-site analytics surface. */
export function assertTalentCanViewSiteAnalytics(planKey: string): boolean {
  return talentPlanGrantsSiteCapability(planKey, "personalSiteAnalytics");
}

/**
 * FREE for every tier — pick and switch a Design or a Look. Design switching is
 * part of the free website (see the plan's Product section), so this is gated on
 * `personalSiteDesignPresets`, never on a paid key.
 */
export function assertTalentCanApplyDesignPreset(planKey: string): boolean {
  return talentPlanGrantsSiteCapability(planKey, "personalSiteDesignPresets");
}

/** Edit page/shell content, the site slug, and publish the site. */
export function assertTalentCanEditSite(planKey: string): boolean {
  return talentPlanGrantsSiteCapability(planKey, "personalSiteEdit");
}

/**
 * Max-only — connect / verify / manage a custom domain for the personal Max
 * site. Mirrors the agency "manage custom domains" gate. The DB RLS on
 * `talent_site_domains` re-enforces the same Max requirement, so this is the
 * outer (UX-facing) half of a defense-in-depth pair.
 */
export function assertTalentCanConnectCustomDomain(planKey: string): boolean {
  if (siteExpansionBlocked(planKey)) return false;
  return talentPlanGrantsAccessCapability(planKey, "talent.page.connect_custom_domain");
}

/**
 * Pro AND Portfolio — the public-profile extras the paid plans market: social /
 * video embeds and the press band. Both are `profile.enhanced` in the talent
 * plan catalog, so this reads the catalog rather than hard-coding plan keys;
 * the DB RLS on `talent_profile_embeds` / `talent_press_items` re-enforces the
 * same Pro-or-Max requirement via `talent_profile_has_pro_or_max()`, making
 * this the outer (UX-facing) half of a defense-in-depth pair.
 *
 * Deliberately NOT behind `siteExpansionBlocked` — that flag gates the personal
 * SITE builder, not the /t/[code] profile these extras render on.
 */
export function assertTalentCanManageProfileExtras(planKey: string): boolean {
  return talentPlanGrantsCapability(planKey, "profile.enhanced");
}

/**
 * Pro+ — generate / download the media kit (EPK) PDF.
 *
 * Rides on `profile.enhanced`, the capability already held by exactly
 * `talent_pro` and `talent_portfolio`, rather than minting a parallel gate
 * that could drift away from the marketed lineup. Deliberately NOT coupled to
 * `siteExpansionBlocked` — the kit is a profile export, not a personal-site
 * feature, so the site-tier kill switch has no say over it.
 */
export function assertTalentCanGenerateMediaKit(planKey: string): boolean {
  return talentPlanGrantsCapability(planKey, "profile.enhanced");
}

export function assertTemplateAllowedForPlan(
  planKey: string,
  templateKey: TalentSiteTemplateKey,
): boolean {
  if (!assertTalentCanApplyTemplate(planKey)) return false;
  return isTemplateAllowedForTier(templateKey, talentPlanToTier(planKey));
}

/**
 * Phase 1 — refusal copy for the personal-website capabilities, in en + es.
 * Named "Web Office" (the single paid talent tier), never "Portfolio"/"Max".
 */
const SITE_DENIED_COPY = {
  site_pages: {
    en: "Extra pages are part of Web Office. Upgrade to add pages to your website.",
    es: "Las páginas adicionales son parte de Web Office. Mejora tu plan para añadir páginas a tu sitio.",
  },
  site_sections: {
    en: "Adding sections and blocks is part of Web Office. Upgrade to build beyond your free layout.",
    es: "Añadir secciones y bloques es parte de Web Office. Mejora tu plan para ir más allá de tu diseño gratuito.",
  },
  site_seo: {
    en: "SEO settings are part of Web Office. Upgrade to control how your site appears in search.",
    es: "Los ajustes de SEO son parte de Web Office. Mejora tu plan para controlar cómo aparece tu sitio en las búsquedas.",
  },
  site_analytics: {
    en: "Website analytics are part of Web Office. Upgrade to see how visitors use your site.",
    es: "Las estadísticas del sitio son parte de Web Office. Mejora tu plan para ver cómo usan tu sitio las visitas.",
  },
  site_custom_domain: {
    en: "A custom domain is part of Web Office. Upgrade to connect your own address.",
    es: "Un dominio propio es parte de Web Office. Mejora tu plan para conectar tu propia dirección.",
  },
  site_edit: {
    en: "You cannot edit this website right now.",
    es: "Ahora mismo no puedes editar este sitio.",
  },
  design_presets: {
    en: "You cannot change the design of this website right now.",
    es: "Ahora mismo no puedes cambiar el diseño de este sitio.",
  },
} as const;

export type TalentSiteDeniedCapability = keyof typeof SITE_DENIED_COPY;

/** en + es refusal copy for a personal-website capability. */
export function siteCapabilityDeniedMessage(
  capability: TalentSiteDeniedCapability,
  locale?: string | null,
): string {
  return pickLocale(locale, SITE_DENIED_COPY[capability]);
}

export function planDeniedMessage(
  capability:
    | "template"
    | "custom_builder"
    | "edit"
    | "profile_extras"
    | "media_kit"
    | TalentSiteDeniedCapability,
  locale?: string | null,
): string {
  if (capability in SITE_DENIED_COPY) {
    return siteCapabilityDeniedMessage(capability as TalentSiteDeniedCapability, locale);
  }
  if (capability === "profile_extras") {
    return "Upgrade to Pro to add social and video embeds and a press band to your profile.";
  }
  if (capability === "template") {
    return "Upgrade to Pro to choose premium templates.";
  }
  if (capability === "media_kit") {
    return "Upgrade to Pro to download your media kit.";
  }
  if (capability === "custom_builder") {
    return "Upgrade to Portfolio to customize sections and build your service website.";
  }
  if (!isTalentSiteTierExpansionEnabled()) {
    return "Personal site editing is temporarily unavailable. Please try again later.";
  }
  return "Upgrade to Max to customize sections and build your service website.";
}

export type { TalentPlanKey };
