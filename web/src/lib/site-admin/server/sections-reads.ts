/**
 * Phase 5 / M4 — section reads.
 *
 * `loadSectionByIdForStaff`     — uncached admin editor read. Uses the
 *   caller's staff Supabase client; RLS `cms_sections_staff_all` is the gate.
 *
 * `listSectionsForStaff`        — list for the admin list view, most-
 *   recently-updated first. Matches the pages-list ordering contract —
 *   `updated_at DESC`, single canonical sort. Do not add secondary sorts
 *   unless a reviewer re-verifies cache-tag semantics.
 *
 * `loadSectionRevisionsForStaff` — revision history for a section, newest
 *   first, capped at `limit` (default 50 — guardrail §5 retention target).
 *
 * `loadSectionUsageMapForStaff` — tenant-wide usage summary. Joins
 *   `cms_page_sections` (draft + live) to `cms_pages` and returns one
 *   `SectionUsage` per section id the tenant owns (empty object for
 *   sections with no refs). The list view calls this once per render to
 *   avoid N+1 queries.
 *
 * `loadSectionUsageForStaff`    — single-section variant; the editor and
 *   the SECTION_IN_USE error banner call this to enumerate blocking pages.
 *
 * Cached public reads are intentionally NOT shipped here in M4. Sections
 * are not independently routable — they only render when composed onto
 * pages (or homepage in M5). Public cache entries live with the page that
 * embeds them, invalidated via `sections:{id}` tagging when the admin
 * publishes/archives a section. When M5 composes published sections onto
 * the homepage, the composer's read-path will share this list helper (via
 * tenant-scoped public RPC) rather than adding a parallel surface.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { tagFor } from "@/lib/site-admin";

import type { SectionRevisionRow, SectionRow } from "./sections";

const SECTION_COLUMNS = `
  id,
  tenant_id,
  section_type_key,
  name,
  status,
  schema_version,
  version,
  props_jsonb,
  created_by,
  updated_by,
  created_at,
  updated_at
`;

const REVISION_COLUMNS = `
  id,
  tenant_id,
  section_id,
  kind,
  version,
  schema_version,
  snapshot,
  created_by,
  created_at
`;

/**
 * Load a single section by id for the admin editor. Tenant-scoped via the
 * `tenant_id` filter AND the caller's `is_staff_of_tenant` RLS policy.
 */
export async function loadSectionByIdForStaff(
  supabase: SupabaseClient,
  tenantId: string,
  sectionId: string,
): Promise<SectionRow | null> {
  const { data, error } = await supabase
    .from("cms_sections")
    .select(SECTION_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("id", sectionId)
    .maybeSingle<SectionRow>();
  if (error) {
    console.warn("[site-admin/sections-reads] staff section load failed", {
      tenantId,
      sectionId,
      error: error.message,
    });
    return null;
  }
  return data ?? null;
}

/**
 * List all sections for a tenant, most-recently-updated first. Used by the
 * `/admin/site-settings/sections` list view.
 *
 * Ordering contract: `updated_at DESC`. This is the single canonical sort —
 * any dashboard / picker / composer that renders tenant sections for staff
 * should match. Do not add a secondary sort unless the UI explicitly
 * requires it; extra order terms change cache-tag semantics in a way
 * reviewers must re-verify.
 */
export async function listSectionsForStaff(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<SectionRow[]> {
  const { data, error } = await supabase
    .from("cms_sections")
    .select(SECTION_COLUMNS)
    .eq("tenant_id", tenantId)
    .order("updated_at", { ascending: false });
  if (error) {
    console.warn("[site-admin/sections-reads] staff list failed", {
      tenantId,
      error: error.message,
    });
    return [];
  }
  return (data ?? []) as SectionRow[];
}

// ---- usage (page-reference summary) --------------------------------------

/**
 * Per-page reference of a section. Drawn from cms_page_sections joined to
 * cms_pages; both draft and live composition rows are returned so the
 * operator sees everything that would block a delete (RESTRICT FK is
 * blanket — it does not care whether the reference is draft or live).
 *
 * `isHomepage` is derived from the page row's `is_system_owned` +
 * `system_template_key='homepage'` pair; the storefront routes to system
 * rows via composite key, not slug, so this is the reliable signal.
 */
export interface SectionUsagePageRef {
  pageId: string;
  pageTitle: string;
  pageSlug: string | null;
  pageStatus: "draft" | "published" | "archived";
  templateKey: string;
  /** TRUE when the page row is platform-seeded + keyed 'homepage'. */
  isHomepage: boolean;
  /** TRUE when this particular composition row is `is_draft=TRUE`. */
  isDraftComposition: boolean;
  slotKey: string;
  sortOrder: number;
}

export interface SectionUsage {
  sectionId: string;
  /** TRUE if any reference (draft or live) points at a homepage row. */
  usedByHomepage: boolean;
  /** Every distinct page id that references this section (draft or live). */
  pageRefs: ReadonlyArray<SectionUsagePageRef>;
  /** Total composition rows pointing at this section (draft + live). */
  totalReferences: number;
}

interface PageSectionJoinRow {
  section_id: string;
  slot_key: string;
  sort_order: number;
  is_draft: boolean;
  cms_pages: {
    id: string;
    title: string;
    slug: string | null;
    status: "draft" | "published" | "archived";
    template_key: string;
    is_system_owned: boolean;
    system_template_key: string | null;
  } | null;
}

/**
 * Shape-converter used by both loadSectionUsageForStaff and the map variant.
 * Collapses raw Postgrest join rows into the typed ref shape; drops any
 * join row whose page disappeared between query+render (defensive).
 */
function rowToUsageRef(row: PageSectionJoinRow): SectionUsagePageRef | null {
  const p = row.cms_pages;
  if (!p) return null;
  return {
    pageId: p.id,
    pageTitle: p.title,
    pageSlug: p.slug,
    pageStatus: p.status,
    templateKey: p.template_key,
    isHomepage:
      p.is_system_owned === true && p.system_template_key === "homepage",
    isDraftComposition: row.is_draft,
    slotKey: row.slot_key,
    sortOrder: row.sort_order,
  };
}

/**
 * Usage summary for a single section. Consumed by:
 *   - the editor page (usage row at top; delete-button copy enrichment),
 *   - the SECTION_IN_USE error banner (enumerate blocking pages).
 *
 * Returns a zero-shape (empty refs, usedByHomepage=false) if the section
 * is referenced nowhere — callers can render that uniformly instead of
 * branching on null.
 */
export async function loadSectionUsageForStaff(
  supabase: SupabaseClient,
  tenantId: string,
  sectionId: string,
): Promise<SectionUsage> {
  const { data, error } = await supabase
    .from("cms_page_sections")
    .select(
      `section_id, slot_key, sort_order, is_draft,
       cms_pages:page_id ( id, title, slug, status, template_key, is_system_owned, system_template_key )`,
    )
    .eq("tenant_id", tenantId)
    .eq("section_id", sectionId);
  if (error) {
    console.warn("[site-admin/sections-reads] staff usage failed", {
      tenantId,
      sectionId,
      error: error.message,
    });
    return { sectionId, usedByHomepage: false, pageRefs: [], totalReferences: 0 };
  }

  const rows = (data ?? []) as unknown as PageSectionJoinRow[];
  const refs = rows
    .map(rowToUsageRef)
    .filter((r): r is SectionUsagePageRef => r !== null);

  return {
    sectionId,
    usedByHomepage: refs.some((r) => r.isHomepage),
    pageRefs: refs,
    totalReferences: refs.length,
  };
}

/**
 * Tenant-wide usage summary. Returns a Map keyed by section id. Sections
 * with zero refs are NOT present in the map; callers should treat absence
 * as "unused" (render as 0 / "Not in use"). Used by the admin list view
 * in one query per render.
 *
 * Ordering: none — the map is random-access. The list view already sorts
 * sections by `updated_at DESC` via listSectionsForStaff.
 *
 * Cross-request caching (Phase 5 / M4 follow-up):
 *   The map is wrapped in `unstable_cache` keyed by tenant id and tagged
 *   with both `pages-all` AND `sections-all`. The compose pipeline in
 *   `server/homepage.ts` (page section reorder, save, publish, rollback)
 *   busts `pages-all` on every cms_page_sections mutation; section
 *   create/update/publish/archive/delete in `server/sections.ts` busts
 *   `sections-all`; page metadata save in `server/pages.ts` busts
 *   `pages-all`. Together those cover every input the map depends on.
 *
 *   The inner read uses the service-role client because `unstable_cache`
 *   callbacks can't read request cookies — auth is already enforced by
 *   the caller (admin route guard); the cache barrier just avoids
 *   re-running the join across requests within the same TTL.
 */
const CACHED_USAGE_REVALIDATE_SECONDS = 300;

async function fetchSectionUsageMap(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<Map<string, SectionUsage>> {
  const { data, error } = await supabase
    .from("cms_page_sections")
    .select(
      `section_id, slot_key, sort_order, is_draft,
       cms_pages:page_id ( id, title, slug, status, template_key, is_system_owned, system_template_key )`,
    )
    .eq("tenant_id", tenantId);
  if (error) {
    console.warn("[site-admin/sections-reads] staff usage map failed", {
      tenantId,
      error: error.message,
    });
    return new Map();
  }

  const rows = (data ?? []) as unknown as PageSectionJoinRow[];
  const bySection = new Map<string, SectionUsagePageRef[]>();
  for (const row of rows) {
    const ref = rowToUsageRef(row);
    if (!ref) continue;
    const list = bySection.get(row.section_id);
    if (list) list.push(ref);
    else bySection.set(row.section_id, [ref]);
  }

  const out = new Map<string, SectionUsage>();
  for (const [sectionId, refs] of bySection) {
    out.set(sectionId, {
      sectionId,
      usedByHomepage: refs.some((r) => r.isHomepage),
      pageRefs: refs,
      totalReferences: refs.length,
    });
  }
  return out;
}

/**
 * Serialised payload for the cache layer. `unstable_cache` JSON-encodes
 * its return value; Maps don't survive the round-trip, so we use a flat
 * array on the wire and rebuild the Map after retrieval.
 */
type CachedUsageEntry = {
  sectionId: string;
  usedByHomepage: boolean;
  pageRefs: SectionUsagePageRef[];
  totalReferences: number;
};

async function loadCachedSectionUsageEntries(
  tenantId: string,
): Promise<CachedUsageEntry[]> {
  return unstable_cache(
    async (): Promise<CachedUsageEntry[]> => {
      const supabase = createServiceRoleClient();
      if (!supabase) return [];
      const map = await fetchSectionUsageMap(supabase, tenantId);
      return Array.from(map.values()).map((u) => ({
        sectionId: u.sectionId,
        usedByHomepage: u.usedByHomepage,
        pageRefs: [...u.pageRefs],
        totalReferences: u.totalReferences,
      }));
    },
    ["site-admin:section-usage-map", tenantId],
    {
      tags: [tagFor(tenantId, "pages-all"), tagFor(tenantId, "sections-all")],
      revalidate: CACHED_USAGE_REVALIDATE_SECONDS,
    },
  )();
}

export async function loadSectionUsageMapForStaff(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<ReadonlyMap<string, SectionUsage>> {
  // `supabase` (the staff RLS client) is retained for API compatibility and
  // for environments where the service-role key is missing — we fall back
  // to the staff client uncached rather than returning an empty map.
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    return fetchSectionUsageMap(supabase, tenantId);
  }
  const entries = await loadCachedSectionUsageEntries(tenantId);
  const out = new Map<string, SectionUsage>();
  for (const e of entries) {
    out.set(e.sectionId, {
      sectionId: e.sectionId,
      usedByHomepage: e.usedByHomepage,
      pageRefs: e.pageRefs,
      totalReferences: e.totalReferences,
    });
  }
  return out;
}

/**
 * Load revision history for a section, newest-first. Capped at `limit`
 * (default 50 — matches guardrail §5 retention target). Consumed by the
 * restore-from-revision modal.
 */
export async function loadSectionRevisionsForStaff(
  supabase: SupabaseClient,
  tenantId: string,
  sectionId: string,
  limit = 50,
): Promise<SectionRevisionRow[]> {
  const { data, error } = await supabase
    .from("cms_section_revisions")
    .select(REVISION_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("section_id", sectionId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.warn("[site-admin/sections-reads] staff revisions failed", {
      tenantId,
      sectionId,
      error: error.message,
    });
    return [];
  }
  return (data ?? []) as SectionRevisionRow[];
}
