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
 *     (legacy body-only page). Public callers currently fall through to the
 *     rich-text renderer as a transitional path.
 *
 * Phase-3 note: snapshot-null fallback is intentional legacy compatibility,
 * not target-state. Backfill/removal sequencing is tracked in
 * `docs/saas/page-builder-package-audit-2026-05-06.md`.
 *
 * **Edit / preview canvas:** `loadPublicPage` only exposes **published**
 * snapshots. While preview or in-place edit mode is active, use
 * {@link loadPageForRender} so the storefront builds the canvas from **draft**
 * `cms_page_sections` rows — matching `EditProvider` and fixing insert lag where
 * the navigator updated but the server-rendered canvas did not.
 */

import { improntaLog } from "@/lib/server/structured-log";
import { unstable_cache } from "next/cache";

import type { Locale as I18nLocale } from "@/i18n/config";
import {
  DEFAULT_PLATFORM_LOCALE,
  isLocale as isPlatformLocale,
  type Locale as PlatformLocale,
} from "@/lib/site-admin/locales";
import type { LegacySnapshotSlot } from "@/lib/site-admin/builder-node/snapshot-slot-bridge";
import { resolveSnapshotBuilderTree } from "@/lib/site-admin/builder-node/snapshot-tree";
import { tagFor } from "@/lib/site-admin/cache-tags";
import { loadTenantLocaleSettings } from "@/lib/site-admin/server/locale-resolver";
import { isPreviewActiveForTenant } from "@/lib/site-admin/server/homepage-reads";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { createServiceRoleClient } from "@/lib/supabase/admin";
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
  locale: I18nLocale,
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
        void improntaLog("site_admin_page_reads.warn", {
          message: "[site-admin/page-reads] public page load failed",
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
      // Defensive 300s safety-net TTL — Vercel's Data Cache persists
      // across deploys; `revalidateTag` can't cross runtimes. Bounds
      // staleness for cross-runtime / older-cached edge cases. Same
      // pattern as homepage-reads.ts.
      revalidate: 300,
    },
  )();
}

function snapshotSlotsToLegacy(slots: HomepageSnapshot["slots"]): LegacySnapshotSlot[] {
  return slots.map((slot) => ({
    slotKey: slot.slotKey,
    sortOrder: slot.sortOrder,
    sectionId: slot.sectionId,
    sectionTypeKey: slot.sectionTypeKey,
    name: slot.name,
    props: slot.props,
  }));
}

/**
 * Uncached draft-first read for a single CMS page by slug — mirrors
 * `loadDraftHomepage` discipline so preview + edit-mode canvases match the
 * composer (draft junction rows, live section props).
 */
export async function loadDraftCmsPageBySlug(
  tenantId: string,
  locale: I18nLocale,
  slug: string,
): Promise<PublicPageWithSnapshot | null> {
  if (!tenantId || !slug) return null;
  const supabase = createServiceRoleClient();
  if (!supabase) return null;

  const requestedLocale: PlatformLocale = isPlatformLocale(locale)
    ? locale
    : DEFAULT_PLATFORM_LOCALE;

  const PAGE_SELECT = `
      id,
      tenant_id,
      locale,
      slug,
      title,
      status,
      meta_title,
      meta_description,
      og_title,
      og_description,
      og_image_url,
      noindex,
      canonical_url,
      template_schema_version,
      version,
      published_at,
      system_template_key
    `;

  type DraftPageRow = {
    id: string;
    tenant_id: string;
    locale: string;
    slug: string | null;
    title: string;
    status: string;
    meta_title: string | null;
    meta_description: string | null;
    og_title: string | null;
    og_description: string | null;
    og_image_url: string | null;
    noindex: boolean;
    canonical_url: string | null;
    template_schema_version: number;
    version: number;
    published_at: string | null;
    system_template_key: string | null;
  };

  let pageRow: DraftPageRow | null = null;

  const { data: strictMatch, error: strictErr } = await supabase
    .from("cms_pages")
    .select(PAGE_SELECT)
    .eq("tenant_id", tenantId)
    .eq("locale", requestedLocale)
    .eq("slug", slug)
    .neq("status", "archived")
    .maybeSingle<DraftPageRow>();

  if (!strictErr && strictMatch) {
    pageRow = strictMatch;
  } else {
    const { data: looseList, error: looseErr } = await supabase
      .from("cms_pages")
      .select(PAGE_SELECT)
      .eq("tenant_id", tenantId)
      .eq("slug", slug)
      .neq("status", "archived");

    if (looseErr) return null;
    const list = (looseList ?? []) as DraftPageRow[];
    if (list.length === 0) return null;
    if (list.length === 1) {
      pageRow = list[0]!;
    } else {
      const tenantLocales = await loadTenantLocaleSettings(tenantId);
      pageRow =
        list.find((r) => r.locale === requestedLocale) ??
        list.find((r) => r.locale === tenantLocales.defaultLocale) ??
        list[0]!;
    }
  }

  if (!pageRow) return null;

  const pr = pageRow;

  if (pr.system_template_key === "homepage") return null;

  const { data: draftRows } = await supabase
    .from("cms_page_sections")
    .select("slot_key, section_id, sort_order")
    .eq("tenant_id", tenantId)
    .eq("page_id", pr.id)
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
      .select("slot_key, section_id, sort_order")
      .eq("tenant_id", tenantId)
      .eq("page_id", pr.id)
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
      .select("id, section_type_key, schema_version, name, props_jsonb, status")
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
    if (!s) continue;
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

  const { data: revisionRow } = await supabase
    .from("cms_page_revisions")
    .select("snapshot")
    .eq("tenant_id", tenantId)
    .eq("page_id", pr.id)
    .eq("version", pr.version)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ snapshot: { builderTree?: unknown } | null }>();

  const preferredBuilderTree =
    revisionRow?.snapshot &&
    typeof revisionRow.snapshot === "object" &&
    "builderTree" in revisionRow.snapshot
      ? revisionRow.snapshot.builderTree
      : undefined;

  const resolvedBuilderTree = resolveSnapshotBuilderTree({
    slots: snapshotSlotsToLegacy(slots),
    builderTree: preferredBuilderTree,
  });

  const snapshotLocale: PlatformLocale = isPlatformLocale(pr.locale)
    ? pr.locale
    : DEFAULT_PLATFORM_LOCALE;

  const snapshot: HomepageSnapshot = {
    version: 1,
    publishedAt: pr.published_at ?? new Date().toISOString(),
    pageVersion: pr.version,
    locale: snapshotLocale,
    fields: {
      title: pr.title,
      metaDescription: pr.meta_description,
      introTagline: null,
    },
    templateSchemaVersion: pr.template_schema_version,
    slots,
    builderTree: resolvedBuilderTree.tree,
  };

  return {
    pageId: pr.id,
    slug: pr.slug ?? "",
    locale: pr.locale,
    title: pr.title,
    metaTitle: pr.meta_title,
    metaDescription: pr.meta_description,
    ogTitle: pr.og_title,
    ogDescription: pr.og_description,
    ogImageUrl: pr.og_image_url,
    noindex: pr.noindex,
    canonicalUrl: pr.canonical_url,
    snapshot,
  };
}

/**
 * Storefront entry for `/p/:slug` composition: published snapshot for visitors;
 * draft-first snapshot when preview or in-place edit mode is active (same
 * contract as `loadHomepageForRender` on the agency homepage).
 */
export async function loadPageForRender(
  tenantId: string,
  locale: I18nLocale,
  slug: string,
): Promise<PublicPageWithSnapshot | null> {
  // Draft reads are gated on the SIGNED preview JWT only. The edit cookie
  // (isEditModeActiveForTenant) is non-HttpOnly + forgeable and must NOT unlock
  // unpublished content. enterEditModeAction sets BOTH the JWT and the cookie,
  // so staff editing still see drafts; a lone (forged / expired-JWT) cookie sees
  // published only — broken, not privileged. The cookie still drives edit-mode
  // affordances in the rendered output (separate call sites).
  const previewActive = await isPreviewActiveForTenant(tenantId);
  if (previewActive) {
    return loadDraftCmsPageBySlug(tenantId, locale, slug);
  }
  return loadPublicPage(tenantId, locale, slug);
}
