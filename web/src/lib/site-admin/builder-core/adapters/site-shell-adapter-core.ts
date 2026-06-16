/**
 * site_shell FREEFORM adapter — PURE FACTORY (no runtime imports).
 *
 * Builder Studio WS-A A1. Mirrors `cms-page-adapter-core.ts`, keyed to the
 * tenant's DORMANT `site_shell` `cms_pages` row (the shared HEADER + FOOTER).
 * It edits the shell as a freeform `builderTree` and persists that tree to the
 * shell row's `blocks` column — a draft holding spot the dormant slot/snapshot
 * path never reads. It NEVER touches the legacy `cms_page_sections` slot
 * composition, so the dormant `PublishedShell` snapshot system is untouched
 * until an explicit Publish.
 *
 * GUARDRAIL: this adapter is reached ONLY behind `site-shell-flag.ts` (OFF by
 * default). With the flag off NOTHING routes here and the live header/footer
 * render through the legacy `PublicHeader` path exactly as before. Mutations
 * call `assertNoLegacyBuilderWrite("site_shell", "cms_pages")` before any I/O.
 *
 * --- WHAT THE SHELL ROW LOOKS LIKE (dormant system, see site-shell-backfill) ---
 * One system-owned `cms_pages` row per (tenant, locale):
 *   • `system_template_key = 'site_shell'`, `slug = '__site_shell__'`,
 *     `is_system_owned = true`.
 *   • Composition lives in `cms_page_sections` (slot_key `header` / `footer`)
 *     AND is baked into `cms_pages.published_page_snapshot` (a HomepageSnapshot
 *     whose `slots[]` carry the header/footer sections + a `builderTree`).
 *   • The dormant `<PublishedShell>` renders the snapshot's `builderTree`
 *     (resolved via `resolveSnapshotBuilderTree`) into the storefront header +
 *     footer — but only when `site-shell-flag` greenlights the tenant.
 *
 * --- WHERE A1 PERSISTS THE FREEFORM TREE ---
 * `cms_pages.blocks` (Json, default `[]`) on the SAME shell row. The shell row
 * is created with `is_freeform` unset (false) and `blocks = []`, so `blocks` is
 * an empty, unused draft slot for the shell — additive + reversible. `load`
 * prefers a non-empty `blocks` (the freeform draft); otherwise it falls back to
 * the published snapshot's `builderTree` (the existing shell tree the dormant
 * renderer already paints), so a freshly-backfilled shell opens populated.
 * `publish` bakes the draft `blocks` tree into `published_page_snapshot`
 * (preserving the existing `slots`) so `<PublishedShell>` paints the edited
 * tree — that publish runs through the existing `site-shell-publish` write path.
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
import type { BuilderNodeTree } from "@/lib/site-admin/builder-node/types";

import type {
  BuilderSurfaceAdapter,
  BuilderSurfaceContext,
  BuilderSurfacePublishInput,
  BuilderSurfaceSaveDraftInput,
  BuilderSurfaceRestoreInput,
} from "../surface-adapter";
import { assertNoLegacyBuilderWrite } from "../legacy-write-guard";

/**
 * Minimal `site_shell` row shape the adapter needs. This is the shell
 * `cms_pages` row (`system_template_key='site_shell'`), resolved by the action
 * surface from (tenant, locale).
 */
export interface SiteShellRow {
  /** cms_pages.id of the shell row. */
  id: string;
  title: string;
  status: "draft" | "scheduled" | "published" | "archived";
  /** Freeform draft tree (the A1 holding spot). `[]`/null on a fresh shell. */
  blocks: unknown;
  /**
   * The published snapshot's freeform tree (resolved from
   * `published_page_snapshot` server-side). Used as the load fallback when the
   * draft `blocks` are still empty, so the editor opens against the live shell
   * tree instead of a blank canvas.
   */
  snapshotBuilderTree: BuilderNodeTree | null;
  version: number | null;
  published_at: string | null;
  updated_at: string;
}

/**
 * pageVersion = `updated_at` epoch seconds (matches the cms_page / talent_page
 * freeform adapters). Every save advances `updated_at`, so the editor's
 * compare-and-swap "changed in another tab" guard sees a fresh version. The
 * slot system's `version` column is intentionally not used on the freeform path.
 */
function versionFromRow(row: SiteShellRow): number {
  return Math.floor(new Date(row.updated_at).getTime() / 1000);
}

/** Patch the adapter writes to the shell row on save. */
export interface SiteShellPagePatch {
  blocks: unknown;
  updated_at: string;
}

/**
 * The action surface the site_shell adapter needs. Injected so a spy test can
 * prove ZERO legacy (`cms_page_sections`) writes; production binds real DB ops
 * (`site-shell-actions.ts` "use server") that resolve the shell row, write the
 * `blocks` draft, and publish through `site-shell-publish`.
 */
export interface SiteShellAdapterActions {
  /** Resolve the tenant's `site_shell` row for (locale). Tenant resolved
   *  server-side. Returns null when the tenant has no shell row (pre-backfill). */
  loadShell: (input: { locale?: string }) => Promise<SiteShellRow | null>;
  /** Persist the freeform draft tree to the shell row's `blocks` column.
   *  NEVER touches `cms_page_sections`. */
  saveShell: (input: {
    pageId: string;
    patch: SiteShellPagePatch;
  }) => Promise<{ ok: true; updatedAt: string } | { ok: false; error: string }>;
  /** Bake the draft `blocks` tree into the shell snapshot + flip to published
   *  via the existing site-shell-publish path. */
  publishShell: (input: {
    pageId: string;
  }) => Promise<
    | { ok: true; publishedAt: string; updatedAt: string }
    | { ok: false; error: string }
  >;
}

/** Build a freeform composition from the shell row. Pure — no I/O. */
export function buildSiteShellComposition(
  row: SiteShellRow,
  locale: string,
): CompositionData {
  // Prefer the freeform draft (`blocks`); fall back to the published snapshot
  // tree so a freshly-backfilled shell opens against its live header/footer.
  const draftTree = Array.isArray(row.blocks) ? (row.blocks as BuilderNodeTree) : [];
  const builderTree: BuilderNodeTree =
    draftTree.length > 0 ? draftTree : row.snapshotBuilderTree ?? [];
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
    builderTree,
    slotDefs: [],
    library: [],
    styleClasses: undefined,
    availableLocales: [locale as CompositionData["locale"]],
  };
}

/**
 * Build the site_shell freeform adapter over a given action surface.
 *
 * `BuilderSurfaceContext` mapping: `ctx.locale` = the active locale (the shell
 * is keyed by locale, not slug — every tenant has one shell row per locale).
 * `ctx.pageSlug` / `ctx.pageId` are ignored. Mutations call
 * `assertNoLegacyBuilderWrite("site_shell", "cms_pages")` before any I/O.
 */
export function createSiteShellAdapter(
  actions: SiteShellAdapterActions,
  opts?: { assertNoLegacyWrite?: (table: string) => void },
): BuilderSurfaceAdapter {
  const guard =
    opts?.assertNoLegacyWrite ??
    ((table: string) => assertNoLegacyBuilderWrite("site_shell", table));

  async function persistTree(
    builderTree: BuilderNodeTree | undefined,
    locale: string,
  ): Promise<CompositionSaveResult> {
    guard("cms_pages");
    const row = await actions.loadShell({ locale });
    if (!row) return { ok: false, error: "No site shell exists for this tenant." };
    const result = await actions.saveShell({
      pageId: row.id,
      patch: {
        blocks: builderTree ?? [],
        updated_at: new Date().toISOString(),
      },
    });
    if (!result.ok) return { ok: false, error: result.error };
    return {
      ok: true,
      pageVersion: Math.floor(new Date(result.updatedAt).getTime() / 1000),
    };
  }

  return {
    kind: "site_shell",

    async load(ctx: BuilderSurfaceContext): Promise<CompositionLoadResult> {
      const row = await actions.loadShell({ locale: ctx.locale });
      if (!row) {
        return {
          ok: false,
          error: "No site shell exists for this tenant. Seed it first.",
        };
      }
      return { ok: true, data: buildSiteShellComposition(row, ctx.locale) };
    },

    async save(
      ctx: BuilderSurfaceContext,
      input: CompositionSaveInput,
    ): Promise<CompositionSaveResult> {
      return persistTree(input.builderTree, ctx.locale);
    },

    async saveDraft(
      ctx: BuilderSurfaceContext,
      input: BuilderSurfaceSaveDraftInput,
    ): Promise<SaveDraftResult> {
      const result = await persistTree(input.builderTree, ctx.locale);
      if (!result.ok) return { ok: false, error: result.error };
      return {
        ok: true,
        pageVersion: result.pageVersion,
        savedAt: new Date().toISOString(),
      };
    },

    async publish(
      ctx: BuilderSurfaceContext,
      _input: BuilderSurfacePublishInput,
    ): Promise<PublishResult> {
      guard("cms_pages");
      const row = await actions.loadShell({ locale: ctx.locale });
      if (!row) return { ok: false, error: "No site shell exists for this tenant." };
      const result = await actions.publishShell({ pageId: row.id });
      if (!result.ok) return { ok: false, error: result.error };
      return {
        ok: true,
        pageVersion: Math.floor(new Date(result.updatedAt).getTime() / 1000),
        publishedAt: result.publishedAt,
      };
    },
  };
}

/** Convenience re-export so callers can satisfy the optional restore contract.
 *  The shell has no revision history yet (A2+), so the adapter omits
 *  `restoreRevision` — call-sites already guard on its presence. */
export type SiteShellRevisionRestoreResult = RevisionRestoreResult;
export type { BuilderSurfaceRestoreInput };
