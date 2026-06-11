/**
 * Workspace-page adapter — PURE FACTORY (no runtime imports).
 *
 * Mirrors the `homepage-adapter-core.ts` / `platform-lab-adapter-core.ts`
 * pattern exactly: only `import type` here so NO server-action / DB /
 * React-component (CSS) module graph is pulled in at module load. This
 * lets `workspace-page-adapter.test.ts` import the factory under a bare
 * `tsx --test` run and prove — with spy actions — that the adapter:
 *
 *   a) NEVER calls any cms_page_sections / homepage action,
 *   b) ALWAYS calls `assertNoLegacyBuilderWrite("workspace_page", …)` on
 *      every mutation, and
 *   c) persists exclusively to `workspace_pages.blocks`.
 *
 * The production binding (real server actions) lives in
 * `workspace-page-adapter.ts`, which re-exports this factory.
 *
 * --- TABLE CONTRACT ---
 * `workspace_pages` shape (from 20260528173519_workspace_pages.sql):
 *   id, tenant_id, slug, title, status, blocks jsonb, theme jsonb,
 *   published_at, scheduled_for, created_by, created_at, updated_at.
 *
 * The adapter stores the freeform `builderTree` in the `blocks` column.
 * The `theme` column carries `styleClasses` (style class registry). The
 * `metadata` object from `CompositionData` maps to the page's `title`
 * and (for now) lives in the composition layer only — workspace pages do
 * not have a separate SEO table.
 *
 * VERSION / CAS: `workspace_pages` has no explicit `version` column —
 * we derive a monotonic version from `updated_at` (epoch seconds).
 * If the DB row is newer than the client expected, the client retries with
 * the fresh version (same CAS contract as the homepage).
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

// ── Row shape (only fields we read/write) ───────────────────────────────────

/** Minimal `workspace_pages` row shape used by the adapter. Columns mirror the
 *  20260528173519_workspace_pages.sql migration exactly. */
export interface WorkspacePageRow {
  id: string;
  tenant_id: string;
  slug: string;
  title: string;
  status: "draft" | "scheduled" | "published";
  blocks: unknown; // BuilderNodeTree stored as JSONB
  theme: unknown;  // styleClasses + theme tokens stored as JSONB
  published_at: string | null;
  updated_at: string;
}

/** Derive a monotonic version from `updated_at` (epoch seconds). */
function versionFromRow(row: WorkspacePageRow): number {
  return Math.floor(new Date(row.updated_at).getTime() / 1000);
}

/** Shape the adapter writes to `workspace_pages` on save. */
export interface WorkspacePagePatch {
  blocks: unknown;
  theme: unknown;
  updated_at: string;
  title?: string;
}

// ── Action surface injected by the production binding ────────────────────────

/**
 * The exact action surface the workspace-page adapter needs. Injected so the
 * spy test can prove pass-through with fakes; production binds real DB actions.
 */
export interface WorkspacePageAdapterActions {
  /** Load the workspace_pages row by (tenantId, slug). */
  loadPage: (input: {
    tenantId: string;
    slug: string;
  }) => Promise<WorkspacePageRow | null>;

  /**
   * Persist a mutation. The adapter calls
   * `assertNoLegacyBuilderWrite("workspace_page", "workspace_pages")` BEFORE
   * calling this. The action writes ONLY `workspace_pages.blocks` +
   * `workspace_pages.theme` + `updated_at`. Never touches `cms_page_sections`.
   */
  savePage: (input: {
    tenantId: string;
    pageId: string;
    patch: WorkspacePagePatch;
  }) => Promise<{ ok: true; updatedAt: string } | { ok: false; error: string }>;

  /**
   * Publish the page (status=published, published_at=now()). The adapter
   * calls `assertNoLegacyBuilderWrite("workspace_page", "workspace_pages")`
   * first.
   */
  publishPage: (input: {
    tenantId: string;
    pageId: string;
  }) => Promise<{ ok: true; publishedAt: string; updatedAt: string } | { ok: false; error: string }>;

  /**
   * Restore a revision's blocks+theme onto the live row. Optional — if absent
   * the `restoreRevision` method is omitted (editor disables the affordance).
   */
  restoreRevision?: (input: {
    tenantId: string;
    pageId: string;
    revisionId: string;
  }) => Promise<{ ok: true; updatedAt: string } | { ok: false; error: string }>;
}

// ── buildEmptyWorkspacePageComposition ──────────────────────────────────────

/**
 * A minimal empty freeform composition for a workspace page that has no
 * persisted blocks yet. Pure constructor — no I/O.
 */
export function buildEmptyWorkspacePageComposition(
  row: WorkspacePageRow,
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
    // `workspace_pages.blocks` is always a freeform BuilderNode[] (authored in
    // the WS6 page builder). The legacy PageBlock[] shape was retired with the
    // legacy block editor, so no conversion is needed on load.
    builderTree: builderTreeFromStoredBlocks(row.blocks),
    slotDefs: [],
    library: [],
    styleClasses: (row.theme as CompositionData["styleClasses"]) ?? undefined,
    availableLocales: [locale as CompositionData["locale"]],
  };
}

/**
 * Normalize a stored `workspace_pages.blocks` value into the freeform
 * `builderTree` the editor expects: a freeform BuilderNode[] passes through;
 * an empty / non-array value opens a blank page.
 */
function builderTreeFromStoredBlocks(
  blocks: unknown,
): CompositionData["builderTree"] {
  return Array.isArray(blocks)
    ? (blocks as CompositionData["builderTree"])
    : [];
}

// ── createWorkspacePageAdapter ───────────────────────────────────────────────

/**
 * Build the workspace_page adapter over a given action surface. Mutations call
 * `assertNoLegacyBuilderWrite("workspace_page", "workspace_pages")` before
 * touching any I/O — the guard throws if the table ever slips to a legacy name,
 * giving us a hard runtime backstop on top of the CI static grep.
 *
 * `tenantId` is captured at construction time (closure) because
 * `BuilderSurfaceContext` only carries `{ locale, pageSlug, pageId }` — the
 * `pageId` field becomes the workspace_pages row id AFTER the first load, not
 * the tenant id. The workspace mount creates one adapter per tenant session.
 */
export function createWorkspacePageAdapter(
  actions: WorkspacePageAdapterActions,
  opts?: {
    /** Injected guard for tests — defaults to the real `assertNoLegacyBuilderWrite`. */
    assertNoLegacyWrite?: (table: string) => void;
    /** Tenant id to scope DB queries (workspace_pages.tenant_id).
     *  When omitted the adapter tries ctx.pageId on first load (legacy path). */
    tenantId?: string;
  },
): BuilderSurfaceAdapter {
  const guard =
    opts?.assertNoLegacyWrite ??
    ((table: string) => assertNoLegacyBuilderWrite("workspace_page", table));

  // Tenant id is captured at construction for subsequent save/publish calls.
  // `ctx.pageId` carries the workspace_pages row id after the first load.
  const capturedTenantId = opts?.tenantId ?? "";

  return {
    kind: "workspace_page",

    async load(ctx: BuilderSurfaceContext): Promise<CompositionLoadResult> {
      const tenantId = capturedTenantId || ctx.pageId || "";
      const slug = ctx.pageSlug ?? "index";

      // pageId on workspace_page surfaces is the tenant_id (threaded in from the
      // admin shell). pageSlug is the workspace page slug.
      const row = await actions.loadPage({ tenantId, slug });
      if (!row) {
        return {
          ok: false,
          error: `Workspace page not found: tenant=${tenantId} slug=${slug}`,
        };
      }
      return { ok: true, data: buildEmptyWorkspacePageComposition(row, ctx.locale) };
    },

    async save(
      ctx: BuilderSurfaceContext,
      input: CompositionSaveInput,
    ): Promise<CompositionSaveResult> {
      // §F.1 — runtime guard: workspace_page must NEVER write cms_page_sections.
      guard("workspace_pages");

      const tenantId = capturedTenantId || "";
      if (!input.pageId) {
        return { ok: false, error: "workspace_page save: pageId is required." };
      }

      const result = await actions.savePage({
        tenantId,
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
      guard("workspace_pages");

      const tenantId = capturedTenantId || "";
      if (!ctx.pageSlug) {
        return { ok: false, error: "workspace_page saveDraft: pageSlug is required." };
      }

      // Load to get the page id for the save
      const row = await actions.loadPage({ tenantId, slug: ctx.pageSlug });
      if (!row) {
        return { ok: false, error: "Workspace page not found for saveDraft." };
      }

      const result = await actions.savePage({
        tenantId,
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
      guard("workspace_pages");

      const tenantId = capturedTenantId || "";
      if (!ctx.pageSlug) {
        return { ok: false, error: "workspace_page publish: pageSlug is required." };
      }

      // Load to get the page id
      const row = await actions.loadPage({ tenantId, slug: ctx.pageSlug });
      if (!row) {
        return { ok: false, error: "Workspace page not found for publish." };
      }

      const result = await actions.publishPage({ tenantId, pageId: row.id });
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
            guard("workspace_pages");

            const tenantId = capturedTenantId || "";
            if (!ctx.pageSlug) {
              return {
                ok: false,
                error: "workspace_page restoreRevision: pageSlug is required.",
              };
            }

            const row = await actions.loadPage({ tenantId, slug: ctx.pageSlug });
            if (!row) {
              return { ok: false, error: "Workspace page not found for restoreRevision." };
            }

            const result = await actions.restoreRevision!({
              tenantId,
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
