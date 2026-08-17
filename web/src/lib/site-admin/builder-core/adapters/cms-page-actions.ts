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

import { requireSession } from "@/lib/server/action-guards";
import { userHasCapability } from "@/lib/access";
import { requireEditSurfaceTenantScope } from "@/lib/saas/edit-surface-scope";
import { enforceLockedPropsOnTree } from "@/lib/site-admin/builder-node/prop-lock";
import { parseBuilderTreeFromSnapshot } from "@/lib/site-admin/edit-mode/composition-revision-snapshot";
import {
  publishCmsFreeformPageWithClient,
  writeCmsFreeformRevision,
} from "./cms-freeform-publish-core";
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
  const auth = await requireSession();
  if (!auth.ok) return null;
  const scope = await requireEditSurfaceTenantScope().catch(() => null);
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
  const auth = await requireSession();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireEditSurfaceTenantScope().catch(() => null);
  if (!scope) return { ok: false, error: "Select an agency workspace first." };

  // Capability gate. This action writes DIRECTLY rather than through a
  // capability-checked `server/*` op: service-role writes bypass RLS entirely,
  // and the RLS that does apply is `is_staff_of_tenant()`, which is role-blind
  // (any active membership passes). So the membership ROLE has to be checked
  // here, or a `viewer` can ship changes to the live site.
  if (!(await userHasCapability("agency.site_admin.pages.edit", scope.tenantId))) {
    return { ok: false, error: "You don't have permission to edit this page." };
  }

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

  // REV-1 — checkpoint the saved freeform tree as a restorable draft revision.
  // Best-effort, never blocks the save result.
  const checkpoint = (updatedAt: string) =>
    writeCmsFreeformRevision({
      supabase: auth.supabase,
      tenantId: scope.tenantId,
      pageId: input.pageId,
      title: (typeof input.patch.title === "string" && input.patch.title) || "Page",
      blocks: enforcedBlocks,
      kind: "draft",
      actorProfileId: auth.user.id,
    }).then(() => updatedAt);

  const { data, error } = await runUpdate({ ...patch, ...stylePatch });
  if (!error && data) return { ok: true, updatedAt: await checkpoint(data.updated_at) };

  // STYLE-1 graceful fallback — if the style columns don't exist yet (migration
  // unapplied) the update errors. Retry WITHOUT them so the tree still saves; the
  // registry stays in the editor's localStorage seed until the migration lands.
  if (Object.keys(stylePatch).length > 0) {
    const retry = await runUpdate(patch);
    if (!retry.error && retry.data) {
      return { ok: true, updatedAt: await checkpoint(retry.data.updated_at) };
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
  const auth = await requireSession();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireEditSurfaceTenantScope().catch(() => null);
  if (!scope) return { ok: false, error: "Select an agency workspace first." };

  // Capability gate. This action writes DIRECTLY rather than through a
  // capability-checked `server/*` op: service-role writes bypass RLS entirely,
  // and the RLS that does apply is `is_staff_of_tenant()`, which is role-blind
  // (any active membership passes). So the membership ROLE has to be checked
  // here, or a `viewer` can ship changes to the live site.
  if (!(await userHasCapability("agency.site_admin.pages.publish", scope.tenantId))) {
    return { ok: false, error: "You don't have permission to publish this page." };
  }

  // The write + REV-1 published-revision checkpoint live in
  // `cms-freeform-publish-core.ts` so the scheduled-publish cron (which has no
  // session and therefore cannot call this action) publishes freeform pages
  // through the identical sequence instead of a second implementation.
  return publishCmsFreeformPageWithClient({
    supabase: auth.supabase,
    tenantId: scope.tenantId,
    pageId: input.pageId,
    actorProfileId: auth.user.id,
  });
}

/**
 * REV-1 — restore a saved freeform revision's `builderTree` back onto the page's
 * live `cms_pages.blocks`. Mirrors `restoreSiteShellRevisionAction`:
 *   - reads the revision's `builderTree` snapshot (scoped to tenant + page),
 *   - re-asserts admin prop-locks (C1 chokepoint) against the current blocks so
 *     restoring an old/pre-lock revision can't drop an admin lock,
 *   - writes the restored tree back to `blocks` (status flips to draft so the
 *     operator reviews + republishes), and
 *   - mints a fresh `kind='rollback'` revision so the audit trail is complete.
 *
 * Auth = staff of the active tenant (same gate as save/publish); cms_pages RLS
 * independently backs every write.
 */
export async function restoreCmsFreeformRevisionAction(input: {
  pageId: string;
  revisionId: string;
}): Promise<{ ok: true; updatedAt: string } | { ok: false; error: string }> {
  const auth = await requireSession();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireEditSurfaceTenantScope().catch(() => null);
  if (!scope) return { ok: false, error: "Select an agency workspace first." };

  // Capability gate. This action writes DIRECTLY rather than through a
  // capability-checked `server/*` op: service-role writes bypass RLS entirely,
  // and the RLS that does apply is `is_staff_of_tenant()`, which is role-blind
  // (any active membership passes). So the membership ROLE has to be checked
  // here, or a `viewer` can ship changes to the live site.
  if (!(await userHasCapability("agency.site_admin.pages.edit", scope.tenantId))) {
    return { ok: false, error: "You don't have permission to edit this page." };
  }

  // 1. Read the revision's snapshot (scoped to tenant + page).
  const { data: rev, error: revErr } = await auth.supabase
    .from("cms_page_revisions")
    .select("snapshot")
    .eq("id", input.revisionId)
    .eq("tenant_id", scope.tenantId)
    .eq("page_id", input.pageId)
    .maybeSingle()
    .returns<{ snapshot: unknown }>();
  if (revErr || !rev) {
    return { ok: false, error: revErr?.message ?? "Page revision not found." };
  }
  const restoredTree = parseBuilderTreeFromSnapshot(rev.snapshot) ?? [];

  // 2. Re-assert current locks onto the restored content (C1) against the live
  //    blocks, so restoring a pre-lock/tampered revision can't drop an admin lock.
  const { data: current } = await auth.supabase
    .from("cms_pages")
    .select("blocks, title")
    .eq("id", input.pageId)
    .eq("tenant_id", scope.tenantId)
    .eq("is_freeform", true)
    .maybeSingle()
    .returns<{ blocks: unknown; title: string }>();
  const enforced = enforceLockedPropsOnTree(restoredTree, current?.blocks);

  // 3. Write the restored tree back to blocks (status → draft for review).
  const nowIso = new Date().toISOString();
  const { data, error } = await auth.supabase
    .from("cms_pages")
    .update({ blocks: enforced, status: "draft", updated_at: nowIso })
    .eq("id", input.pageId)
    .eq("tenant_id", scope.tenantId)
    .eq("is_freeform", true)
    .select("updated_at")
    .maybeSingle()
    .returns<{ updated_at: string }>();
  if (error || !data) {
    return { ok: false, error: error?.message ?? "Could not restore the page revision." };
  }

  // 4. Mint a rollback revision for the audit trail (best-effort).
  await writeCmsFreeformRevision({
    supabase: auth.supabase,
    tenantId: scope.tenantId,
    pageId: input.pageId,
    title: current?.title ?? "Page",
    blocks: enforced,
    kind: "rollback",
    actorProfileId: auth.user.id,
  });

  return { ok: true, updatedAt: data.updated_at };
}
