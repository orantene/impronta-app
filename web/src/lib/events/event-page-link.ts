import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";

/**
 * `events.page_id` — the builder page that IS an event's public page.
 *
 * The column shipped with the events table (…361) and nothing read it until
 * now (Lumina tracker L12). Two readers, both PUBLISHED-ONLY on both sides:
 *
 *  - `resolveLinkedBuilderPage`: from the event route, which builder page to
 *    render instead of the engine view. Read through
 *    `cms_public_pages_for_tenant`, the SECURITY-INVOKER RPC every public CMS
 *    read uses (it sets the tenant GUC the `cms_pages` RLS policy needs; a
 *    direct `.from("cms_pages")` returns nothing to an anonymous visitor).
 *    A draft, an unpublished, or another tenant's page yields null, and the
 *    engine view stays the fallback.
 *  - `resolveLinkedEventSlug`: from the builder page's own URL, which
 *    published event (if any) claims it, so the page can send the visitor to
 *    the event's canonical URL. `events_select_public` admits published rows
 *    only, so an event still in draft claims nothing publicly.
 */

export type LinkedBuilderPage = {
  id: string;
  /** Path slug, possibly multi-segment (`services/photography`). */
  slug: string;
  /** Every published locale row of that slug — the honest hreflang set. */
  publishedLocales: string[];
};

export async function resolveLinkedBuilderPage(
  supabase: SupabaseClient,
  tenantId: string,
  pageId: string | null | undefined,
): Promise<LinkedBuilderPage | null> {
  if (!pageId) return null;
  const { data: page, error } = await supabase
    .rpc("cms_public_pages_for_tenant", { p_tenant_id: tenantId })
    .select("id, slug, status, is_system_owned")
    .eq("id", pageId)
    .maybeSingle<{ id: string; slug: string; status: string; is_system_owned: boolean }>();
  if (error) {
    logServerError("events.linkedBuilderPage", error);
    return null;
  }
  if (!page || page.status !== "published" || page.is_system_owned) return null;
  // The same slug in the tenant's other languages: the RPC returns published
  // rows only, so this is the set of locales the page really exists in.
  const { data: locales, error: locErr } = await supabase
    .rpc("cms_public_pages_for_tenant", { p_tenant_id: tenantId })
    .select("locale")
    .eq("slug", page.slug);
  if (locErr) logServerError("events.linkedBuilderPage/locales", locErr);
  // The RPC's list read types as a row-or-rows union; it is always rows here.
  const localeRows = (locales ?? []) as unknown as Array<{ locale: string }>;
  return {
    id: page.id,
    slug: page.slug,
    publishedLocales: localeRows.map((row) => row.locale),
  };
}

/**
 * The slug of the published event whose `page_id` is one of `pageIds`, or
 * null. `pageIds` is every locale row of one slug (a page is one document in
 * several languages; whichever row the operator picked, the link holds).
 */
export async function resolveLinkedEventSlug(
  supabase: SupabaseClient,
  tenantId: string,
  pageIds: readonly string[],
): Promise<string | null> {
  if (pageIds.length === 0) return null;
  const { data, error } = await supabase
    .from("events")
    .select("slug")
    .eq("tenant_id", tenantId)
    .eq("status", "published")
    .in("page_id", [...pageIds])
    .limit(1)
    .maybeSingle<{ slug: string }>();
  if (error) {
    logServerError("events.linkedEventSlug", error);
    return null;
  }
  return data?.slug ?? null;
}

/**
 * The redirect decision for a builder page URL, by slug: the ids of that
 * slug's published rows, then the event that claims one of them. Null when
 * no published event claims this page (the common case, one extra read).
 */
export async function resolveLinkedEventSlugForPageSlug(
  supabase: SupabaseClient,
  tenantId: string,
  slugPath: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .rpc("cms_public_pages_for_tenant", { p_tenant_id: tenantId })
    .select("id")
    .eq("slug", slugPath);
  if (error) {
    logServerError("events.linkedEventSlugForPageSlug", error);
    return null;
  }
  const ids = ((data ?? []) as unknown as Array<{ id: string }>).map((row) => row.id);
  return resolveLinkedEventSlug(supabase, tenantId, ids);
}
