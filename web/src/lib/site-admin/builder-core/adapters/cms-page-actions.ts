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
import type { CmsFreeformPageRow } from "./cms-page-adapter-core";

const ROW_COLUMNS =
  "id, slug, title, status, blocks, is_freeform, version, published_at, updated_at";

/** Load a freeform cms_pages row by slug within the caller's tenant. */
export async function loadCmsFreeformPage(input: {
  slug: string;
}): Promise<CmsFreeformPageRow | null> {
  const auth = await requireStaff();
  if (!auth.ok) return null;
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) return null;

  const { data, error } = await auth.supabase
    .from("cms_pages")
    .select(ROW_COLUMNS)
    .eq("tenant_id", scope.tenantId)
    .eq("slug", input.slug)
    .eq("is_freeform", true)
    .maybeSingle()
    .returns<CmsFreeformPageRow>();
  if (error || !data) return null;
  return data;
}

/** Persist the freeform tree (+ optional title) to cms_pages.blocks. */
export async function saveCmsFreeformPage(input: {
  pageId: string;
  patch: { blocks: unknown; updated_at: string; title?: string };
}): Promise<{ ok: true; updatedAt: string } | { ok: false; error: string }> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) return { ok: false, error: "Select an agency workspace first." };

  const patch: Record<string, unknown> = {
    blocks: input.patch.blocks ?? [],
    updated_at: input.patch.updated_at,
  };
  if (typeof input.patch.title === "string" && input.patch.title.length > 0) {
    patch.title = input.patch.title;
  }

  const { data, error } = await auth.supabase
    .from("cms_pages")
    .update(patch)
    .eq("id", input.pageId)
    .eq("tenant_id", scope.tenantId)
    .eq("is_freeform", true)
    .select("updated_at")
    .maybeSingle()
    .returns<{ updated_at: string }>();
  if (error || !data) {
    return { ok: false, error: error?.message ?? "Could not save the page." };
  }
  return { ok: true, updatedAt: data.updated_at };
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
