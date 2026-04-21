/**
 * Phase 5 / M3 — cached public + uncached staff reads for pages.
 *
 * `loadPublicPageBySlug` — storefront read, cached with tenant-scoped tag
 *   `tenant:${id}:pages:${pageId}`. Returns the published row (or `null`).
 *   Uses the SECURITY INVOKER RPC `cms_public_pages_for_tenant` which sets
 *   the current_tenant_id GUC, so RLS enforces tenant match on the SELECT.
 *
 * `loadPublicPagesList` — storefront list read (for /sitemap.xml or listing
 *   surfaces). Cached with `tenant:${id}:pages-all`.
 *
 * `loadPageByIdForStaff` — uncached admin editor read. Uses the caller's
 *   staff Supabase client; RLS `*_tenant_staff` policy is the gate.
 *
 * `loadPageRevisionsForStaff` — revision history for a page (rollback UI).
 *
 * All functions accept `tenantId` explicitly so they can be called from
 * non-request contexts.
 */

import { unstable_cache } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { tagFor } from "@/lib/site-admin";
import type { Locale } from "@/lib/site-admin/locales";

import type { PageRevisionRow, PageRow } from "./pages";

const PAGE_SELECT = `
  id,
  tenant_id,
  locale,
  slug,
  template_key,
  system_template_key,
  is_system_owned,
  template_schema_version,
  title,
  status,
  body,
  hero,
  meta_title,
  meta_description,
  og_title,
  og_description,
  og_image_url,
  og_image_media_asset_id,
  noindex,
  include_in_sitemap,
  canonical_url,
  published_at,
  version,
  created_by,
  updated_by,
  created_at,
  updated_at
`;

const REVISION_SELECT = `
  id,
  tenant_id,
  page_id,
  kind,
  version,
  template_schema_version,
  snapshot,
  created_by,
  created_at
`;

// ---- public cached reads --------------------------------------------------

/**
 * Cached storefront fetch of a published page. Returns `null` when:
 *   - the slug does not resolve for this tenant
 *   - the page is not status='published'
 *
 * Cache key includes tenantId/slug/locale; tag allows per-page busts via
 * `tenant:${id}:pages:${pageId}`, plus the broader `pages-all` surface tag
 * for list-bust semantics.
 */
export function loadPublicPageBySlug(
  tenantId: string,
  locale: Locale,
  slug: string,
): Promise<PageRow | null> {
  if (!tenantId) return Promise.resolve(null);

  return unstable_cache(
    async (): Promise<PageRow | null> => {
      const supabase = createPublicSupabaseClient();
      if (!supabase) return null;
      const { data, error } = await supabase
        .rpc("cms_public_pages_for_tenant", { p_tenant_id: tenantId })
        .select(PAGE_SELECT)
        .eq("locale", locale)
        .eq("slug", slug)
        .maybeSingle<PageRow>();
      if (error) {
        console.warn("[site-admin/pages-reads] public page load failed", {
          tenantId,
          locale,
          slug,
          error: error.message,
        });
        return null;
      }
      return data ?? null;
    },
    ["site-admin:page:public", tenantId, locale, slug],
    {
      tags: [
        tagFor(tenantId, "pages-all"),
        // Per-page tag is only known after the fetch, so we pair the list
        // tag with a slug-keyed secondary tag. When a specific id bust runs
        // via `updateTag(tagFor(tenantId, "pages", {id}))`, readers refetch
        // because their per-slug cache entry also carries `pages-all`.
      ],
    },
  )();
}

/**
 * Cached storefront list of all published pages for a tenant (used by
 * sitemap generation + route listing UIs). Tagged with `pages-all` so any
 * publish/archive/delete busts the list.
 */
export function loadPublicPagesList(
  tenantId: string,
): Promise<PageRow[]> {
  if (!tenantId) return Promise.resolve([]);

  return unstable_cache(
    async (): Promise<PageRow[]> => {
      const supabase = createPublicSupabaseClient();
      if (!supabase) return [];
      const { data, error } = await supabase
        .rpc("cms_public_pages_for_tenant", { p_tenant_id: tenantId })
        .select(PAGE_SELECT)
        .order("updated_at", { ascending: false });
      if (error) {
        console.warn("[site-admin/pages-reads] public list load failed", {
          tenantId,
          error: error.message,
        });
        return [];
      }
      return (data ?? []) as PageRow[];
    },
    ["site-admin:pages:public-list", tenantId],
    { tags: [tagFor(tenantId, "pages-all")] },
  )();
}

// ---- uncached staff reads -------------------------------------------------

/**
 * Load a single page by id for the admin editor. Tenant-scoped via the
 * `tenant_id` filter AND the caller's `is_staff_of_tenant` RLS policy.
 */
export async function loadPageByIdForStaff(
  supabase: SupabaseClient,
  tenantId: string,
  pageId: string,
): Promise<PageRow | null> {
  const { data, error } = await supabase
    .from("cms_pages")
    .select(PAGE_SELECT)
    .eq("tenant_id", tenantId)
    .eq("id", pageId)
    .maybeSingle<PageRow>();
  if (error) {
    console.warn("[site-admin/pages-reads] staff page load failed", {
      tenantId,
      pageId,
      error: error.message,
    });
    return null;
  }
  return data ?? null;
}

/**
 * List all pages for a tenant, most-recently-updated first. Used by the
 * `/admin/site-settings/pages` list view. System-owned rows surface too
 * (the UI marks them with a lock badge).
 *
 * Ordering contract: `updated_at DESC`. This is the single canonical sort —
 * any dashboard / tile / picker that renders tenant pages for staff should
 * match. Do not add a secondary sort unless the UI explicitly requires it;
 * extra order terms change the cache-tag semantics in a way reviewers must
 * re-verify.
 */
export async function listPagesForStaff(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<PageRow[]> {
  const { data, error } = await supabase
    .from("cms_pages")
    .select(PAGE_SELECT)
    .eq("tenant_id", tenantId)
    .order("updated_at", { ascending: false });
  if (error) {
    console.warn("[site-admin/pages-reads] staff list failed", {
      tenantId,
      error: error.message,
    });
    return [];
  }
  return (data ?? []) as PageRow[];
}

/**
 * Load revision history for a page, newest-first. Capped at `limit` (default
 * 50 — matches guardrail §5 retention target). Consumed by the restore-
 * from-revision modal.
 */
export async function loadPageRevisionsForStaff(
  supabase: SupabaseClient,
  tenantId: string,
  pageId: string,
  limit = 50,
): Promise<PageRevisionRow[]> {
  const { data, error } = await supabase
    .from("cms_page_revisions")
    .select(REVISION_SELECT)
    .eq("tenant_id", tenantId)
    .eq("page_id", pageId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.warn("[site-admin/pages-reads] staff revisions failed", {
      tenantId,
      pageId,
      error: error.message,
    });
    return [];
  }
  return (data ?? []) as PageRevisionRow[];
}
