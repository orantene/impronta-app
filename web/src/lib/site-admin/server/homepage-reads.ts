/**
 * Phase 5 / M5 — homepage cached public + uncached staff reads.
 *
 * `loadPublicHomepage` — storefront read, cached with tenant-scoped tag
 *   `tenant:${id}:homepage:${locale}`. Returns a shape hydrated from the
 *   `published_homepage_snapshot` JSONB carried on the cms_pages row plus
 *   the page fields the storefront needs (meta, og, noindex, etc).
 *
 *   Why the snapshot, not the junction? The snapshot freezes section props
 *   at publish time. Subsequent section edits (even re-publish) do NOT
 *   touch a live homepage — that's the M4-approval carry-forward discipline.
 *
 * `loadHomepageRevisionsForStaff` — revision history for the homepage row,
 *   newest-first, capped at `limit` (default 50 — guardrail §5).
 */

import { unstable_cache } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { tagFor } from "@/lib/site-admin";
import type { Locale } from "@/lib/site-admin/locales";

import type { HomepageSnapshot } from "./homepage";
import type { PageRevisionRow } from "./pages";

// ---- column sets ----------------------------------------------------------

/**
 * Public storefront needs just the fields a consumer page would render +
 * the frozen snapshot. Keep the column set lean so the RPC payload stays
 * small; add fields only when a storefront feature needs them.
 */
const PUBLIC_HOMEPAGE_SELECT = `
  id,
  tenant_id,
  locale,
  title,
  status,
  meta_title,
  meta_description,
  og_title,
  og_description,
  og_image_url,
  og_image_media_asset_id,
  noindex,
  canonical_url,
  published_at,
  published_homepage_snapshot,
  template_schema_version,
  version
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

// ---- public shape ---------------------------------------------------------

export interface PublicHomepage {
  pageId: string;
  tenantId: string;
  locale: Locale;
  title: string;
  metaTitle: string | null;
  metaDescription: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImageUrl: string | null;
  ogImageMediaAssetId: string | null;
  noindex: boolean;
  canonicalUrl: string | null;
  publishedAt: string;
  version: number;
  templateSchemaVersion: number;
  /**
   * The frozen composition hydrated from `published_homepage_snapshot`. Will
   * be `null` if the homepage row has never been published (row exists but
   * no snapshot yet). Storefront callers should render nothing in that case
   * (or a platform-managed default, which is not part of M5 scope).
   */
  snapshot: HomepageSnapshot | null;
}

// ---- public cached read ---------------------------------------------------

type PublicRow = {
  id: string;
  tenant_id: string;
  locale: Locale;
  title: string;
  status: string;
  meta_title: string | null;
  meta_description: string | null;
  og_title: string | null;
  og_description: string | null;
  og_image_url: string | null;
  og_image_media_asset_id: string | null;
  noindex: boolean;
  canonical_url: string | null;
  published_at: string | null;
  published_homepage_snapshot: HomepageSnapshot | null;
  template_schema_version: number;
  version: number;
};

function toPublicHomepage(row: PublicRow): PublicHomepage {
  return {
    pageId: row.id,
    tenantId: row.tenant_id,
    locale: row.locale,
    title: row.title,
    metaTitle: row.meta_title,
    metaDescription: row.meta_description,
    ogTitle: row.og_title,
    ogDescription: row.og_description,
    ogImageUrl: row.og_image_url,
    ogImageMediaAssetId: row.og_image_media_asset_id,
    noindex: row.noindex,
    canonicalUrl: row.canonical_url,
    publishedAt: row.published_at ?? "",
    version: row.version,
    templateSchemaVersion: row.template_schema_version,
    snapshot: row.published_homepage_snapshot ?? null,
  };
}

/**
 * Cached storefront homepage read. Returns `null` when:
 *   - the tenant has never invoked `ensureHomepageRow` (no row exists)
 *   - the homepage row exists but status is not 'published' (returns null so
 *     public consumers don't render an unpublished page by accident)
 *
 * Cache key includes tenantId + locale; tags `homepage:{locale}` + the broad
 * `pages-all` surface let either a homepage publish (narrow) or a tenant-
 * wide page bust (broad) invalidate the entry.
 */
export function loadPublicHomepage(
  tenantId: string,
  locale: Locale,
): Promise<PublicHomepage | null> {
  if (!tenantId) return Promise.resolve(null);

  return unstable_cache(
    async (): Promise<PublicHomepage | null> => {
      const supabase = createPublicSupabaseClient();
      if (!supabase) return null;
      const { data, error } = await supabase
        .rpc("cms_public_pages_for_tenant", { p_tenant_id: tenantId })
        .select(PUBLIC_HOMEPAGE_SELECT)
        .eq("locale", locale)
        .eq("is_system_owned", true)
        .eq("system_template_key", "homepage")
        .maybeSingle<PublicRow>();
      if (error) {
        console.warn("[site-admin/homepage-reads] public load failed", {
          tenantId,
          locale,
          error: error.message,
        });
        return null;
      }
      if (!data) return null;
      if (data.status !== "published") return null;
      return toPublicHomepage(data);
    },
    ["site-admin:homepage:public", tenantId, locale],
    {
      tags: [
        tagFor(tenantId, "homepage", { locale }),
        tagFor(tenantId, "pages-all"),
      ],
    },
  )();
}

// ---- uncached staff reads -------------------------------------------------

/**
 * Load revision history for the homepage row, newest-first. Returns an empty
 * array if the homepage row doesn't exist yet. Consumed by the composer
 * rollback UI.
 */
export async function loadHomepageRevisionsForStaff(
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
    console.warn("[site-admin/homepage-reads] staff revisions failed", {
      tenantId,
      pageId,
      error: error.message,
    });
    return [];
  }
  return (data ?? []) as PageRevisionRow[];
}
