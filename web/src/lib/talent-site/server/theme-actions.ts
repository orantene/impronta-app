"use server";

/**
 * Talent theme gallery: SERVER ACTIONS (thin). Every export is an async action;
 * the heavy lifting lives in `theme-apply-core.ts`, result types in
 * `theme-action-types.ts`.
 *
 * Gating, in order:
 *   1. `TALENT_THEME_GALLERY_ENABLED` (dark launch; off → `feature_disabled`);
 *   2. the site-action gate (signed-in owner + capability). Design applies under
 *      `personalSiteEdit` and Look under `personalSiteDesignPresets` — both FREE
 *      for every tier once `TALENT_FREE_WEBSITE_ENABLED` is on, and both Max-only
 *      while it is off;
 *   3. the catalog row must be PUBLISHED and its `required_talent_tier` within
 *      the caller's plan.
 *
 * Writes go through the service-role client scoped to the gated talent's own
 * site (resolved from the gate, never from input).
 */

import type { TalentSiteCapability } from "@/lib/access/talent-membership";
import { isTalentThemeGalleryEnabled } from "@/lib/access/talent-theme-gallery";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { talentPlanAllowsThemeTier } from "../theme-catalog/tier";
import type { TalentThemeKind } from "../theme-catalog/types";
import { provisionTalentMaxSite } from "./provision-max-site";
import { gate, type GateOk } from "./site-action-gate";
import type { ThemeActionResult } from "./theme-action-types";
import { applyDesign, applyLook, publishSiteTheme } from "./theme-apply-core";
import { loadPublishedCatalogRow } from "./theme-catalog-row";

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

type Ready = { ok: true; g: GateOk; admin: NonNullable<ReturnType<typeof createServiceRoleClient>> };
type NotReady = Extract<ThemeActionResult, { ok: false }>;

async function ready(capability: TalentSiteCapability): Promise<Ready | NotReady> {
  if (!isTalentThemeGalleryEnabled()) {
    return { ok: false, code: "feature_disabled", error: "Themes are not available yet." };
  }
  const g = await gate(capability);
  if (!g.ok) return g;
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, code: "server_error", error: "Not configured." };
  return { ok: true, g, admin };
}

async function loadRowFor<K extends TalentThemeKind>(
  r: Ready,
  kind: K,
  slug: unknown,
) {
  if (typeof slug !== "string" || !SLUG_RE.test(slug)) {
    return { ok: false as const, code: "invalid_input" as const, error: "Unknown theme." };
  }
  const row = await loadPublishedCatalogRow(r.admin, kind, slug);
  if (!row) return { ok: false as const, code: "theme_not_found" as const, error: "Theme not found." };
  if (!talentPlanAllowsThemeTier(r.g.planKey, row.required_talent_tier)) {
    return { ok: false as const, code: "tier_required" as const, error: "Upgrade to use this theme." };
  }
  return { ok: true as const, row };
}

async function ensureSiteId(r: Ready): Promise<{ ok: true; siteId: string } | NotReady> {
  const provisioned = await provisionTalentMaxSite(r.g.talentProfileId, r.g.userId);
  if (!provisioned.ok) return { ok: false, code: "server_error", error: provisioned.error };
  return { ok: true, siteId: provisioned.siteId };
}

/** Apply a Design: rewrites the DRAFT shell + home (content re-hydrated). */
export async function applySiteDesignAction(input: {
  designSlug: string;
}): Promise<ThemeActionResult<{ designSlug: string; designVersion: number }>> {
  const r = await ready("personalSiteEdit");
  if (!r.ok) return r;
  const loaded = await loadRowFor(r, "design", input?.designSlug);
  if (!loaded.ok) return loaded;
  const site = await ensureSiteId(r);
  if (!site.ok) return site;
  return applyDesign(r.admin, {
    talentProfileId: r.g.talentProfileId,
    siteId: site.siteId,
    design: loaded.row,
    displayName: r.g.displayName,
    userId: r.g.userId,
  });
}

/** Apply a Look: merges its colour + font layer into the DRAFT site tokens. */
export async function applySiteLookAction(input: {
  lookSlug: string;
}): Promise<ThemeActionResult<{ lookSlug: string; draftTokens: Record<string, string> }>> {
  const r = await ready("personalSiteDesignPresets");
  if (!r.ok) return r;
  const loaded = await loadRowFor(r, "look", input?.lookSlug);
  if (!loaded.ok) return loaded;
  const site = await ensureSiteId(r);
  if (!site.ok) return site;
  return applyLook(r.admin, { siteId: site.siteId, look: loaded.row, userId: r.g.userId });
}

/** Publish the site theme: draft tokens go live (CAS on theme_version). */
export async function publishSiteThemeAction(): Promise<
  ThemeActionResult<{ themeVersion: number }>
> {
  const r = await ready("personalSiteEdit");
  if (!r.ok) return r;
  const { data, error } = await r.admin
    .from("talent_sites")
    .select("id")
    .eq("talent_profile_id", r.g.talentProfileId)
    .maybeSingle();
  if (error) {
    logServerError("talentTheme.publishAction.site", error);
    return { ok: false, code: "server_error", error: "Could not publish the theme." };
  }
  const siteId = (data as { id?: string } | null)?.id;
  if (!siteId) return { ok: false, code: "site_not_found", error: "Site not found." };
  return publishSiteTheme(r.admin, { siteId, profileCode: r.g.profileCode });
}
