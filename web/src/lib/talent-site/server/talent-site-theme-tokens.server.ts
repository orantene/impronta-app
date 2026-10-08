import "server-only";

import { isTalentThemeGalleryEnabled } from "@/lib/access/talent-theme-gallery";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import type { ComponentStyleDefaults } from "@/lib/site-admin/builder-node/component-style-defaults";
import { designComponentStyleDefaults } from "@/lib/talent-site/theme-catalog/collection/design-token-defaults";
import { summaryFor } from "@/lib/talent-site/history/copy";
import { writeSiteDraft } from "@/lib/talent-site/history/writer";

/**
 * SITE-level theme tokens for the talent page builder's Design panel (Brand +
 * Theme tabs). A talent's theme lives on her SITE (`talent_sites.design_tokens`
 * / `design_tokens_draft`, where the Design + Look gallery writes it), so an
 * edit in the builder restyles every page and goes live with "Publish site"
 * (`publishSiteThemeForTalent`). The Design is only the starting value: every
 * token stays editable.
 *
 * Callers own auth: `talentProfileId` must be the SIGNED-IN talent's own id
 * (resolved from the session, never from the client). Writes use the service
 * role, scoped by that id.
 *
 * With TALENT_THEME_GALLERY_ENABLED off the live render ignores site tokens,
 * so `siteThemeMode()` is false and callers keep the legacy page-scoped path.
 */

export function siteThemeMode(): boolean {
  return isTalentThemeGalleryEnabled();
}

export interface TalentSiteThemeState {
  draft: Record<string, string>;
  live: Record<string, string>;
  designSlug: string | null;
  lookSlug: string | null;
}

function coerceTokens(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "string" && v.length > 0) out[k] = v;
  }
  return out;
}

/** The site's draft + live tokens and Design slug. Null when there is no site. */
export async function loadTalentSiteThemeState(
  talentProfileId: string,
): Promise<TalentSiteThemeState | null> {
  const admin = createServiceRoleClient();
  if (!admin) return null;
  const { data, error } = await admin
    .from("talent_sites")
    .select("design_tokens, design_tokens_draft, theme_design_slug, theme_look_slug")
    .eq("talent_profile_id", talentProfileId)
    .maybeSingle();
  if (error) {
    logServerError("talentSiteTheme.load", error);
    return null;
  }
  if (!data) return null;
  const row = data as {
    design_tokens: unknown;
    design_tokens_draft: unknown;
    theme_design_slug: string | null;
    theme_look_slug: string | null;
  };
  return {
    draft: coerceTokens(row.design_tokens_draft),
    live: coerceTokens(row.design_tokens),
    designSlug: row.theme_design_slug?.trim() || null,
    lookSlug: row.theme_look_slug?.trim() || null,
  };
}

export type SiteDraftTokensWrite =
  | { ok: true; draftRev: number | null }
  | { ok: false; conflict: boolean };

/**
 * Replace the site's DRAFT tokens (validated by the caller). Theme releases
 * Phase 2: one atomic write (CAS on draft_rev when `expectedDraftRev` is sent)
 * plus a colours history entry batched per 60 s.
 */
export async function writeTalentSiteDraftTokens(
  talentProfileId: string,
  tokens: Record<string, string>,
  opts: { expectedDraftRev?: number | null } = {},
): Promise<SiteDraftTokensWrite> {
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, conflict: false };
  const { data, error } = await admin
    .from("talent_sites")
    .select("id")
    .eq("talent_profile_id", talentProfileId)
    .maybeSingle();
  if (error || !data) {
    if (error) logServerError("talentSiteTheme.writeDraft.site", error);
    return { ok: false, conflict: false };
  }
  const summary = summaryFor("colors");
  const res = await writeSiteDraft(admin, {
    siteId: (data as { id: string }).id,
    expectedDraftRev: opts.expectedDraftRev ?? null,
    site: { design_tokens_draft: tokens },
    history: { kind: "colors", summaryEn: summary.en, summaryEs: summary.es },
  });
  if (res.ok) return { ok: true, draftRev: res.draftRev };
  if (res.code !== "conflict") logServerError("talentSiteTheme.writeDraft", res.error);
  return { ok: false, conflict: res.code === "conflict" };
}

/** The Design's own component defaults (e.g. accent pill buttons), or the platform's. */
export function siteDesignComponentStyles(
  designSlug: string | null,
  platformStyles: ComponentStyleDefaults,
): ComponentStyleDefaults {
  return designComponentStyleDefaults(designSlug, platformStyles);
}
