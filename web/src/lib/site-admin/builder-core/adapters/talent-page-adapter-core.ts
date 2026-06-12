/**
 * Talent-page adapter — PURE FACTORY (no runtime imports).
 *
 * Mirrors `workspace-page-adapter-core.ts` exactly, keyed to `talent_pages`
 * instead of `workspace_pages`. The pure factory pattern (only `import type`
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
 *   created_by, created_at, updated_at.
 *
 * The adapter stores the freeform `builderTree` in the `blocks` column.
 * The `theme` column carries `styleClasses`. VERSION is derived from
 * `updated_at` (epoch seconds), matching the workspace_page adapter.
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
      metaTitle: null,
      metaDescription: null,
      introTagline: null,
      ogTitle: null,
      ogDescription: null,
      ogImageUrl: null,
      canonicalUrl: null,
      noindex: false,
    },
    slots: {},
    builderTree: (row.blocks as CompositionData["builderTree"]) ?? [],
    slotDefs: [],
    library: [],
    styleClasses: (row.theme as CompositionData["styleClasses"]) ?? undefined,
    availableLocales: [locale as CompositionData["locale"]],
  };
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
          theme: input.styleClasses ?? {},
          updated_at: new Date().toISOString(),
          title: input.metadata?.title,
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
          theme: input.styleClasses ?? {},
          updated_at: new Date().toISOString(),
          title: input.metadata?.title,
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
