/**
 * A4 follow-up — server resolver for the COLLECTION NAV sources (`cms_page`,
 * `cms_posts`). A `nav` node may carry a `dataBinding` to one of these; when it
 * does, the SHELL/storefront render path resolves the published records here and
 * injects them into `dataSources.collections[sourceKey]`, where the nav render
 * case projects them into flat links (label + href) via `navLinksFromRecords`.
 *
 * PURE data-layer (takes an explicit `supabase` + `tenantId`, matching
 * `collections/server.ts`): published pages → `/p/{slug}`, published posts →
 * `/posts/{slug}`. Both filtered by tenant + locale + `status='published'`. The
 * `label`/`title`/`href` keys match the `cms_page` / `cms_posts` field sets in
 * `data-bindings.ts` so the renderer's field mapping works unchanged.
 *
 * Tenancy: every query filters on `tenant_id`. The public storefront read path
 * uses a service-role client (RLS-bypassing), so the `.eq("tenant_id")` filter
 * is the correctness gate here.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  BuilderDataSourceRecord,
  BuilderNode,
} from "@/lib/site-admin/builder-node";

/** The built-in collection-backed nav sources this resolver understands. */
export const NAV_COLLECTION_SOURCE_KEYS = ["cms_page", "cms_posts"] as const;
export type NavCollectionSourceKey = (typeof NAV_COLLECTION_SOURCE_KEYS)[number];

/** Hard cap so a runaway page/post list can't bloat the shell render. */
const NAV_COLLECTION_MAX_ITEMS = 50;

export function isNavCollectionSourceKey(
  key: string | null | undefined,
): key is NavCollectionSourceKey {
  return (
    key === "cms_page" || key === "cms_posts"
  );
}

/**
 * PURE — walk a builder tree and collect every distinct nav-collection
 * sourceKey (`cms_page` / `cms_posts`) referenced by a `nav` node's
 * `dataBinding`. The shell render path uses this to fetch ONLY the collection
 * sources a tree actually binds (and to skip the DB read entirely when none do).
 */
export function collectNavCollectionSourceKeys(
  tree: ReadonlyArray<BuilderNode>,
): NavCollectionSourceKey[] {
  const keys = new Set<NavCollectionSourceKey>();
  const visit = (node: BuilderNode) => {
    if (node.kind === "nav") {
      const sourceKey = node.props.dataBinding?.sourceKey;
      if (isNavCollectionSourceKey(sourceKey)) keys.add(sourceKey);
    }
    if ("children" in node && Array.isArray(node.children)) {
      for (const child of node.children) visit(child);
    }
  };
  for (const node of tree) visit(node);
  return [...keys];
}

interface PageNavRow {
  title: string | null;
  slug: string;
}

interface PostNavRow {
  title: string | null;
  slug: string;
}

/**
 * Resolve a set of nav collection sourceKeys → render records keyed by sourceKey
 * (the `dataSources.collections` shape). Only the requested + recognised keys
 * are queried; an unknown key is skipped. Returns `{}` when nothing resolves so
 * a bound nav simply falls back to its static links.
 */
export async function resolveNavCollectionDataSources(
  supabase: SupabaseClient,
  tenantId: string,
  sourceKeys: ReadonlyArray<string>,
  locale: string,
): Promise<Record<string, ReadonlyArray<BuilderDataSourceRecord>>> {
  const wanted = new Set(
    sourceKeys.filter((k): k is NavCollectionSourceKey =>
      isNavCollectionSourceKey(k),
    ),
  );
  if (wanted.size === 0 || !tenantId) return {};

  const out: Record<string, ReadonlyArray<BuilderDataSourceRecord>> = {};

  if (wanted.has("cms_page")) {
    const { data } = await supabase
      .from("cms_pages")
      .select("title, slug")
      .eq("tenant_id", tenantId)
      .eq("locale", locale)
      .eq("status", "published")
      .is("system_template_key", null)
      .order("updated_at", { ascending: false })
      .limit(NAV_COLLECTION_MAX_ITEMS)
      .returns<PageNavRow[]>();
    out.cms_page = (data ?? []).map((row) => ({
      label: row.title ?? row.slug,
      title: row.title ?? row.slug,
      slug: row.slug,
      href: `/p/${row.slug}`,
    }));
  }

  if (wanted.has("cms_posts")) {
    const { data } = await supabase
      .from("cms_posts")
      .select("title, slug")
      .eq("tenant_id", tenantId)
      .eq("locale", locale)
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(NAV_COLLECTION_MAX_ITEMS)
      .returns<PostNavRow[]>();
    out.cms_posts = (data ?? []).map((row) => ({
      label: row.title ?? row.slug,
      title: row.title ?? row.slug,
      slug: row.slug,
      href: `/posts/${row.slug}`,
    }));
  }

  return out;
}
