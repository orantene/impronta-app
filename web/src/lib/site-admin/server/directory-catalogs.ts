"use server";

/**
 * Phase 2b — Directory section drawer ↔ live tenant catalog writes.
 *
 * The directory drawer (sections/directory/Editor.tsx) holds two kinds of
 * state:
 *
 *   1. SECTION PAYLOAD (Zod-validated `DirectoryV1`) — section-instance
 *      knobs that live inside `cms_page_sections.props_v1`. Already wired
 *      end-to-end via `upsertSection`.
 *
 *   2. LIVE TENANT CATALOGS — three SaaS-scoped tables/columns whose
 *      values control the rendered sidebar across ALL directory instances
 *      for a tenant:
 *        - `directory_sidebar_layout` (per-tenant row): item_order,
 *          filter_option_search_visible, section_collapsed_defaults,
 *          top_bar_facet_key, field_visibility_overrides.
 *        - `field_definitions.directory_filter_visible` (per field):
 *          whether a field appears as a sidebar facet at all.
 *        - `field_definitions.card_visible` (per field): whether the
 *          field is eligible to render on the directory card.
 *
 * Phase 2 wired (1). This module wires (2) — without it, a producer
 * toggling "hide height filter" in the drawer would only change the
 * section's local intent and the live sidebar would keep rendering
 * height. (Lane brief, Phase 2b.)
 *
 * AUTH: `requireStaff` (admin/coord) + `requireTenantScope`. Every write
 * is keyed by `scope.tenantId` — the tenant-isolation invariant.
 *
 * READ CONTRACT: the reader for the sidebar layout is
 * `fetchDirectorySidebarLayout` (lib/directory/directory-sidebar-layout.ts).
 * It only consumes the existing column set; we preserve those shapes
 * verbatim. The card-visible reader is `directory-card-display-catalog`;
 * it filters `field_definitions` on `card_visible = true` with no tenant
 * predicate, so writes against canonical (tenant_id IS NULL) rows
 * propagate to every tenant. To keep writes tenant-safe we always
 * UPSERT a tenant-local override row (`tenant_id = scope.tenantId`).
 *
 * SCHEMA LIMITATION (worth documenting): the legacy migration
 * `20260411230000_directory_sidebar_filter_layout.sql` defined
 * `directory_sidebar_layout` as a SINGLETON (`PRIMARY KEY DEFAULT 1`,
 * `CHECK (id = 1)`). Phase 1.B added `tenant_id` and backfilled the
 * single row to Impronta, but never relaxed the singleton constraint.
 * That means at most ONE physical row can exist in the table. Today
 * (multi-tenant pilot), this is acceptable — every tenant other than
 * Impronta falls through to `DEFAULT_LAYOUT`. When a second tenant ever
 * needs custom layout, a migration must drop the singleton constraint
 * and switch the PK to `tenant_id`. We work around that here by
 * UPDATE-then-INSERT (with id=1) and surfacing an explicit error if
 * INSERT collides — never silently swallowing.
 */

import { revalidateTag } from "next/cache";
import { z } from "zod";

import { requireStaff } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { CACHE_TAG_DIRECTORY } from "@/lib/cache-tags";
import { tagFor } from "@/lib/site-admin/cache-tags";
import {
  DIRECTORY_SIDEBAR_FILTER_SEARCH_KEY,
  parseFieldVisibilityOverrides,
  parseSectionCollapsedDefaults,
} from "@/lib/directory/directory-sidebar-layout";

// ──────────────────────────────────────────────────────────────────────
// Common types + helpers
// ──────────────────────────────────────────────────────────────────────

export type CatalogActionResult =
  | { ok: true }
  | { ok: false; error: string };

type GuardedScope = {
  tenantId: string;
  actorId: string;
  admin: NonNullable<ReturnType<typeof createServiceRoleClient>>;
};

async function guardCatalogScope(): Promise<
  { ok: true; scope: GuardedScope } | { ok: false; error: string }
> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) return { ok: false, error: "Pick an agency workspace first." };
  const admin = createServiceRoleClient();
  if (!admin) {
    return { ok: false, error: "Server is missing service-role credentials." };
  }
  return {
    ok: true,
    scope: { tenantId: scope.tenantId, actorId: auth.user.id, admin },
  };
}

function bustDirectoryCaches(tenantId: string): void {
  try {
    // Global directory catalog tag (used by directory-card-display-catalog,
    // directory-filter-catalog, field-driven-filters).
    revalidateTag(CACHE_TAG_DIRECTORY, "default");
    // Tenant storefront tag (catch-all for rendered storefront).
    revalidateTag(tagFor(tenantId, "storefront"), "default");
  } catch {
    // Tag system may not be initialised in test contexts.
  }
}

// ──────────────────────────────────────────────────────────────────────
// Read: current live layout (for drawer prefill)
// ──────────────────────────────────────────────────────────────────────

export type DirectoryLiveCatalogSnapshot = {
  sidebar: {
    itemOrder: string[];
    filterOptionSearchVisible: boolean;
    sectionCollapsedDefaults: Record<string, boolean>;
    topBarFacetKey: string | null;
    fieldVisibilityOverrides: Record<string, boolean>;
  };
};

export async function readDirectoryLiveCatalogSnapshot(): Promise<
  { ok: true; data: DirectoryLiveCatalogSnapshot } | { ok: false; error: string }
> {
  const guard = await guardCatalogScope();
  if (!guard.ok) return guard;
  const { admin, tenantId } = guard.scope;

  const { data, error } = await admin
    .from("directory_sidebar_layout")
    .select(
      "item_order, filter_option_search_visible, section_collapsed_defaults, top_bar_facet_key, field_visibility_overrides",
    )
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) {
    // Tolerant of older replicas missing newer columns — match reader behaviour.
    return {
      ok: true,
      data: {
        sidebar: {
          itemOrder: [DIRECTORY_SIDEBAR_FILTER_SEARCH_KEY],
          filterOptionSearchVisible: true,
          sectionCollapsedDefaults: {},
          topBarFacetKey: "talent_type",
          fieldVisibilityOverrides: {},
        },
      },
    };
  }

  const row = (data ?? null) as
    | {
        item_order?: unknown;
        filter_option_search_visible?: boolean;
        section_collapsed_defaults?: unknown;
        top_bar_facet_key?: string | null;
        field_visibility_overrides?: unknown;
      }
    | null;

  const itemOrder = Array.isArray(row?.item_order)
    ? row!.item_order.filter((x): x is string => typeof x === "string" && x.length > 0)
    : [DIRECTORY_SIDEBAR_FILTER_SEARCH_KEY];

  return {
    ok: true,
    data: {
      sidebar: {
        itemOrder: itemOrder.length > 0 ? itemOrder : [DIRECTORY_SIDEBAR_FILTER_SEARCH_KEY],
        filterOptionSearchVisible: Boolean(row?.filter_option_search_visible ?? true),
        sectionCollapsedDefaults: parseSectionCollapsedDefaults(row?.section_collapsed_defaults),
        topBarFacetKey:
          typeof row?.top_bar_facet_key === "string" && row.top_bar_facet_key.trim().length > 0
            ? row.top_bar_facet_key.trim()
            : null,
        fieldVisibilityOverrides: parseFieldVisibilityOverrides(row?.field_visibility_overrides),
      },
    },
  };
}

// ──────────────────────────────────────────────────────────────────────
// Write: directory_sidebar_layout (full upsert)
// ──────────────────────────────────────────────────────────────────────

const sidebarLayoutInput = z.object({
  itemOrder: z
    .array(z.string().min(1).max(120))
    .max(64)
    .default([DIRECTORY_SIDEBAR_FILTER_SEARCH_KEY]),
  filterOptionSearchVisible: z.boolean().default(true),
  sectionCollapsedDefaults: z.record(z.string(), z.boolean()).default({}),
  topBarFacetKey: z
    .string()
    .min(1)
    .max(120)
    .nullable()
    .default(null),
  fieldVisibilityOverrides: z.record(z.string(), z.boolean()).default({}),
});

export type SidebarLayoutInput = z.input<typeof sidebarLayoutInput>;

/**
 * Idempotent upsert of the full sidebar layout row for the active tenant.
 * UPDATE-first; INSERT-fallback if no row yet. Tenant-scoped on both
 * paths. Triggers a directory cache bust on success.
 *
 * Round-trip contract: the values written here are parsed back by
 * `fetchDirectorySidebarLayout` and rendered by
 * `components/directory/directory-filters-sidebar.tsx`.
 */
export async function saveDirectorySidebarLayout(
  raw: SidebarLayoutInput,
): Promise<CatalogActionResult> {
  const guard = await guardCatalogScope();
  if (!guard.ok) return guard;
  const { admin, tenantId } = guard.scope;

  const parsed = sidebarLayoutInput.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: `invalid layout: ${parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
    };
  }

  // Normalise: only allow `true` in section_collapsed_defaults (matches
  // reader's parseSectionCollapsedDefaults which drops `false` entries).
  const collapsed: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(parsed.data.sectionCollapsedDefaults)) {
    if (v === true) collapsed[k] = true;
  }

  const payload = {
    item_order: parsed.data.itemOrder,
    filter_option_search_visible: parsed.data.filterOptionSearchVisible,
    section_collapsed_defaults: collapsed,
    top_bar_facet_key: parsed.data.topBarFacetKey,
    // Keep the legacy boolean in sync with the new facet-key column so a
    // replica that hasn't run the top_bar_facet_key migration still
    // renders the talent-type top bar correctly.
    talent_type_top_bar_visible: parsed.data.topBarFacetKey === "talent_type",
    field_visibility_overrides: parsed.data.fieldVisibilityOverrides,
    updated_at: new Date().toISOString(),
  };

  // UPDATE-first.
  const upd = await admin
    .from("directory_sidebar_layout")
    .update(payload)
    .eq("tenant_id", tenantId)
    .select("tenant_id")
    .maybeSingle();

  if (upd.error) {
    return { ok: false, error: `update failed: ${upd.error.message}` };
  }
  if (upd.data) {
    bustDirectoryCaches(tenantId);
    return { ok: true };
  }

  // INSERT fallback (no row yet for this tenant).
  // NOTE: the legacy schema defines `id` as a singleton (CHECK id=1).
  // If a row for another tenant already exists with id=1, this INSERT
  // will fail explicitly — we surface it rather than silently swallow.
  const ins = await admin
    .from("directory_sidebar_layout")
    .insert({
      ...payload,
      tenant_id: tenantId,
    });
  if (ins.error) {
    return {
      ok: false,
      error: `insert failed: ${ins.error.message} (legacy singleton constraint? requires schema migration to lift CHECK (id=1) before a second tenant can hold a row)`,
    };
  }

  bustDirectoryCaches(tenantId);
  return { ok: true };
}

// ──────────────────────────────────────────────────────────────────────
// Convenience: targeted updates (preserve other knobs)
// ──────────────────────────────────────────────────────────────────────

/**
 * Toggle a single facet's visibility in the public sidebar. Reads the
 * current row, merges, and writes — preserves all other knobs.
 * `visible = true`  → remove key from overrides (default visible).
 * `visible = false` → set key=false in overrides (hidden).
 */
export async function setDirectoryFieldSidebarVisibility(
  fieldKey: string,
  visible: boolean,
): Promise<CatalogActionResult> {
  const key = String(fieldKey ?? "").trim();
  if (!key) return { ok: false, error: "fieldKey required" };

  const snap = await readDirectoryLiveCatalogSnapshot();
  if (!snap.ok) return snap;

  const next = { ...snap.data.sidebar.fieldVisibilityOverrides };
  if (visible) {
    delete next[key];
  } else {
    next[key] = false;
  }

  return saveDirectorySidebarLayout({
    itemOrder: snap.data.sidebar.itemOrder,
    filterOptionSearchVisible: snap.data.sidebar.filterOptionSearchVisible,
    sectionCollapsedDefaults: snap.data.sidebar.sectionCollapsedDefaults,
    topBarFacetKey: snap.data.sidebar.topBarFacetKey,
    fieldVisibilityOverrides: next,
  });
}

/** Reorder sidebar items. Replaces `item_order` wholesale. */
export async function setDirectorySidebarItemOrder(
  itemOrder: string[],
): Promise<CatalogActionResult> {
  const snap = await readDirectoryLiveCatalogSnapshot();
  if (!snap.ok) return snap;

  return saveDirectorySidebarLayout({
    itemOrder,
    filterOptionSearchVisible: snap.data.sidebar.filterOptionSearchVisible,
    sectionCollapsedDefaults: snap.data.sidebar.sectionCollapsedDefaults,
    topBarFacetKey: snap.data.sidebar.topBarFacetKey,
    fieldVisibilityOverrides: snap.data.sidebar.fieldVisibilityOverrides,
  });
}

/** Top facet bar mode mapping — keeps the legacy boolean column in sync. */
export async function setDirectoryTopBarFacetKey(
  topBarFacetKey: string | null,
): Promise<CatalogActionResult> {
  const snap = await readDirectoryLiveCatalogSnapshot();
  if (!snap.ok) return snap;

  return saveDirectorySidebarLayout({
    itemOrder: snap.data.sidebar.itemOrder,
    filterOptionSearchVisible: snap.data.sidebar.filterOptionSearchVisible,
    sectionCollapsedDefaults: snap.data.sidebar.sectionCollapsedDefaults,
    topBarFacetKey,
    fieldVisibilityOverrides: snap.data.sidebar.fieldVisibilityOverrides,
  });
}

/** Filter-search-box visibility on the public sidebar. */
export async function setDirectoryFilterOptionSearchVisible(
  visible: boolean,
): Promise<CatalogActionResult> {
  const snap = await readDirectoryLiveCatalogSnapshot();
  if (!snap.ok) return snap;

  return saveDirectorySidebarLayout({
    itemOrder: snap.data.sidebar.itemOrder,
    filterOptionSearchVisible: visible,
    sectionCollapsedDefaults: snap.data.sidebar.sectionCollapsedDefaults,
    topBarFacetKey: snap.data.sidebar.topBarFacetKey,
    fieldVisibilityOverrides: snap.data.sidebar.fieldVisibilityOverrides,
  });
}

/** Per-section collapsed default toggle. */
export async function setDirectorySectionCollapsedDefault(
  sectionKey: string,
  collapsed: boolean,
): Promise<CatalogActionResult> {
  const key = String(sectionKey ?? "").trim();
  if (!key) return { ok: false, error: "sectionKey required" };

  const snap = await readDirectoryLiveCatalogSnapshot();
  if (!snap.ok) return snap;

  const next = { ...snap.data.sidebar.sectionCollapsedDefaults };
  if (collapsed) {
    next[key] = true;
  } else {
    delete next[key];
  }

  return saveDirectorySidebarLayout({
    itemOrder: snap.data.sidebar.itemOrder,
    filterOptionSearchVisible: snap.data.sidebar.filterOptionSearchVisible,
    sectionCollapsedDefaults: next,
    topBarFacetKey: snap.data.sidebar.topBarFacetKey,
    fieldVisibilityOverrides: snap.data.sidebar.fieldVisibilityOverrides,
  });
}

// ──────────────────────────────────────────────────────────────────────
// field_definitions writes (card_visible + directory_filter_visible)
// ──────────────────────────────────────────────────────────────────────

/**
 * Tenant-safe write for `field_definitions.card_visible`.
 *
 * Strategy:
 *   - If a tenant-local row exists for `(tenant_id, key)` → UPDATE that row.
 *   - Otherwise → INSERT a tenant-local override row that clones the
 *     canonical row's required columns and flips `card_visible`.
 *
 * We never mutate the canonical (tenant_id IS NULL) row — that would
 * propagate to every tenant.
 */
export async function setFieldCardVisible(
  fieldKey: string,
  cardVisible: boolean,
): Promise<CatalogActionResult> {
  const guard = await guardCatalogScope();
  if (!guard.ok) return guard;
  const { admin, tenantId } = guard.scope;

  const key = String(fieldKey ?? "").trim();
  if (!key) return { ok: false, error: "fieldKey required" };

  return upsertTenantLocalFieldFlag(admin, tenantId, key, { card_visible: cardVisible });
}

/**
 * Tenant-safe write for `field_definitions.directory_filter_visible`.
 * Same strategy as setFieldCardVisible.
 */
export async function setFieldDirectoryFilterVisible(
  fieldKey: string,
  directoryFilterVisible: boolean,
): Promise<CatalogActionResult> {
  const guard = await guardCatalogScope();
  if (!guard.ok) return guard;
  const { admin, tenantId } = guard.scope;

  const key = String(fieldKey ?? "").trim();
  if (!key) return { ok: false, error: "fieldKey required" };

  return upsertTenantLocalFieldFlag(admin, tenantId, key, {
    directory_filter_visible: directoryFilterVisible,
  });
}

async function upsertTenantLocalFieldFlag(
  admin: NonNullable<ReturnType<typeof createServiceRoleClient>>,
  tenantId: string,
  fieldKey: string,
  patch: { card_visible?: boolean; directory_filter_visible?: boolean },
): Promise<CatalogActionResult> {
  // Look for an existing tenant-local row first.
  const existing = await admin
    .from("field_definitions")
    .select("id, tenant_id")
    .eq("tenant_id", tenantId)
    .eq("key", fieldKey)
    .maybeSingle();

  if (existing.error) {
    return { ok: false, error: `field lookup failed: ${existing.error.message}` };
  }

  if (existing.data) {
    const upd = await admin
      .from("field_definitions")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", existing.data.id)
      .eq("tenant_id", tenantId);
    if (upd.error) {
      return { ok: false, error: `update failed: ${upd.error.message}` };
    }
    bustDirectoryCaches(tenantId);
    return { ok: true };
  }

  // No tenant-local row → clone canonical to a tenant-local override.
  const canonical = await admin
    .from("field_definitions")
    .select(
      "field_group_id, key, label_en, label_es, help_en, help_es, value_type, required_level, public_visible, internal_only, card_visible, profile_visible, filterable, directory_filter_visible, directory_filter_sort_order, searchable, ai_visible, editable_by_talent, editable_by_staff, editable_by_admin, active, sort_order, taxonomy_kind, config",
    )
    .is("tenant_id", null)
    .eq("key", fieldKey)
    .maybeSingle();

  if (canonical.error) {
    return { ok: false, error: `canonical lookup failed: ${canonical.error.message}` };
  }
  if (!canonical.data) {
    return {
      ok: false,
      error: `no canonical field_definitions row for key="${fieldKey}" — can't seed a tenant-local override`,
    };
  }

  const ins = await admin.from("field_definitions").insert({
    ...canonical.data,
    ...patch,
    tenant_id: tenantId,
  });
  if (ins.error) {
    return { ok: false, error: `insert failed: ${ins.error.message}` };
  }
  bustDirectoryCaches(tenantId);
  return { ok: true };
}
