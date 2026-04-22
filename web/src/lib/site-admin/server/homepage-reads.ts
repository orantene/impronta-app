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
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { tagFor } from "@/lib/site-admin";
import type { Locale } from "@/lib/site-admin/locales";
import { previewCookieNameFor } from "@/lib/site-admin/preview/cookie";
import { verifyPreviewJwt } from "@/lib/site-admin/preview/jwt";

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

// ---- preview-aware render entry point ------------------------------------

/**
 * Returns true when this request carries a valid preview cookie for the
 * given tenant. Reads cookies via next/headers — can be called from any
 * server component or server action. Invalid / expired / cross-tenant
 * tokens silently return false (no error UI).
 */
export async function isPreviewActiveForTenant(
  tenantId: string,
): Promise<boolean> {
  if (!tenantId) return false;
  try {
    const jar = await cookies();
    const cookieName = previewCookieNameFor(tenantId);
    const token = jar.get(cookieName)?.value;
    if (!token) return false;
    const result = verifyPreviewJwt(token);
    return result.ok && result.claims.tenantId === tenantId;
  } catch {
    return false;
  }
}

/**
 * Storefront read entry point. When preview is active for this tenant,
 * returns the draft composition (uncached, always fresh). Otherwise
 * returns the published snapshot from cache. Callers should use this
 * instead of calling `loadPublicHomepage` directly — it's a thin wrapper
 * that preserves the cached-publish path for the 99.9% of traffic that
 * isn't previewing.
 */
export async function loadHomepageForRender(
  tenantId: string,
  locale: Locale,
): Promise<PublicHomepage | null> {
  if (await isPreviewActiveForTenant(tenantId)) {
    return loadDraftHomepage(tenantId, locale);
  }
  return loadPublicHomepage(tenantId, locale);
}

// ---- draft read (preview only) -------------------------------------------

/**
 * Uncached draft homepage read — used ONLY when the preview cookie is
 * active for this tenant. Assembles a HomepageSnapshot-shaped payload
 * from live working rows:
 *
 *   - `cms_pages` fields (title / meta_description / hero) are the draft
 *     the admin has been editing; they become the snapshot at publish.
 *   - `cms_page_sections WHERE is_draft=TRUE` give the in-progress slot
 *     composition.
 *   - `cms_sections.props_jsonb` is the live working props for each
 *     referenced section (no separate draft_props column today; the
 *     single props field holds the working state and publish freezes
 *     into the snapshot).
 *
 * Returns `null` when:
 *   - the homepage row doesn't exist (tenant has never opened the
 *     composer)
 *   - there are no draft page_sections AND no live page_sections (truly
 *     empty tenant — nothing to preview)
 *
 * When draft page_sections are empty but live ones exist, we fall
 * through to live composition so preview shows the published state
 * rather than a confusing blank. The preview banner in the admin UI
 * signals that clearly.
 *
 * Never cached: preview reads must always reflect the latest database
 * state so admins see their last save immediately.
 */
export async function loadDraftHomepage(
  tenantId: string,
  locale: Locale,
): Promise<PublicHomepage | null> {
  if (!tenantId) return null;
  // Preview reads use the service-role client. The preview cookie that
  // unlocked this code path is itself authenticated admin proof
  // (HttpOnly, HS256-signed, tenant-scoped). Anon RLS hides draft
  // cms_sections / cms_page_sections; service-role lets us read them for
  // this request without widening public-surface access.
  const supabase = createServiceRoleClient();
  if (!supabase) return null;

  const { data: pageRow, error: pageErr } = await supabase
    .from("cms_pages")
    .select(`
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
      hero,
      published_at,
      template_schema_version,
      version
    `)
    .eq("tenant_id", tenantId)
    .eq("locale", locale)
    .eq("is_system_owned", true)
    .eq("system_template_key", "homepage")
    .maybeSingle();
  if (pageErr || !pageRow) return null;

  const page = pageRow as {
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
    hero: { introTagline?: string } | null;
    published_at: string | null;
    template_schema_version: number;
    version: number;
  };

  // Draft-first: prefer is_draft=TRUE rows; fall through to live when
  // the draft is empty. The admin banner tells them which path rendered.
  const { data: draftRows } = await supabase
    .from("cms_page_sections")
    .select("slot_key, section_id, sort_order, is_draft")
    .eq("tenant_id", tenantId)
    .eq("page_id", page.id)
    .eq("is_draft", true)
    .order("slot_key")
    .order("sort_order");

  let sectionsRows = (draftRows ?? []) as Array<{
    slot_key: string;
    section_id: string;
    sort_order: number;
  }>;

  if (sectionsRows.length === 0) {
    const { data: liveRows } = await supabase
      .from("cms_page_sections")
      .select("slot_key, section_id, sort_order, is_draft")
      .eq("tenant_id", tenantId)
      .eq("page_id", page.id)
      .eq("is_draft", false)
      .order("slot_key")
      .order("sort_order");
    sectionsRows = (liveRows ?? []) as typeof sectionsRows;
  }

  const sectionIds = sectionsRows.map((r) => r.section_id);
  let sectionsById = new Map<
    string,
    {
      id: string;
      section_type_key: string;
      schema_version: number;
      name: string;
      props_jsonb: Record<string, unknown>;
      status: string;
    }
  >();
  if (sectionIds.length > 0) {
    const { data: sRows } = await supabase
      .from("cms_sections")
      .select(
        "id, section_type_key, schema_version, name, props_jsonb, status",
      )
      .eq("tenant_id", tenantId)
      .in("id", sectionIds);
    const list = (sRows ?? []) as Array<{
      id: string;
      section_type_key: string;
      schema_version: number;
      name: string;
      props_jsonb: Record<string, unknown>;
      status: string;
    }>;
    sectionsById = new Map(list.map((s) => [s.id, s]));
  }

  const slots: HomepageSnapshot["slots"] = [];
  for (const row of sectionsRows) {
    const s = sectionsById.get(row.section_id);
    if (!s) continue; // section was archived or deleted; skip silently
    slots.push({
      slotKey: row.slot_key,
      sortOrder: row.sort_order,
      sectionId: s.id,
      sectionTypeKey: s.section_type_key,
      schemaVersion: s.schema_version,
      name: s.name,
      props: s.props_jsonb ?? {},
    });
  }

  // Produce a HomepageSnapshot that renders through the same dispatcher
  // as the published snapshot.
  const snapshot: HomepageSnapshot = {
    version: 1,
    publishedAt: page.published_at ?? new Date().toISOString(),
    pageVersion: page.version,
    locale: page.locale,
    fields: {
      title: page.title,
      metaDescription: page.meta_description,
      introTagline:
        typeof page.hero?.introTagline === "string"
          ? page.hero.introTagline
          : null,
    },
    templateSchemaVersion: page.template_schema_version,
    slots,
  };

  return {
    pageId: page.id,
    tenantId: page.tenant_id,
    locale: page.locale,
    title: page.title,
    metaTitle: page.meta_title,
    metaDescription: page.meta_description,
    ogTitle: page.og_title,
    ogDescription: page.og_description,
    ogImageUrl: page.og_image_url,
    ogImageMediaAssetId: page.og_image_media_asset_id,
    // Preview is never indexable even if the admin set noindex=false.
    noindex: true,
    canonicalUrl: page.canonical_url,
    publishedAt: page.published_at ?? "",
    version: page.version,
    templateSchemaVersion: page.template_schema_version,
    snapshot,
  };
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
