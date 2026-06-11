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
}

/** The resolved talent + page handle the public renderer needs. */
export interface ResolvedTalentProfileRef {
  /** `talent_profiles.id` (uuid) — used as the section-embed preview subject. */
  id: string;
  /** `talent_profiles.created_by_agency_id` — the managing agency tenant. May be null. */
  managingTenantId: string | null;
  /** Display name for the document title fallback. */
  displayName: string | null;
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
  /** Page-scoped linked style-class registry (persisted in `talent_pages.theme`). */
  theme: BuilderStyleClassRegistry;
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
 * The adapter writes `talent_pages.theme = styleClasses`; anything that is not a
 * plain object (array / null / string) degrades to an empty registry so the
 * renderer resolves each node to its own style by identity.
 */
export function coerceTheme(theme: unknown): BuilderStyleClassRegistry {
  return theme && typeof theme === "object" && !Array.isArray(theme)
    ? (theme as BuilderStyleClassRegistry)
    : {};
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
  input: { profileCode: string; slug: string },
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

  return {
    pageId: row.id,
    talentProfileId: talent.id,
    tenantId: talent.managingTenantId,
    title: row.title,
    blocks: coerceBuilderTree(row.blocks),
    theme: coerceTheme(row.theme),
  };
}
