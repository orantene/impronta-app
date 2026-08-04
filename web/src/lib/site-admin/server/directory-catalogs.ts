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
 *   2. LIVE TENANT CATALOGS — the SaaS-scoped state controlling the rendered
 *      sidebar across ALL directory instances for a tenant:
 *        - `directory_sidebar_layout` (per-tenant row): item_order,
 *          filter_option_search_visible, section_collapsed_defaults,
 *          top_bar_facet_key, field_visibility_overrides.
 *        - `profile_field_definitions.show_in_directory_filter` (per field):
 *          whether a field appears as a sidebar facet at all.
 *        - `profile_field_definitions.show_in_directory_card` (per field):
 *          whether the field is eligible to render on the directory card.
 *
 * Phase 2 wired (1). This module wires (2) — without it, a producer
 * toggling "hide height filter" in the drawer would only change the
 * section's local intent and the live sidebar would keep rendering
 * height. (Lane brief, Phase 2b.)
 *
 * AUTH (2026-08-04 fix): `requireSession` + tenant scope (membership proof),
 * NOT `requireStaff`. `requireStaff` checks the GLOBAL `profiles.app_role`
 * and therefore rejected hybrid workspace owners (talent/client-signup users
 * who own a workspace keep `app_role='talent'`/`'client'` — see
 * workspace-lifecycle.ts), even though the workspace layout admits them via
 * the membership-based `agency.workspace.view` capability. Scope resolution
 * (`getTenantScopeBySlug`/`getTenantScope`) fails closed unless the caller
 * has an agency_memberships row for the tenant. Layout writes are keyed by
 * `scope.tenantId` — the tenant-isolation invariant. The GLOBAL System-B
 * field-flag writes additionally require the membership-role capability
 * `agency.site_admin.design.edit` (admin/owner) via `guardCatalogScope`'s
 * `requireCapability` option.
 *
 * READ CONTRACT: the reader for the sidebar layout is
 * `fetchDirectorySidebarLayout` (lib/directory/directory-sidebar-layout.ts).
 * It only consumes the existing column set; we preserve those shapes
 * verbatim. The card/filter visibility reader is the canonical resolver
 * (`public-surface-visibility.ts`), gated on canonical System B
 * (`profile_field_definitions.show_in_directory_*`). T3.2b — System A
 * `field_definitions` is retired; the per-tenant override leg was UNUSED
 * (0 prod rows), so the card/filter visibility writes are now GLOBAL B
 * toggles (propagate to every tenant) rather than tenant-local A overrides.
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

import { requireSession } from "@/lib/server/action-guards";
import { userHasCapability } from "@/lib/access";
import { getTenantScope, getTenantScopeBySlug } from "@/lib/saas/scope";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { CACHE_TAG_DIRECTORY } from "@/lib/cache-tags";
import { tagFor } from "@/lib/site-admin/cache-tags";
import {
  DIRECTORY_SIDEBAR_FILTER_SEARCH_KEY,
  parseFieldVisibilityOverrides,
  parseSectionCollapsedDefaults,
} from "@/lib/directory/directory-sidebar-layout";
import { DIRECTORY_CARD_CANDIDATE_REGISTRY } from "@/lib/field-engine/directory-field-catalog-registry";
import { OLD_TO_NEW_KEY } from "@/lib/fields/legacy-mirror";
import { byLabel } from "@/lib/field-engine/sort-comparators";

// Map a legacy directory field key → canonical System B `field_key`. Covers the
// 17 value-bridge keys (OLD_TO_NEW_KEY) + the self-mapping taxonomy keys + the
// explicit gender/dob remaps. Returns null for A-only keys with no B definition
// (talent_type, location, skills, long_bio, short_bio, the social-URL keys).
const SELF_MAPPING_B_KEYS = new Set<string>([
  "fit_labels",
  "tags",
  "industries",
  "event_types",
  "languages",
]);
const EXPLICIT_A_TO_B: Record<string, string> = {
  gender: "identity.gender",
  date_of_birth: "identity.dob",
};
function aKeyToBFieldKey(aKey: string): string | null {
  if (OLD_TO_NEW_KEY[aKey]) return OLD_TO_NEW_KEY[aKey];
  if (SELF_MAPPING_B_KEYS.has(aKey)) return aKey;
  if (EXPLICIT_A_TO_B[aKey]) return EXPLICIT_A_TO_B[aKey];
  return null;
}

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

async function guardCatalogScope(
  tenantSlug?: string,
  opts?: {
    /**
     * Membership-role capability the caller must hold on the resolved
     * tenant. Pass for writes that mutate GLOBAL canonical System-B flags
     * (`profile_field_definitions.show_in_directory_*`) so only
     * admin/owner-grade members (or platform admins) can flip them.
     */
    requireCapability?: "agency.site_admin.design.edit";
  },
): Promise<{ ok: true; scope: GuardedScope } | { ok: false; error: string }> {
  const auth = await requireSession();
  if (!auth.ok) return { ok: false, error: auth.error };
  // URL-authoritative when the workspace-admin studio passes its slug; falls
  // back to the header/cookie scope for callers without one. A multi-workspace
  // operator whose active_tenant_id cookie points elsewhere would otherwise
  // toggle the wrong tenant's fields (or get "Pick an agency workspace").
  // Membership proof lives HERE: both scope helpers return null unless the
  // caller has an agency_memberships row for the tenant (see module AUTH doc).
  const scope = tenantSlug
    ? await getTenantScopeBySlug(tenantSlug)
    : await getTenantScope();
  if (!scope) return { ok: false, error: "Pick an agency workspace first." };
  if (opts?.requireCapability) {
    const allowed = await userHasCapability(opts.requireCapability, scope.tenantId);
    if (!allowed) return { ok: false, error: "Not authorized." };
  }
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
// Read: card-eligible field candidates (Card Design studio)
// ──────────────────────────────────────────────────────────────────────

export type CardDesignFieldCandidate = {
  key: string;
  label: string;
  /** Whether the field currently renders on talent cards. */
  cardVisible: boolean;
  valueType: string;
};

/**
 * The candidate set the Card Design studio offers as card fields: the frozen
 * public-eligible directory card skeleton (the rows that were `public_visible`
 * + `profile_visible`, active, non-internal in System A), each tagged with its
 * CURRENT card visibility read live from canonical System B
 * (`profile_field_definitions.show_in_directory_card`).
 *
 * T3.2b — System A `field_definitions` is retired. The skeleton (key, label,
 * value_type, sort order) is the frozen registry; the live on/off state is the
 * GLOBAL B flag the directory card display catalog actually reads, so a toggle
 * here (`setFieldCardVisible`) is real and immediate. A candidate key whose B
 * definition does not exist (the A-only keys: talent_type, location, skills,
 * long_bio, short_bio, the social-URL keys) reports `cardVisible=false` — the
 * card display catalog never emits those keys regardless (it only renders the
 * bridged scalar set), so this matches the rendered reality.
 */
export async function readCardDesignFieldCandidates(input?: {
  tenantSlug?: string;
}): Promise<
  { ok: true; data: CardDesignFieldCandidate[] } | { ok: false; error: string }
> {
  const guard = await guardCatalogScope(input?.tenantSlug);
  if (!guard.ok) return guard;
  const { admin } = guard.scope;

  // Live B card-visible state per A key. Map each candidate A key → B field_key,
  // then read `show_in_directory_card` from canonical System B.
  const candidates = DIRECTORY_CARD_CANDIDATE_REGISTRY.filter((r) => r.key !== "fit_labels");
  const aKeyToB = new Map<string, string>();
  for (const r of candidates) {
    const bKey = aKeyToBFieldKey(r.key);
    if (bKey) aKeyToB.set(r.key, bKey);
  }

  const bCardVisibleByBKey = new Map<string, boolean>();
  const bKeys = [...new Set(aKeyToB.values())];
  if (bKeys.length > 0) {
    const bRes = await admin
      .from("profile_field_definitions")
      .select("field_key, show_in_directory_card")
      .in("field_key", bKeys)
      .is("deprecated_at", null);
    if (bRes.error) return { ok: false, error: bRes.error.message };
    for (const row of (bRes.data ?? []) as {
      field_key: string;
      show_in_directory_card: boolean | null;
    }[]) {
      bCardVisibleByBKey.set(row.field_key, Boolean(row.show_in_directory_card));
    }
  }

  const data = candidates
    .map((r) => {
      const bKey = aKeyToB.get(r.key);
      const cardVisible = bKey ? (bCardVisibleByBKey.get(bKey) ?? false) : false;
      return {
        key: r.key,
        label: r.label_en?.trim() || r.key,
        cardVisible,
        valueType: r.value_type,
        sortOrder: typeof r.sort_order === "number" ? r.sort_order : 0,
      };
    })
    .sort((a, b) => a.sortOrder - b.sortOrder || byLabel(a, b))
    .map(({ sortOrder: _sortOrder, ...rest }) => rest);

  return { ok: true, data };
}

// ──────────────────────────────────────────────────────────────────────
// Directory card / filter visibility writes (System B)
// ──────────────────────────────────────────────────────────────────────
//
// T3.2b — these were tenant-local UPSERTs into System A `field_definitions`
// (keyed on `field_definitions.tenant_id`). System A is retired and the
// per-tenant override leg was UNUSED (0 prod override rows). The directory card
// display catalog + filter sidebar now read the GLOBAL canonical flags
// (`profile_field_definitions.show_in_directory_card` /
// `show_in_directory_filter`), so the studio writes those — a global toggle that
// propagates to every rendered card/sidebar immediately. A key with no canonical
// B definition (the A-only keys: talent_type, location, skills, long_bio,
// short_bio, the social-URL keys) cannot be toggled — the directory card/filter
// pipeline never renders those from this flag anyway, so it is a documented
// no-op rather than a silent failure.

/** Global write for `profile_field_definitions.show_in_directory_card`. */
export async function setFieldCardVisible(
  fieldKey: string,
  cardVisible: boolean,
  tenantSlug?: string,
): Promise<CatalogActionResult> {
  const guard = await guardCatalogScope(tenantSlug, {
    requireCapability: "agency.site_admin.design.edit",
  });
  if (!guard.ok) return guard;
  const { admin, tenantId } = guard.scope;

  const key = String(fieldKey ?? "").trim();
  if (!key) return { ok: false, error: "fieldKey required" };

  return updateCanonicalDirectoryFlag(admin, tenantId, key, {
    show_in_directory_card: cardVisible,
  });
}

/** Global write for `profile_field_definitions.show_in_directory_filter`. */
export async function setFieldDirectoryFilterVisible(
  fieldKey: string,
  directoryFilterVisible: boolean,
): Promise<CatalogActionResult> {
  const guard = await guardCatalogScope(undefined, {
    requireCapability: "agency.site_admin.design.edit",
  });
  if (!guard.ok) return guard;
  const { admin, tenantId } = guard.scope;

  const key = String(fieldKey ?? "").trim();
  if (!key) return { ok: false, error: "fieldKey required" };

  return updateCanonicalDirectoryFlag(admin, tenantId, key, {
    show_in_directory_filter: directoryFilterVisible,
  });
}

async function updateCanonicalDirectoryFlag(
  admin: NonNullable<ReturnType<typeof createServiceRoleClient>>,
  tenantId: string,
  fieldKey: string,
  patch: { show_in_directory_card?: boolean; show_in_directory_filter?: boolean },
): Promise<CatalogActionResult> {
  const bFieldKey = aKeyToBFieldKey(fieldKey);
  if (!bFieldKey) {
    // A-only key with no canonical B definition. The directory card/filter
    // pipeline never renders these from the canonical flag, so the toggle has
    // nothing to persist — report it honestly rather than failing or pretending.
    return {
      ok: false,
      error: `field "${fieldKey}" has no canonical System B definition — its directory card/filter visibility is structural and not toggleable here`,
    };
  }

  const upd = await admin
    .from("profile_field_definitions")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("field_key", bFieldKey)
    .is("deprecated_at", null)
    .select("id")
    .maybeSingle();

  if (upd.error) {
    return { ok: false, error: `update failed: ${upd.error.message}` };
  }
  if (!upd.data) {
    return {
      ok: false,
      error: `no canonical profile_field_definitions row for field_key="${bFieldKey}"`,
    };
  }

  bustDirectoryCaches(tenantId);
  return { ok: true };
}
