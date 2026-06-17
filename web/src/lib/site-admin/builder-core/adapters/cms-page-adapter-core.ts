/**
 * CMS-page FREEFORM adapter — PURE FACTORY (no runtime imports).
 *
 * Wave 4.1. Mirrors `talent-page-adapter-core.ts`, keyed to `cms_pages` (the
 * agency storefront page table). It persists the
 * freeform `builderTree` to `cms_pages.blocks` and NEVER touches the legacy
 * `cms_page_sections` slot composition — so a freeform agency page edits exactly
 * like a talent/workspace page, but is surfaced through the dashboard "Pages"
 * list + the front-end `?edit=1` editor the operator already uses.
 *
 * GUARDRAIL: only pages with `cms_pages.is_freeform = true` are ever routed to
 * this adapter (see edit-chrome-mount + the `/p/` render). The homepage +
 * `__site_shell__` + `__directory__` + every pre-existing slot page stay on the
 * `homepageAdapter` (slot composition) — this adapter cannot affect them.
 *
 * --- TABLE CONTRACT ---
 * `cms_pages` (freeform subset): id, tenant_id, slug, title, status,
 *   blocks jsonb (the BuilderNode[] tree), is_freeform, version, published_at,
 *   updated_at. The freeform tree lives in `blocks`; `version` is the existing
 *   optimistic-concurrency token (we surface it as pageVersion). styleClasses
 *   are carried in `blocks`-adjacent theme is NOT used here (agency pages inherit
 *   the tenant theme); save passes styleClasses through but the action may ignore.
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

/** Minimal `cms_pages` row shape used by the freeform adapter. */
export interface CmsFreeformPageRow {
  id: string;
  slug: string;
  title: string;
  status: "draft" | "scheduled" | "published" | "archived";
  blocks: unknown;
  is_freeform: boolean;
  version: number | null;
  published_at: string | null;
  updated_at: string;
  /** STYLE-1 — site-scoped style-class registry (cms_pages.style_classes).
   *  Optional so a pre-migration read (column absent → undefined) degrades. */
  style_classes?: unknown;
  /** STYLE-1 — site-scoped style presets + clipboard (cms_pages.style_presets). */
  style_presets?: unknown;
}

/**
 * pageVersion = `updated_at` epoch seconds (matches the talent/workspace freeform
 * adapters). Every save advances `updated_at`, so the editor's compare-and-swap
 * guard sees a new version. The `version` column is the SLOT system's token and
 * is intentionally not used on the freeform path.
 */
function versionFromRow(row: CmsFreeformPageRow): number {
  return Math.floor(new Date(row.updated_at).getTime() / 1000);
}

/** Shape the adapter writes to `cms_pages` on save. */
export interface CmsFreeformPagePatch {
  blocks: unknown;
  updated_at: string;
  title?: string;
  /** STYLE-1 — serialized style-class registry (or null to clear); `undefined`
   *  means "leave the stored value untouched" (a save that didn't touch classes). */
  style_classes?: unknown;
  /** STYLE-1 — serialized presets envelope (or null to clear); `undefined` =
   *  leave untouched. */
  style_presets?: unknown;
}

/**
 * The action surface the cms-page freeform adapter needs. Injected so a spy test
 * can prove ZERO legacy (cms_page_sections) writes; production binds real DB ops.
 */
export interface CmsPageAdapterActions {
  /** Load the freeform cms_pages row by (locale, slug); tenant resolved
   *  server-side. Locale is REQUIRED for correct selection on multi-locale tenants. */
  loadPage: (input: { slug: string; locale?: string }) => Promise<CmsFreeformPageRow | null>;
  /** Persist blocks (+ optional title). NEVER touches cms_page_sections. */
  savePage: (input: {
    pageId: string;
    patch: CmsFreeformPagePatch;
  }) => Promise<{ ok: true; updatedAt: string } | { ok: false; error: string }>;
  /** Publish (status=published, published_at=now()). */
  publishPage: (input: {
    pageId: string;
  }) => Promise<{ ok: true; publishedAt: string; updatedAt: string } | { ok: false; error: string }>;
  /** Optional: restore a revision's blocks onto the live row. */
  restoreRevision?: (input: {
    pageId: string;
    revisionId: string;
  }) => Promise<{ ok: true; updatedAt: string } | { ok: false; error: string }>;
}

/** Minimal empty freeform composition for a cms page. Pure — no I/O. */
export function buildCmsFreeformComposition(
  row: CmsFreeformPageRow,
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
      // SEO-1 contract field (cms_pages already has the json_ld column;
      // the freeform empty-seed sets null — full reads stay on the homepage
      // metadata path).
      jsonLd: null,
    },
    slots: {},
    builderTree: (row.blocks as CompositionData["builderTree"]) ?? [],
    slotDefs: [],
    library: [],
    // STYLE-1 — site-scoped registries read from the dedicated columns. A
    // pre-migration row (column absent → undefined) degrades to the editor's
    // localStorage seed; coercion tolerates a malformed blob.
    styleClasses: coerceStyleClassRegistry(row.style_classes),
    stylePresets: coerceStylePresetRegistry(row.style_presets),
    availableLocales: [locale as CompositionData["locale"]],
  };
}

/** STYLE-1 — build the style-registry slice of a `cms_pages` patch from a save
 *  input, mapping `undefined` (untouched) vs. a registry (serialize). Shared by
 *  `save` and `saveDraft` so both legs persist classes/presets identically. */
function cmsStyleRegistryPatch(input: {
  styleClasses?: CompositionSaveInput["styleClasses"];
  stylePresets?: CompositionSaveInput["stylePresets"];
}): Pick<CmsFreeformPagePatch, "style_classes" | "style_presets"> {
  const patch: Pick<CmsFreeformPagePatch, "style_classes" | "style_presets"> = {};
  if (input.styleClasses !== undefined) {
    patch.style_classes = serializeStyleClassRegistry(input.styleClasses);
  }
  if (input.stylePresets !== undefined) {
    patch.style_presets = serializeStylePresetRegistry(input.stylePresets);
  }
  return patch;
}

/**
 * Build the cms-page freeform adapter over a given action surface.
 *
 * `BuilderSurfaceContext` mapping: `ctx.pageSlug` = the cms_pages slug being
 * edited; `ctx.locale` = the active locale. Mutations call
 * `assertNoLegacyBuilderWrite("cms_page", "cms_pages")` before any I/O.
 */
export function createCmsPageAdapter(
  actions: CmsPageAdapterActions,
  opts?: { assertNoLegacyWrite?: (table: string) => void },
): BuilderSurfaceAdapter {
  const guard =
    opts?.assertNoLegacyWrite ??
    ((table: string) => assertNoLegacyBuilderWrite("cms_page", table));

  return {
    kind: "cms_page",

    async load(ctx: BuilderSurfaceContext): Promise<CompositionLoadResult> {
      const slug = ctx.pageSlug ?? "";
      if (!slug) return { ok: false, error: "cms_page load: pageSlug is required." };
      const row = await actions.loadPage({ slug, locale: ctx.locale });
      if (!row) return { ok: false, error: "Could not open this page." };
      return { ok: true, data: buildCmsFreeformComposition(row, ctx.locale) };
    },

    async save(
      ctx: BuilderSurfaceContext,
      input: CompositionSaveInput,
    ): Promise<CompositionSaveResult> {
      guard("cms_pages");
      if (!input.pageId) {
        return { ok: false, error: "cms_page save: pageId is required." };
      }
      const result = await actions.savePage({
        pageId: input.pageId,
        patch: {
          blocks: input.builderTree ?? [],
          updated_at: new Date().toISOString(),
          title: input.metadata?.title,
          ...cmsStyleRegistryPatch(input),
        },
      });
      if (!result.ok) return { ok: false, error: result.error };
      return { ok: true, pageVersion: Math.floor(new Date(result.updatedAt).getTime() / 1000) };
    },

    async saveDraft(
      ctx: BuilderSurfaceContext,
      input: BuilderSurfaceSaveDraftInput,
    ): Promise<SaveDraftResult> {
      guard("cms_pages");
      if (!ctx.pageSlug) {
        return { ok: false, error: "cms_page saveDraft: pageSlug is required." };
      }
      const row = await actions.loadPage({ slug: ctx.pageSlug, locale: ctx.locale });
      if (!row) return { ok: false, error: "Page not found for saveDraft." };
      const result = await actions.savePage({
        pageId: row.id,
        patch: {
          blocks: input.builderTree ?? [],
          updated_at: new Date().toISOString(),
          title: input.metadata?.title,
          ...cmsStyleRegistryPatch(input),
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
      guard("cms_pages");
      if (!ctx.pageSlug) {
        return { ok: false, error: "cms_page publish: pageSlug is required." };
      }
      const row = await actions.loadPage({ slug: ctx.pageSlug, locale: ctx.locale });
      if (!row) return { ok: false, error: "Page not found for publish." };
      const result = await actions.publishPage({ pageId: row.id });
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
            guard("cms_pages");
            if (!ctx.pageSlug) {
              return { ok: false, error: "cms_page restoreRevision: pageSlug is required." };
            }
            const row = await actions.loadPage({ slug: ctx.pageSlug, locale: ctx.locale });
            if (!row) return { ok: false, error: "Page not found for restoreRevision." };
            const result = await actions.restoreRevision!({
              pageId: row.id,
              revisionId: input.revisionId,
            });
            if (!result.ok) return { ok: false, error: result.error };
            return { ok: true, pageVersion: Math.floor(new Date(result.updatedAt).getTime() / 1000) };
          },
        }
      : {}),
  };
}
