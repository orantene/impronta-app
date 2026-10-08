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

import { assertNotImpersonating } from "@/lib/impersonation/readonly-guard";
import { loadApplyDesignRow } from "@/lib/talent-site/theme-releases/release-design.server";
import type { TalentSiteCapability } from "@/lib/access/talent-membership";
import { isTalentThemeGalleryEnabled } from "@/lib/access/talent-theme-gallery";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { writeSiteDraft } from "@/lib/talent-site/history/writer";
import { applyTalentLiveMedia, treeHasLiveMediaCandidates } from "../live-media";
import { talentPlanAllowsThemeTier } from "../theme-catalog/tier";
import type { TalentThemeKind } from "../theme-catalog/types";
import { loadTalentLiveMedia } from "./load-live-media.server";
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
  const readOnly = await assertNotImpersonating();
  if (!readOnly.ok) return { ok: false, code: "not_owner", error: readOnly.error };
  const r = await ready("personalSiteEdit");
  if (!r.ok) return r;
  const loaded = await loadRowFor(r, "design", input?.designSlug);
  if (!loaded.ok) return loaded;
  const site = await ensureSiteId(r);
  if (!site.ok) return site;
  // F109: apply the version the gallery preview shows (newest released).
  const design = (await loadApplyDesignRow(r.admin, input.designSlug)) ?? loaded.row;
  return applyDesign(r.admin, {
    talentProfileId: r.g.talentProfileId,
    siteId: site.siteId,
    design,
    displayName: r.g.displayName,
    userId: r.g.userId,
  });
}

/** Apply a Look: merges its colour + font layer into the DRAFT site tokens. */
export async function applySiteLookAction(input: {
  lookSlug: string;
}): Promise<ThemeActionResult<{ lookSlug: string; draftTokens: Record<string, string> }>> {
  const readOnly = await assertNotImpersonating();
  if (!readOnly.ok) return { ok: false, code: "not_owner", error: readOnly.error };
  const r = await ready("personalSiteDesignPresets");
  if (!r.ok) return r;
  const loaded = await loadRowFor(r, "look", input?.lookSlug);
  if (!loaded.ok) return loaded;
  const site = await ensureSiteId(r);
  if (!site.ok) return site;
  return applyLook(r.admin, { siteId: site.siteId, look: loaded.row, userId: r.g.userId });
}

/**
 * Pull current profile photos into the EXISTING draft trees (hero / inset /
 * about). Never rebuilds from the catalog: section order, shell, copy, and
 * authored image overrides stay. Render-time live binds heal the public site
 * without this; the action updates the draft canvas the talent is editing.
 */
export async function refreshSiteContentFromProfileAction(): Promise<
  ThemeActionResult<{ designSlug: string; designVersion: number }>
> {
  const readOnly = await assertNotImpersonating();
  if (!readOnly.ok) return { ok: false, code: "not_owner", error: readOnly.error };
  const r = await ready("personalSiteEdit");
  if (!r.ok) return r;
  const site = await ensureSiteId(r);
  if (!site.ok) return site;

  const { data, error } = await r.admin
    .from("talent_sites")
    .select("theme_design_slug, theme_design_version, shell_tree, draft_rev")
    .eq("id", site.siteId)
    .maybeSingle();
  if (error) {
    logServerError("talentTheme.refreshFromProfile.read", error);
    return { ok: false, code: "server_error", error: "Could not refresh from your profile." };
  }
  const row = data as {
    theme_design_slug?: string | null;
    theme_design_version?: number | null;
    shell_tree?: unknown;
    draft_rev?: number | null;
  } | null;
  const designSlug = row?.theme_design_slug?.trim();
  if (!designSlug) {
    return { ok: false, code: "theme_not_found", error: "No design is applied yet." };
  }
  const designVersion = typeof row?.theme_design_version === "number" ? row.theme_design_version : 0;

  const { data: page, error: pageErr } = await r.admin
    .from("talent_pages")
    .select("blocks")
    .eq("talent_profile_id", r.g.talentProfileId)
    .eq("is_home", true)
    .maybeSingle();
  if (pageErr) {
    logServerError("talentTheme.refreshFromProfile.home", pageErr);
    return { ok: false, code: "server_error", error: "Could not refresh from your profile." };
  }
  const shellTree = (Array.isArray(row?.shell_tree) ? row!.shell_tree : []) as BuilderNode[];
  const homeTree = (Array.isArray((page as { blocks?: unknown } | null)?.blocks)
    ? (page as { blocks: BuilderNode[] }).blocks
    : []) as BuilderNode[];

  if (!treeHasLiveMediaCandidates([...shellTree, ...homeTree])) {
    return { ok: true, data: { designSlug, designVersion } };
  }

  const media = await loadTalentLiveMedia(r.g.talentProfileId);
  if (!media) {
    logServerError("talentTheme.refreshFromProfile.mediaMissing", {
      talentProfileId: r.g.talentProfileId,
    });
    return {
      ok: false,
      code: "server_error",
      error: "Could not load this talent's profile photos. Try again in a moment.",
    };
  }

  const nextShell = applyTalentLiveMedia(shellTree, media);
  const nextHome = applyTalentLiveMedia(homeTree, media);
  if (nextShell === shellTree && nextHome === homeTree) {
    return { ok: true, data: { designSlug, designVersion } };
  }

  const res = await writeSiteDraft(r.admin, {
    siteId: site.siteId,
    expectedDraftRev: typeof row?.draft_rev === "number" ? row.draft_rev : null,
    site: {
      shell_tree: nextShell,
      ...(r.g.userId ? { updated_by: r.g.userId } : {}),
    },
    pages: [{ home: true, patch: { blocks: nextHome } }],
    history: {
      kind: "edit",
      actor: "talent",
      summaryEn: "Refreshed photos from your profile",
      summaryEs: "Actualizaste las fotos desde tu perfil",
      createdBy: r.g.userId ?? null,
    },
  });
  if (!res.ok) {
    if (res.code === "conflict") return { ok: false, code: "conflict", error: res.error };
    if (res.code === "site_not_found") return { ok: false, code: "site_not_found", error: "Site not found." };
    if (res.code === "page_not_found") return { ok: false, code: "page_not_found", error: "Home page not found." };
    logServerError("talentTheme.refreshFromProfile.write", res.error);
    return { ok: false, code: "server_error", error: "Could not refresh from your profile." };
  }
  return { ok: true, data: { designSlug, designVersion } };
}

/** Publish the site theme: draft tokens go live (CAS on theme_version). */
export async function publishSiteThemeAction(): Promise<
  ThemeActionResult<{ themeVersion: number }>
> {
  const readOnly = await assertNotImpersonating();
  if (!readOnly.ok) return { ok: false, code: "not_owner", error: readOnly.error };
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
