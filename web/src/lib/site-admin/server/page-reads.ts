/**
 * Phase 7 — public reader for section-composed non-homepage pages.
 *
 * Mirror of `loadPublicHomepage` but keyed by slug + locale and reading
 * `published_page_snapshot` instead of `published_homepage_snapshot`.
 * The snapshot shape is identical (HomepageSnapshot type) — the only
 * difference is which column carries it.
 *
 * Returns null when:
 *   - tenant has no page at that slug
 *   - page exists but isn't published
 *   - page exists + published but `published_page_snapshot` is null
 *     (i.e. legacy body-only page; caller should fall through to the
 *     existing rich-text rendering path)
 */

import { unstable_cache } from "next/cache";

import type { Locale } from "@/i18n/config";
import { tagFor } from "@/lib/site-admin/cache-tags";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import type { HomepageSnapshot } from "./homepage";

export interface PublicPageWithSnapshot {
  pageId: string;
  slug: string;
  locale: string;
  title: string;
  metaTitle: string | null;
  metaDescription: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImageUrl: string | null;
  noindex: boolean;
  canonicalUrl: string | null;
  snapshot: HomepageSnapshot | null;
}

interface Row {
  id: string;
  slug: string | null;
  locale: string;
  title: string;
  meta_title: string | null;
  meta_description: string | null;
  og_title: string | null;
  og_description: string | null;
  og_image_url: string | null;
  noindex: boolean;
  canonical_url: string | null;
  status: string;
  published_page_snapshot: HomepageSnapshot | null;
}

const SELECT = `
  id, slug, locale, title,
  meta_title, meta_description,
  og_title, og_description, og_image_url,
  noindex, canonical_url, status,
  published_page_snapshot
`;

export function loadPublicPage(
  tenantId: string,
  locale: Locale,
  slug: string,
): Promise<PublicPageWithSnapshot | null> {
  if (!tenantId || !slug) return Promise.resolve(null);
  return unstable_cache(
    async (): Promise<PublicPageWithSnapshot | null> => {
      const supabase = createPublicSupabaseClient();
      if (!supabase) return null;
      const { data, error } = await supabase
        .rpc("cms_public_pages_for_tenant", { p_tenant_id: tenantId })
        .select(SELECT)
        .eq("locale", locale)
        .eq("slug", slug)
        .maybeSingle<Row>();
      if (error) {
        console.warn("[site-admin/page-reads] public page load failed", {
          tenantId,
          locale,
          slug,
          error: error.message,
        });
        return null;
      }
      if (!data) return null;
      if (data.status !== "published") return null;
      return {
        pageId: data.id,
        slug: data.slug ?? "",
        locale: data.locale,
        title: data.title,
        metaTitle: data.meta_title,
        metaDescription: data.meta_description,
        ogTitle: data.og_title,
        ogDescription: data.og_description,
        ogImageUrl: data.og_image_url,
        noindex: data.noindex,
        canonicalUrl: data.canonical_url,
        snapshot: data.published_page_snapshot ?? null,
      };
    },
    ["site-admin:public-page", tenantId, locale, slug],
    {
      // Cache-tag scope: keyed by tenant + the broad `pages-all` surface
      // so any page-publish (which already busts pages-all) invalidates
      // every cached non-homepage page read for this tenant. Per-page
      // narrow tagging would require a server-side pageId resolution
      // before the read; deferred for now.
      tags: [tagFor(tenantId, "pages-all")],
    },
  )();
}
