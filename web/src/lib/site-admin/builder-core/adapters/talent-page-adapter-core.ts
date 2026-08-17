/**
 * Talent-page adapter — PURE FACTORY (no runtime imports).
 *
 * Mirrors `cms-page-adapter-core.ts` exactly, keyed to `talent_pages`
 * instead of `cms_pages`. The pure factory pattern (only `import type`
 * at module load) lets `talent-page-adapter.test.ts` drive it under a bare
 * `tsx --test` run with spy actions and prove:
 *
 *   a) NEVER calls any cms_page_sections / homepage action,
 *   b) ALWAYS calls `assertNoLegacyBuilderWrite("talent_page", …)` on
 *      every mutation, and
 *   c) persists exclusively to `talent_pages.blocks`.
 *
 * Plan/tier gating is ENFORCED SERVER-SIDE:
 *   - Only talent_profile_id owners + their workspace staff may call save/publish
 *     (RLS in the migration).
 *   - `required_talent_tier` is stored on the `talent_pages` row and must be
 *     checked by the calling action before persisting (the adapter passes
 *     `talentTier` through from `BuilderSurfaceContext`).
 *
 * --- TABLE CONTRACT ---
 * `talent_pages` shape (from 20260611174629_talent_pages.sql):
 *   id, talent_profile_id, slug, title, status, blocks jsonb, theme jsonb,
 *   required_talent_tier, published_at, scheduled_for,
 *   created_by, created_at, updated_at,
 *   plus the SEO-1 metadata columns (20261100000000_talent_pages_seo_columns.sql):
 *   meta_description, og_title, og_description, og_image_url, canonical_url,
 *   noindex, json_ld.
 *
 * SEO-2 already READS that column set on the public side — `loadMaxSitePages`
 * selects all seven and `maxSiteSeoToMetadata` renders them into <head> for all
 * three talent-site routes. Only the WRITE half was missing: the composition
 * hardcoded nulls and `save`/`saveDraft` dropped everything but `title`, so the
 * Page settings drawer's SEO fields were a silent no-op on this surface (the
 * same defect fixed for freeform `cms_pages` in PR #1210).
 *
 * NO `meta_title` COLUMN: unlike `cms_pages`, the SEO-1 migration deliberately
 * omits `meta_title` — the talent-site SEO envelope (`MaxSiteSeo`) uses `title`
 * as the SERP/tab title and `og_title` as the only override. So the drawer's
 * "Meta title" field has nothing to persist to here and stays null by design;
 * wiring it would mean a new column PLUS widening the shared SEO envelope that
 * all three talent-site routes consume in lockstep.
 *
 * The adapter stores the freeform `builderTree` in the `blocks` column.
 * The `theme` column carries `styleClasses`. VERSION is derived from
 * `updated_at` (epoch seconds), matching the cms_page adapter.
 */

import type {
  CompositionData,
  CompositionLoadResult,
  CompositionSaveInput,
  CompositionSaveResult,
  SaveDraftResult,
  PublishResult,
} from "@/lib/site-admin/edit-mode/composition-actions";
import type { RevisionRestoreResult } from "@/lib/site-admin/edit-mode/revisions-actions";

import type {
  BuilderSurfaceAdapter,
  BuilderSurfaceContext,
  BuilderSurfacePublishInput,
  BuilderSurfaceSaveDraftInput,
  BuilderSurfaceRestoreInput,
} from "../surface-adapter";
import { assertNoLegacyBuilderWrite } from "../legacy-write-guard";
import {
  coerceStyleClassRegistry,
  coerceStylePresetRegistry,
  serializeStyleClassRegistry,
  serializeStylePresetRegistry,
} from "@/lib/site-admin/builder-node/style-registry-coerce";

// ── Row shape ────────────────────────────────────────────────────────────────

/** Minimal `talent_pages` row shape used by the adapter. */
export interface TalentPageRow {
  id: string;
  talent_profile_id: string;
  slug: string;
  title: string;
  status: "draft" | "scheduled" | "published";
  blocks: unknown;
  theme: unknown;
  required_talent_tier: string | null;
  published_at: string | null;
  updated_at: string;
  /** SEO-1 — the `talent_pages` metadata/OG columns, the same set the public
   *  `loadMaxSitePages` read selects. Optional on the row type so a spy/test
   *  fixture (or a partial select) degrades to the null defaults instead of
   *  throwing. There is deliberately no `meta_title` — see the header note. */
  meta_description?: string | null;
  og_title?: string | null;
  og_description?: string | null;
  og_image_url?: string | null;
  canonical_url?: string | null;
  noindex?: boolean | null;
  json_ld?: unknown;
  /** STYLE-1 — dedicated style-class registry column (supersedes the slice in
   *  `theme`). Optional so a pre-migration row degrades to the `theme` fallback. */
  style_classes?: unknown;
  /** STYLE-1 — site-scoped presets envelope. */
  style_presets?: unknown;
}

/** Derive a monotonic version from `updated_at` (epoch seconds). */
function versionFromRow(row: TalentPageRow): number {
  return Math.floor(new Date(row.updated_at).getTime() / 1000);
}

/** Shape the adapter writes to `talent_pages` on save. */
export interface TalentPagePatch {
  blocks: unknown;
  theme: unknown;
  updated_at: string;
  title?: string;
  /** SEO-1 — metadata/OG columns. `undefined` means "leave the stored value
   *  untouched" (a tree-only autosave carries no metadata envelope); `null`
   *  clears the column. */
  meta_description?: string | null;
  og_title?: string | null;
  og_description?: string | null;
  og_image_url?: string | null;
  canonical_url?: string | null;
  noindex?: boolean | null;
  json_ld?: unknown;
  /** STYLE-1 — serialized style-class registry for the dedicated column
   *  (`undefined` = leave untouched, `null` = clear). The binding ALSO keeps
   *  `theme` carrying the registry for back-compat reads during the cutover. */
  style_classes?: unknown;
  /** STYLE-1 — serialized presets envelope (`undefined` = untouched). */
  style_presets?: unknown;
}

// ── Action surface injected by the production binding ────────────────────────

/**
 * The exact action surface the talent-page adapter needs. Injected so the
 * spy test can prove ZERO legacy writes with fakes; production binds real DB actions.
 */
export interface TalentPageAdapterActions {
  /**
   * Load the talent_pages row by (talentProfileId, slug).
   * `talentProfileId` = the `talent_profiles.id` for this talent.
   */
  loadPage: (input: {
    talentProfileId: string;
    slug: string;
  }) => Promise<TalentPageRow | null>;

  /**
   * Persist a mutation. The adapter calls
   * `assertNoLegacyBuilderWrite("talent_page", "talent_pages")` BEFORE calling
   * this. The action writes ONLY `talent_pages.blocks` + `talent_pages.theme` +
   * `updated_at`. NEVER touches `cms_page_sections`.
   */
  savePage: (input: {
    talentProfileId: string;
    pageId: string;
    patch: TalentPagePatch;
  }) => Promise<{ ok: true; updatedAt: string } | { ok: false; error: string }>;

  /**
   * Publish the page (status=published, published_at=now()). The adapter calls
   * `assertNoLegacyBuilderWrite("talent_page", "talent_pages")` first.
   */
  publishPage: (input: {
    talentProfileId: string;
    pageId: string;
  }) => Promise<{ ok: true; publishedAt: string; updatedAt: string } | { ok: false; error: string }>;

  /**
   * Return the existing talent_pages row for (talentProfileId, slug); if none,
   * INSERT a draft row (status='draft', blocks=[], theme={}) and return it.
   * Returns null only on hard failure / RLS denial.
   */
  ensurePage: (input: {
    talentProfileId: string;
    slug: string;
  }) => Promise<TalentPageRow | null>;

  /**
   * Restore a revision's blocks+theme onto the live row. Optional.
   */
  restoreRevision?: (input: {
    talentProfileId: string;
    pageId: string;
    revisionId: string;
  }) => Promise<{ ok: true; updatedAt: string } | { ok: false; error: string }>;
}

// ── buildEmptyTalentPageComposition ─────────────────────────────────────────

/**
 * A minimal empty freeform composition for a talent page. Pure — no I/O.
 * Context: `pageId` carries `talentProfileId` (what the adapter keys off);
 * `pageSlug` is the talent page slug.
 */
export function buildEmptyTalentPageComposition(
  row: TalentPageRow,
  locale: string,
): CompositionData {
  return {
    locale: locale as CompositionData["locale"],
    pageId: row.id,
    pageVersion: versionFromRow(row),
    liveSitePublishedAt: row.published_at,
    metadata: {
      title: row.title,
      // SEO-1 — read the REAL stored values. These were hardcoded to null, so
      // the Page settings drawer opened blank and every SEO edit round-tripped
      // back to nothing, even though the public renderer reads these columns.
      // `metaTitle` stays null: `talent_pages` has no such column (the
      // talent-site SEO envelope uses `title`). `introTagline` stays null: it
      // is homepage-only (it lives in the homepage row's `hero` JSON).
      metaTitle: null,
      metaDescription: row.meta_description ?? null,
      introTagline: null,
      ogTitle: row.og_title ?? null,
      ogDescription: row.og_description ?? null,
      ogImageUrl: row.og_image_url ?? null,
      canonicalUrl: row.canonical_url ?? null,
      noindex: row.noindex ?? false,
      jsonLd: row.json_ld ?? null,
    },
    slots: {},
    builderTree: (row.blocks as CompositionData["builderTree"]) ?? [],
    slotDefs: [],
    library: [],
    // STYLE-1 — prefer the dedicated `style_classes` column; fall back to the
    // legacy `theme` slice for pre-migration rows (coercion tolerates both the
    // registry-map and bare-array shapes, and a malformed/absent value → undefined).
    styleClasses:
      coerceStyleClassRegistry(row.style_classes) ??
      coerceStyleClassRegistry(row.theme),
    stylePresets: coerceStylePresetRegistry(row.style_presets),
    availableLocales: [locale as CompositionData["locale"]],
  };
}

/**
 * SEO-1 — build the metadata slice of a `talent_pages` patch from a save input.
 *
 * WIPE HAZARD: a tree-only autosave / draft-flush carries NO metadata envelope.
 * Mapping unconditionally (`metadata?.metaDescription ?? null`) would NULL every
 * SEO column on every autosave — and on this surface those columns are LIVE on
 * the public site, so the wipe would be visible in search results. So:
 *   - `metadata` absent  → returns `{}` (the columns stay out of the patch), and
 *   - an individual field that is `undefined` is likewise omitted; only an
 *     explicit `null` clears the column.
 * Shared by `save` and `saveDraft` so both legs persist metadata identically.
 *
 * `metaTitle` is intentionally NOT mapped: `talent_pages` has no `meta_title`
 * column (see the module header).
 */
function talentMetadataPatch(
  metadata: CompositionSaveInput["metadata"] | undefined,
): Omit<TalentPagePatch, "blocks" | "theme" | "updated_at"> {
  if (!metadata) return {};
  const patch: Omit<TalentPagePatch, "blocks" | "theme" | "updated_at"> = {};
  if (metadata.metaDescription !== undefined) {
    patch.meta_description = metadata.metaDescription;
  }
  if (metadata.ogTitle !== undefined) patch.og_title = metadata.ogTitle;
  if (metadata.ogDescription !== undefined) {
    patch.og_description = metadata.ogDescription;
  }
  if (metadata.ogImageUrl !== undefined) patch.og_image_url = metadata.ogImageUrl;
  if (metadata.canonicalUrl !== undefined) patch.canonical_url = metadata.canonicalUrl;
  if (metadata.noindex !== undefined) patch.noindex = metadata.noindex;
  if (metadata.jsonLd !== undefined) patch.json_ld = metadata.jsonLd;
  return patch;
}

/** STYLE-1 — build the style-registry slice of a `talent_pages` patch from a
 *  save input. Threads `theme` (back-compat) AND the dedicated columns. */
function talentStyleRegistryPatch(input: {
  styleClasses?: CompositionSaveInput["styleClasses"];
  stylePresets?: CompositionSaveInput["stylePresets"];
}): Pick<TalentPagePatch, "theme" | "style_classes" | "style_presets"> {
  const patch: Pick<TalentPagePatch, "theme" | "style_classes" | "style_presets"> = {
    // Keep `theme` carrying the class registry so a not-yet-migrated read path
    // (or a row read before the dedicated column existed) still resolves classes.
    theme: input.styleClasses ?? {},
  };
  if (input.styleClasses !== undefined) {
    patch.style_classes = serializeStyleClassRegistry(input.styleClasses);
  }
  if (input.stylePresets !== undefined) {
    patch.style_presets = serializeStylePresetRegistry(input.stylePresets);
  }
  return patch;
}

// ── createTalentPageAdapter ──────────────────────────────────────────────────

/**
 * Build the talent_page adapter over a given action surface.
 *
 * `BuilderSurfaceContext` mapping for this surface:
 *   - `ctx.pageId` = `talent_profiles.id` (the talent's profile row id).
 *   - `ctx.pageSlug` = the `talent_pages.slug` being edited.
 *   - `ctx.locale` = the active locale.
 *
 * Mutations call `assertNoLegacyBuilderWrite("talent_page", "talent_pages")`
 * before any I/O — hard runtime backstop (§F.1).
 */
export function createTalentPageAdapter(
  actions: TalentPageAdapterActions,
  opts?: {
    /** Injected guard for tests — defaults to the real `assertNoLegacyBuilderWrite`. */
    assertNoLegacyWrite?: (table: string) => void;
    /** Talent profile id to scope DB queries (talent_pages.talent_profile_id).
     *  When omitted the adapter tries ctx.pageId on first load.
     *  The TalentMaxBuilderMount creates one adapter per talent. */
    talentProfileId?: string;
  },
): BuilderSurfaceAdapter {
  const guard =
    opts?.assertNoLegacyWrite ??
    ((table: string) => assertNoLegacyBuilderWrite("talent_page", table));

  const capturedTalentProfileId = opts?.talentProfileId ?? "";

  return {
    kind: "talent_page",

    async load(ctx: BuilderSurfaceContext): Promise<CompositionLoadResult> {
      const talentProfileId = capturedTalentProfileId || ctx.pageId || "";
      const slug = ctx.pageSlug ?? "index";

      const row = await actions.ensurePage({ talentProfileId, slug });
      if (!row) {
        return {
          ok: false,
          error: `Could not open or create your page.`,
        };
      }
      return { ok: true, data: buildEmptyTalentPageComposition(row, ctx.locale) };
    },

    async save(
      ctx: BuilderSurfaceContext,
      input: CompositionSaveInput,
    ): Promise<CompositionSaveResult> {
      // §F.1 — runtime guard: talent_page must NEVER write cms_page_sections.
      guard("talent_pages");

      const talentProfileId = capturedTalentProfileId || "";
      if (!input.pageId) {
        return { ok: false, error: "talent_page save: pageId is required." };
      }

      const result = await actions.savePage({
        talentProfileId,
        pageId: input.pageId,
        patch: {
          blocks: input.builderTree ?? [],
          updated_at: new Date().toISOString(),
          title: input.metadata?.title,
          ...talentMetadataPatch(input.metadata),
          ...talentStyleRegistryPatch(input),
        },
      });
      if (!result.ok) return { ok: false, error: result.error };
      return {
        ok: true,
        pageVersion: Math.floor(new Date(result.updatedAt).getTime() / 1000),
      };
    },

    async saveDraft(
      ctx: BuilderSurfaceContext,
      input: BuilderSurfaceSaveDraftInput,
    ): Promise<SaveDraftResult> {
      guard("talent_pages");

      const talentProfileId = capturedTalentProfileId || "";
      if (!ctx.pageSlug) {
        return { ok: false, error: "talent_page saveDraft: pageSlug is required." };
      }

      const row = await actions.loadPage({ talentProfileId, slug: ctx.pageSlug });
      if (!row) {
        return { ok: false, error: "Talent page not found for saveDraft." };
      }

      const result = await actions.savePage({
        talentProfileId,
        pageId: row.id,
        patch: {
          blocks: input.builderTree ?? [],
          updated_at: new Date().toISOString(),
          title: input.metadata?.title,
          ...talentMetadataPatch(input.metadata),
          ...talentStyleRegistryPatch(input),
        },
      });
      if (!result.ok) return { ok: false, error: result.error };
      return {
        ok: true,
        pageVersion: Math.floor(new Date(result.updatedAt).getTime() / 1000),
        savedAt: result.updatedAt,
      };
    },

    async publish(
      ctx: BuilderSurfaceContext,
      _input: BuilderSurfacePublishInput,
    ): Promise<PublishResult> {
      guard("talent_pages");

      const talentProfileId = capturedTalentProfileId || "";
      if (!ctx.pageSlug) {
        return { ok: false, error: "talent_page publish: pageSlug is required." };
      }

      const row = await actions.loadPage({ talentProfileId, slug: ctx.pageSlug });
      if (!row) {
        return { ok: false, error: "Talent page not found for publish." };
      }

      const result = await actions.publishPage({ talentProfileId, pageId: row.id });
      if (!result.ok) return { ok: false, error: result.error };
      return {
        ok: true,
        pageVersion: Math.floor(new Date(result.updatedAt).getTime() / 1000),
        publishedAt: result.publishedAt,
      };
    },

    ...(actions.restoreRevision
      ? {
          async restoreRevision(
            ctx: BuilderSurfaceContext,
            input: BuilderSurfaceRestoreInput,
          ): Promise<RevisionRestoreResult> {
            guard("talent_pages");

            const talentProfileId = capturedTalentProfileId || "";
            if (!ctx.pageSlug) {
              return {
                ok: false,
                error: "talent_page restoreRevision: pageSlug is required.",
              };
            }

            const row = await actions.loadPage({
              talentProfileId,
              slug: ctx.pageSlug,
            });
            if (!row) {
              return { ok: false, error: "Talent page not found for restoreRevision." };
            }

            const result = await actions.restoreRevision!({
              talentProfileId,
              pageId: row.id,
              revisionId: input.revisionId,
            });
            if (!result.ok) return { ok: false, error: result.error };
            return {
              ok: true,
              pageVersion: Math.floor(new Date(result.updatedAt).getTime() / 1000),
            };
          },
        }
      : {}),
  };
}
