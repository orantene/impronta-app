"use server";

/**
 * Production server actions for the cms-page FREEFORM adapter (Wave 4.1).
 *
 * These persist the freeform `builderTree` to `cms_pages.blocks` for pages with
 * `is_freeform = true`, scoped to the caller's tenant. They NEVER touch
 * `cms_page_sections` — the legacy slot path is reserved for the `homepage`
 * adapter. Auth = staff of the active tenant (RLS on cms_pages also enforces it).
 *
 * "use server" file: every export is an async server action. The non-action
 * binding (`createBoundCmsPageAdapter`) lives in `cms-page-adapter.ts`.
 *
 * Versioning: pageVersion is derived from `updated_at` (epoch seconds) by the
 * adapter, matching the talent/workspace freeform adapters — every save advances
 * `updated_at`, so the editor's compare-and-swap "changed in another tab" guard
 * works without the slot system's `cms_pages.version` machinery.
 */

import { requireStaff } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas/scope";
import { enforceLockedPropsOnTree } from "@/lib/site-admin/builder-node/prop-lock";
import type { CmsFreeformPageRow } from "./cms-page-adapter-core";

// STYLE-1 — the style registry columns are selected/written through a graceful
// path: a pre-migration DB (column absent) would ERROR the whole PostgREST query
// (data:null), 500-ing the editor. So the base column list excludes them and we
// add them only when present, falling back to the base list on error.
const BASE_ROW_COLUMNS =
  "id, slug, title, status, blocks, is_freeform, version, published_at, updated_at";
const ROW_COLUMNS = `${BASE_ROW_COLUMNS}, style_classes, style_presets`;

/** Load a freeform cms_pages row by (locale, slug) within the caller's tenant.
 *  cms_pages is unique on (tenant_id, locale, slug); filtering by locale is
 *  REQUIRED — without it a multi-locale tenant returns >1 row and `.maybeSingle()`
 *  errors. Defaults to "en" when the caller omits locale. */
export async function loadCmsFreeformPage(input: {
  slug: string;
  locale?: string;
}): Promise<CmsFreeformPageRow | null> {
  const auth = await requireStaff();
  if (!auth.ok) return null;
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) return null;

  const selectRow = (columns: string) =>
    auth.supabase
      .from("cms_pages")
      .select(columns)
      .eq("tenant_id", scope.tenantId)
      .eq("locale", input.locale ?? "en")
      .eq("slug", input.slug)
      .eq("is_freeform", true)
      .maybeSingle()
      .returns<CmsFreeformPageRow>();

  const { data, error } = await selectRow(ROW_COLUMNS);
  if (!error && data) return data;

  // STYLE-1 graceful fallback — the style columns may not exist yet (migration
  // unapplied). Re-select the base columns so the editor still opens; the style
  // registry then degrades to the SSR/localStorage seed.
  const fallback = await selectRow(BASE_ROW_COLUMNS);
  if (fallback.error || !fallback.data) return null;
  return fallback.data;
}

/** Persist the freeform tree (+ optional title + STYLE-1 registries) to cms_pages. */
export async function saveCmsFreeformPage(input: {
  pageId: string;
  patch: {
    blocks: unknown;
    updated_at: string;
    title?: string;
    style_classes?: unknown;
    style_presets?: unknown;
  };
}): Promise<{ ok: true; updatedAt: string } | { ok: false; error: string }> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) return { ok: false, error: "Select an agency workspace first." };

  // C1 — server-trusted lock enforcement on the full-tree save. Load the current
  // blocks and re-assert every admin lock so a crafted client can't persist an
  // edit to a locked prop (the inspector strip alone is bypassable).
  const { data: current } = await auth.supabase
    .from("cms_pages")
    .select("blocks")
    .eq("id", input.pageId)
    .eq("tenant_id", scope.tenantId)
    .eq("is_freeform", true)
    .maybeSingle()
    .returns<{ blocks: unknown }>();
  const enforcedBlocks = enforceLockedPropsOnTree(
    input.patch.blocks ?? [],
    current?.blocks,
  );

  const patch: Record<string, unknown> = {
    blocks: enforcedBlocks,
    updated_at: input.patch.updated_at,
  };
  if (typeof input.patch.title === "string" && input.patch.title.length > 0) {
    patch.title = input.patch.title;
  }
  // STYLE-1 — only set the style columns when the caller actually touched them
  // (`undefined` = leave the stored value alone). `null` clears the column.
  const stylePatch: Record<string, unknown> = {};
  if (input.patch.style_classes !== undefined) {
    stylePatch.style_classes = input.patch.style_classes;
  }
  if (input.patch.style_presets !== undefined) {
    stylePatch.style_presets = input.patch.style_presets;
  }

  const runUpdate = (payload: Record<string, unknown>) =>
    auth.supabase
      .from("cms_pages")
      .update(payload)
      .eq("id", input.pageId)
      .eq("tenant_id", scope.tenantId)
      .eq("is_freeform", true)
      .select("updated_at")
      .maybeSingle()
      .returns<{ updated_at: string }>();

  const { data, error } = await runUpdate({ ...patch, ...stylePatch });
  if (!error && data) return { ok: true, updatedAt: data.updated_at };

  // STYLE-1 graceful fallback — if the style columns don't exist yet (migration
  // unapplied) the update errors. Retry WITHOUT them so the tree still saves; the
  // registry stays in the editor's localStorage seed until the migration lands.
  if (Object.keys(stylePatch).length > 0) {
    const retry = await runUpdate(patch);
    if (!retry.error && retry.data) {
      return { ok: true, updatedAt: retry.data.updated_at };
    }
    return { ok: false, error: retry.error?.message ?? "Could not save the page." };
  }
  return { ok: false, error: error?.message ?? "Could not save the page." };
}

/** Publish a freeform page (status=published, published_at=now()). */
export async function publishCmsFreeformPage(input: {
  pageId: string;
}): Promise<
  | { ok: true; publishedAt: string; updatedAt: string }
  | { ok: false; error: string }
> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) return { ok: false, error: "Select an agency workspace first." };

  const now = new Date().toISOString();
  const { data, error } = await auth.supabase
    .from("cms_pages")
    .update({ status: "published", published_at: now, updated_at: now })
    .eq("id", input.pageId)
    .eq("tenant_id", scope.tenantId)
    .eq("is_freeform", true)
    .select("published_at, updated_at")
    .maybeSingle()
    .returns<{ published_at: string; updated_at: string }>();
  if (error || !data) {
    return { ok: false, error: error?.message ?? "Could not publish the page." };
  }
  return { ok: true, publishedAt: data.published_at ?? now, updatedAt: data.updated_at };
}
