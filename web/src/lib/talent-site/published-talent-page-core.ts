/**
 * Published talent_page loader — PURE CORE (no runtime imports at module load).
 *
 * Resolves a PUBLISHED `talent_pages` row for the public renderer at
 * `/t/[profileCode]/[pageSlug]`. The pure factory pattern (only `import type`
 * at module load) lets the unit test drive `resolvePublishedTalentPage` with a
 * fake fetcher and prove the resolution rules without pulling in the Supabase /
 * Next.js server graph:
 *
 *   a) a missing profile / missing page → null (404 upstream),
 *   b) a non-`published` row → null (anon RLS would already hide it; we ALSO
 *      gate in code so an owner-scoped fetch can't leak a draft),
 *   c) a published row → the normalized render payload (blocks + theme +
 *      managing tenantId for the section-embed render context).
 *
 * The managing tenant (`tenantId`) is `talent_profiles.created_by_agency_id` —
 * the agency that owns the profile. Curated `section_embed` nodes inside the
 * page render scoped to THAT tenant + `previewSubject: { kind:"talent", id }`,
 * so connected sections hydrate from the talent (not the host tenant).
 */

import type { BuilderNodeTree } from "@/lib/site-admin/builder-node/types";
import type { BuilderStyleClassRegistry } from "@/lib/site-admin/builder-node/style-classes";
import type { ComponentStyleDefaults } from "@/lib/site-admin/builder-node/component-style-defaults";
import {
  readTalentDesignSlice,
  readTalentStyleClasses,
} from "@/lib/site-admin/edit-mode/talent-design-store";
import {
  buildTalentPageSeo,
  type TalentPageSeoEnvelope,
} from "./talent-page-seo";

/** Minimal `talent_pages` row the loader reads for a public render. */
export interface PublishedTalentPageRow {
  id: string;
  talent_profile_id: string;
  slug: string;
  title: string;
  status: "draft" | "scheduled" | "published";
  blocks: unknown;
  theme: unknown;
  published_at: string | null;
  // SEO-1/SEO-3 `talent_pages` columns. All nullable + optional so a read from
  // a pre-migration row (or a caller that does not select them) degrades to
  // "no overrides" instead of throwing.
  meta_title?: string | null;
  meta_description?: string | null;
  og_title?: string | null;
  og_description?: string | null;
  og_image_url?: string | null;
  canonical_url?: string | null;
  noindex?: boolean | null;
  json_ld?: unknown;
}

/** The resolved talent + page handle the public renderer needs. */
export interface ResolvedTalentProfileRef {
  /** `talent_profiles.id` (uuid) — used as the section-embed preview subject. */
  id: string;
  /** `talent_profiles.created_by_agency_id` — the managing agency tenant. May be null. */
  managingTenantId: string | null;
  /** Display name for the document title fallback. */
  displayName: string | null;
  /** `talent_profiles.talent_plan_key` — gates the Portfolio-only SEO controls. */
  talentPlanKey?: string | null;
}

/** Normalized render payload for `/t/[profileCode]/[pageSlug]`. */
export interface PublishedTalentPageRenderData {
  pageId: string;
  /** `talent_profiles.id` — section-embed preview subject id. */
  talentProfileId: string;
  /** Managing agency tenant id — section-embed render-context tenant. */
  tenantId: string | null;
  title: string;
  blocks: BuilderNodeTree;
  /** Page-scoped linked style-class registry (persisted in `talent_pages.theme`,
   *  every top-level key EXCEPT the reserved `__design` slice). */
  theme: BuilderStyleClassRegistry;
  /** Talent-scoped LIVE design tokens (from `talent_pages.theme.__design.tokens`).
   *  Empty `{}` when the talent has never themed their page → the page inherits
   *  the host tenant's tokens from `<html>`. */
  designTokens: Record<string, string>;
  /** Talent-scoped LIVE per-component-type default styles
   *  (`talent_pages.theme.__design.componentStyles`). Empty when unset. */
  componentStyleDefaults: ComponentStyleDefaults;
  /**
   * `<head>` envelope for this page, built from the `talent_pages` SEO columns
   * and GATED on the Portfolio (Max) tier. Structurally a `MaxSiteSeo`, so the
   * route feeds it to the shared `maxSiteSeoToMetadata` mapper. For a
   * non-Portfolio talent this collapses to `{ title, noindex:false }`.
   */
  seo: TalentPageSeoEnvelope;
}

/**
 * Fetcher surface injected by the production binding. Both reads use the public
 * anon client; anon RLS already restricts `talent_pages` to `status='published'`
 * and `talent_profiles` to non-deleted public rows.
 */
export interface PublishedTalentPageActions {
  /** Resolve a talent by its public `profile_code`. Returns null when absent. */
  loadTalentByProfileCode: (
    profileCode: string,
  ) => Promise<ResolvedTalentProfileRef | null>;
  /** Load the talent_pages row by (talentProfileId, slug). Returns null when absent. */
  loadTalentPage: (input: {
    talentProfileId: string;
    slug: string;
  }) => Promise<PublishedTalentPageRow | null>;
}

/**
 * Coerce a persisted `blocks` jsonb into a `BuilderNodeTree`. The column is a
 * JSON array of builder nodes; anything else (null / object / string) degrades
 * to an empty tree so the renderer paints nothing rather than throwing.
 */
export function coerceBuilderTree(blocks: unknown): BuilderNodeTree {
  return Array.isArray(blocks) ? (blocks as BuilderNodeTree) : [];
}

/**
 * Coerce a persisted `theme` jsonb into the page-scoped style-class registry.
 * The content adapter writes the style classes as top-level keys on
 * `talent_pages.theme`; the talent THEME slice lives under the reserved
 * `__design` key and is stripped here (it is NOT a style class). Anything that
 * is not a plain object degrades to an empty registry so the renderer resolves
 * each node to its own style by identity.
 */
export function coerceTheme(theme: unknown): BuilderStyleClassRegistry {
  return readTalentStyleClasses(theme) as BuilderStyleClassRegistry;
}

/**
 * Resolve a published talent page for the public renderer. Pure — all I/O is
 * injected via `actions`. Returns null when:
 *   - the profile code resolves to no talent,
 *   - no page exists for (talent, slug), or
 *   - the page is not `published` (defense-in-depth beyond anon RLS).
 */
export async function resolvePublishedTalentPage(
  actions: PublishedTalentPageActions,
  input: {
    profileCode: string;
    slug: string;
    /** Absolute origin serving this page — feeds the default canonical URL. */
    canonicalOrigin?: string;
    /** Origin-relative path of this page — feeds the default canonical URL. */
    canonicalPath?: string;
  },
): Promise<PublishedTalentPageRenderData | null> {
  const talent = await actions.loadTalentByProfileCode(input.profileCode);
  if (!talent) return null;

  const row = await actions.loadTalentPage({
    talentProfileId: talent.id,
    slug: input.slug,
  });
  if (!row) return null;

  // Defense-in-depth: anon RLS already hides non-published rows, but the loader
  // ALSO refuses anything that is not published so a (future) owner-scoped read
  // path can never leak a draft through this public renderer.
  if (row.status !== "published") return null;

  const designSlice = readTalentDesignSlice(row.theme);
  return {
    pageId: row.id,
    talentProfileId: talent.id,
    tenantId: talent.managingTenantId,
    title: row.title,
    blocks: coerceBuilderTree(row.blocks),
    theme: coerceTheme(row.theme),
    designTokens: designSlice.tokens,
    componentStyleDefaults: designSlice.componentStyles,
    seo: buildTalentPageSeo({
      page: {
        title: row.title,
        metaTitle: row.meta_title ?? null,
        metaDescription: row.meta_description ?? null,
        ogTitle: row.og_title ?? null,
        ogDescription: row.og_description ?? null,
        ogImageUrl: row.og_image_url ?? null,
        canonicalUrl: row.canonical_url ?? null,
        noindex: row.noindex ?? null,
        jsonLd: row.json_ld ?? null,
      },
      planKey: talent.talentPlanKey ?? null,
      fallbackTitle: talent.displayName ?? "",
      canonicalOrigin: input.canonicalOrigin,
      canonicalPath: input.canonicalPath,
    }),
  };
}
