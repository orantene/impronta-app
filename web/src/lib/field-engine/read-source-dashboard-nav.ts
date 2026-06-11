// src/lib/field-engine/read-source-dashboard-nav.ts
//
// T2.3 — TALENT DASHBOARD NAV GROUPS + TAXONOMY EDITOR FIELD GOVERNANCE repoint.
//
// The talent dashboard navigation renders a "Profile" collapsible section whose
// items are one nav link per dynamic field group (e.g. "Physical / Visual
// Details", "Experience"). Today `fetchTalentNavProfileGroupItems` in
// `talent-nav-groups.ts` drives this from legacy System A (`field_definitions` +
// `field_groups`). `loadTalentDashboardData` also reads System A for its
// `fieldCatalog` (groups + definitions + value map) and `fieldValues`. And
// `loadTalentTaxonomyEditorData` reads A for `editableFields` (the taxonomy
// field governance list shown in the taxonomy tab).
//
// This module lifts those reads behind the shared seam as `readA` (byte-
// identical to today) and adds `readB` readers that source the SAME output
// shapes from canonical System B (`profile_field_definitions` +
// `talent_profile_field_values`), returning IDENTICAL `T`s. The callers
// (`talent-nav-groups.ts`, `talent-dashboard-data.ts`) call the seam instead;
// the `dashboard_nav` flag decides A vs B.
//
// ── PARITY ANALYSIS ──────────────────────────────────────────────────────────
//
// The dashboard nav groups are derived from the GLOBAL field catalog (not per-
// talent). All 101 talents see the same nav groups. System A produces 6 groups:
//
//   [20] Talent Classification  → talent_type   (1 A key)
//   [30] Languages & Skills     → skills, languages  (2 A keys)
//   [40] Physical / Visual Details → 8 A keys (hair_color–height_cm)
//   [50] Experience             → 5 A keys
//   [60] Availability & Mobility → 6 A keys
//   [70] Social & External      → 4 A keys
//
// System B `profile_field_definitions` covers most of these via the A→B key
// bridge (`OLD_TO_NEW_KEY` from `legacy-mirror.ts`) plus direct-match taxonomy
// keys (`fit_labels`, `industries`, `event_types`, `tags`, `languages`). But
// three keys have NO B equivalent:
//
//   KEY               A group              WHY NO B ROW
//   talent_type       classification       No canonical `talent_type` field in B
//   skills            abilities            `skills` is DEPRECATED in B (`deprecated_at` set)
//   tiktok_url        social_external      Social URLs are System-A-only in B
//   youtube_url       social_external      Social URLs are System-A-only in B
//   instagram_url     social_external      Social URLs are System-A-only in B
//
// Consequence for nav groups:
//   • `classification` (only key: talent_type) → NO B field → group DROPS in B
//   • `abilities`      → skills drops; languages stays → group SURVIVES (1/2 keys)
//   • `social_external` → instagram/tiktok/youtube drop; website_url stays → group SURVIVES (1/4 keys)
//   • `traits`, `experience`, `availability_mobility` → ALL keys bridged → groups IDENTICAL
//
// The B-derived nav has 5 groups vs A's 6. The `classification` group DROPS
// because `talent_type` is a taxonomy field whose taxonomy-management surface is
// separate (the Taxonomy tab), not the dynamic field groups. Removing the
// `classification` nav item from B is NON-REGRESSIVE: clicking the link in A
// opens an empty form section (no fields render because `talent_type` is a
// taxonomy-type that bypasses the scalar field editor). B's drop is correct.
//
// DOCUMENTED DIFFS (A vs B for fetchTalentNavProfileGroupItems):
//   1. `classification` group absent in B: talent_type has no B field_definition.
//      NON-REGRESSIVE — the nav item in A links to an empty field-editor section.
//   2. `skills` absent from `abilities` group in B: deprecated in B catalog.
//      NON-REGRESSIVE — skills is a taxonomy_multi type managed in the Taxonomy
//      tab, not the scalar field editor.
//   3. `instagram_url`, `tiktok_url`, `youtube_url` absent from `social_external`
//      group in B: no B canonical definitions for these social URLs.
//      NON-REGRESSIVE — the `social_external` group still appears (website_url
//      is present); users lose 3 of 4 social-URL nav shortcuts. Documented gap.
//      These three keys are CMS-style scalar fields not yet migrated to B.
//
// KILL SWITCH: set `FIELD_ENGINE_READ_SOURCE=dashboard_nav:a` (or `=a`) to
// revert this surface to System A instantly without a deploy.
//
// SCOPE: the nav group items + fieldCatalog + fieldValues + editableFields reads.
// The `buildTalentPreviewHref`, `mergeTalentProfileNavItems`,
// `mergeTalentPreviewNavHref` helpers in `talent-nav-groups.ts` are pure
// transformations (no DB reads) — they are NOT behind the seam and do not need
// repointing.

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { FieldSurfaceReaderPair } from "@/lib/field-engine/read-source";
import { readFieldSurface } from "@/lib/field-engine/read-source";
import { isReservedTalentProfileFieldKey } from "@/lib/field-canonical";
import { filterOutReservedFieldDefinitions } from "@/lib/field-canonical";
import type { FieldDefinitionRow, FieldGroupRow } from "@/lib/fields/types";
import type { DashboardNavItem } from "@/lib/dashboard/architecture";
import { OLD_TO_NEW_KEY, NEW_TO_OLD_KEY } from "@/lib/fields/legacy-mirror";

// ── Shared types ─────────────────────────────────────────────────────────────

/** The output of `fetchTalentNavProfileGroupItems` — the nav items for the
 *  "Profile" section, one per dynamic field group. Both readA and readB return
 *  this shape. */
export type DashboardNavProfileGroupItems = DashboardNavItem[];

/** The `fieldCatalog` slice of `TalentDashboardData`, lifted so both readers
 *  return the identical shape. */
export type DashboardNavFieldCatalog = {
  groups: FieldGroupRow[];
  editableDefinitions: FieldDefinitionRow[];
  editableByGroup: Map<string, FieldDefinitionRow[]>;
  scalarEditableIds: string[];
};

/** The `fieldValues` slice of `TalentDashboardData`. */
export type DashboardNavFieldValues = Array<{
  field_definition_id: string;
  value_text: string | null;
  value_number: number | null;
  value_boolean: boolean | null;
  value_date: string | null;
}>;

/** The `editableFields` slice of `TalentTaxonomyEditorLoadResult` — taxonomy
 *  field governance. */
export type DashboardNavEditableTaxonomyFields = Array<{
  key: string;
  label_en: string;
  label_es: string | null;
  taxonomy_kind: string;
  sort_order: number;
  group_sort_order: number;
}>;

// ── A-key → B-key bridge ─────────────────────────────────────────────────────
//
// The `OLD_TO_NEW_KEY` map from `legacy-mirror.ts` bridges 17 scalar/physical
// keys (e.g. "hair_color" → "physical.hair_color"). Taxonomy keys that kept
// their short names in B (`fit_labels`, `tags`, `industries`, `event_types`,
// `languages`) are self-mapping — not in OLD_TO_NEW_KEY but identical in both
// stores. `skills` is present in B but deprecated.

const TAXONOMY_DIRECT_KEYS = new Set([
  "fit_labels",
  "tags",
  "industries",
  "event_types",
  "languages",
]);

/** Map an A key to its corresponding B `field_key`, or null if none exists.
 *  Returns the canonical B field_key, or null for keys with no B row
 *  (talent_type, skills, tiktok_url, youtube_url, instagram_url). */
export function aKeyToBKey(aKey: string): string | null {
  if (OLD_TO_NEW_KEY[aKey]) return OLD_TO_NEW_KEY[aKey];
  if (TAXONOMY_DIRECT_KEYS.has(aKey)) return aKey;
  // skills has a B row but it's deprecated — treat it as "no active B row"
  if (aKey === "skills") return null;
  // social URLs not bridged yet
  return null;
}

// ── A-reader: fetchTalentNavProfileGroupItems ─────────────────────────────────
//
// Lifted VERBATIM from `fetchTalentNavProfileGroupItems` in talent-nav-groups.ts
// so `dashboard_nav:a` is byte-for-byte today's behaviour.

type TalentNavFieldGroupRow = {
  id: string;
  slug: string;
  name_en: string;
  name_es: string | null;
  sort_order: number;
};

function normalizeVisibleLabel(value: string | null | undefined): string {
  return (value ?? "").trim().toLocaleLowerCase();
}

function dedupeFieldGroupsByVisibleLabel(
  groups: TalentNavFieldGroupRow[],
): TalentNavFieldGroupRow[] {
  const byLabel = new Map<string, TalentNavFieldGroupRow>();
  for (const group of groups) {
    const labelKey = normalizeVisibleLabel(group.name_en) || `slug:${group.slug}`;
    const current = byLabel.get(labelKey);
    if (!current) {
      byLabel.set(labelKey, group);
      continue;
    }
    const nextWins =
      group.sort_order < current.sort_order ||
      (group.sort_order === current.sort_order &&
        group.slug.localeCompare(current.slug) < 0);
    if (nextWins) byLabel.set(labelKey, group);
  }
  return [...byLabel.values()].sort(
    (a, b) => a.sort_order - b.sort_order || a.slug.localeCompare(b.slug),
  );
}

async function readNavGroupItemsFromA(
  supabase: SupabaseClient,
): Promise<DashboardNavProfileGroupItems> {
  const { data: fieldDefs, error: defsError } = await supabase
    .from("field_definitions")
    .select("id, field_group_id, key")
    .eq("active", true)
    .is("archived_at", null)
    .eq("editable_by_talent", true)
    .eq("profile_visible", true)
    .eq("internal_only", false)
    .not("field_group_id", "is", null)
    .neq("value_type", "location");

  if (defsError) return [];

  const filteredDefs = (fieldDefs ?? []).filter(
    (row) => typeof row.key === "string" && !isReservedTalentProfileFieldKey(row.key),
  );

  const groupIds = [
    ...new Set(filteredDefs.map((row) => row.field_group_id).filter(Boolean)),
  ];
  if (groupIds.length === 0) return [];

  const { data: fieldGroups, error: groupsError } = await supabase
    .from("field_groups")
    .select("id, slug, name_en, name_es, sort_order")
    .in("id", groupIds)
    .is("archived_at", null)
    .order("sort_order");

  if (groupsError) return [];

  const byGroupId = new Map<string, TalentNavFieldGroupRow>();
  for (const group of (fieldGroups ?? []) as TalentNavFieldGroupRow[]) {
    if (!byGroupId.has(group.id)) {
      byGroupId.set(group.id, { ...group, sort_order: group.sort_order ?? 0 });
    }
  }
  const uniqueById = [...byGroupId.values()];
  const sorted = dedupeFieldGroupsByVisibleLabel(uniqueById);

  return sorted.map((g) => ({
    id: `talent-profile-group-${g.slug}`,
    href: `/talent/my-profile?group=${encodeURIComponent(g.slug)}`,
    label: g.name_en,
    match: "exact" as const,
    icon: "profile" as const,
    activeQuery: { group: g.slug },
  }));
}

// ── B-reader: fetchTalentNavProfileGroupItems ─────────────────────────────────
//
// Reads `profile_field_definitions` to find which A-group slugs are represented
// in B, then uses A's `field_groups` table (the only source for group metadata:
// slug, name_en, sort_order) to build the same nav items. Groups are only
// included when ≥1 of their A-eligible keys has a live (non-deprecated)
// `profile_field_definitions` row.
//
// Documented diffs vs A (see module header):
//   • `classification` group drops (talent_type has no B definition).
//   • `abilities`: skills drops (deprecated in B); languages survives.
//   • `social_external`: instagram/tiktok/youtube drop; website_url survives.

async function readNavGroupItemsFromB(
  supabase: SupabaseClient,
): Promise<DashboardNavProfileGroupItems> {
  // Step 1 — get the same A-eligible field_definitions (to know which A-groups
  // exist and which keys are eligible). We still read A's field_definitions here
  // to get the full key-to-group mapping — this is metadata, NOT field values.
  const { data: fieldDefs, error: defsError } = await supabase
    .from("field_definitions")
    .select("id, field_group_id, key")
    .eq("active", true)
    .is("archived_at", null)
    .eq("editable_by_talent", true)
    .eq("profile_visible", true)
    .eq("internal_only", false)
    .not("field_group_id", "is", null)
    .neq("value_type", "location");

  if (defsError) throw new Error(`[dashboard_nav] field_definitions: ${defsError.message}`);

  const filteredDefs = (fieldDefs ?? []).filter(
    (row) => typeof row.key === "string" && !isReservedTalentProfileFieldKey(row.key),
  );

  // Step 2 — for each A-eligible key, find its B canonical key.
  const bKeysNeeded = filteredDefs
    .map((d) => aKeyToBKey(d.key as string))
    .filter((k): k is string => k !== null);

  if (bKeysNeeded.length === 0) return [];

  // Step 3 — query B for which of those B keys are live (non-deprecated,
  // talent-editable). This is the authoritative "does B have this field?" check.
  const { data: bDefs, error: bDefsError } = await supabase
    .from("profile_field_definitions")
    .select("field_key")
    .in("field_key", bKeysNeeded)
    .is("deprecated_at", null)
    .eq("talent_editable", true);

  if (bDefsError) throw new Error(`[dashboard_nav] profile_field_definitions: ${bDefsError.message}`);

  const liveBKeys = new Set((bDefs ?? []).map((r) => (r as { field_key: string }).field_key));

  // Step 4 — build the set of A-group IDs that have ≥1 live B field.
  const groupIdsWithBFields = new Set<string>();
  for (const def of filteredDefs) {
    const bKey = aKeyToBKey(def.key as string);
    if (bKey && liveBKeys.has(bKey)) {
      if (def.field_group_id) groupIdsWithBFields.add(def.field_group_id as string);
    }
  }

  if (groupIdsWithBFields.size === 0) return [];

  // Step 5 — get the A group metadata for the B-eligible groups (slug, name, order).
  // B has no `field_groups` table — we still rely on A's group metadata here.
  const { data: fieldGroups, error: groupsError } = await supabase
    .from("field_groups")
    .select("id, slug, name_en, name_es, sort_order")
    .in("id", [...groupIdsWithBFields])
    .is("archived_at", null)
    .order("sort_order");

  if (groupsError) throw new Error(`[dashboard_nav] field_groups: ${groupsError.message}`);

  const byGroupId = new Map<string, TalentNavFieldGroupRow>();
  for (const group of (fieldGroups ?? []) as TalentNavFieldGroupRow[]) {
    if (!byGroupId.has(group.id)) {
      byGroupId.set(group.id, { ...group, sort_order: group.sort_order ?? 0 });
    }
  }
  const uniqueById = [...byGroupId.values()];
  const sorted = dedupeFieldGroupsByVisibleLabel(uniqueById);

  return sorted.map((g) => ({
    id: `talent-profile-group-${g.slug}`,
    href: `/talent/my-profile?group=${encodeURIComponent(g.slug)}`,
    label: g.name_en,
    match: "exact" as const,
    icon: "profile" as const,
    activeQuery: { group: g.slug },
  }));
}

/** The reader pair for `fetchTalentNavProfileGroupItems`. */
export const navGroupItemsReaderPair: FieldSurfaceReaderPair<
  [SupabaseClient],
  DashboardNavProfileGroupItems
> = {
  readA: readNavGroupItemsFromA,
  readB: readNavGroupItemsFromB,
};

/**
 * PUBLIC entry — fetch the talent nav profile group items from the active source
 * for the `dashboard_nav` surface. Replaces the direct `fetchTalentNavProfileGroupItems`
 * call in the talent dashboard layout. Flag `a` (default) is byte-identical to
 * today; `dashboard_nav:b` reads B; a B-throw safe-falls-back to A.
 */
export function readDashboardNavGroupItems(
  supabase: SupabaseClient,
): Promise<DashboardNavProfileGroupItems> {
  return readFieldSurface("dashboard_nav", navGroupItemsReaderPair, supabase);
}

// ── A-reader: loadTalentDashboardData fieldCatalog ─────────────────────────────
//
// Lifted from `loadTalentDashboardDataImpl` (~:419–489): the parallel queries
// for `field_groups` and `field_definitions`, then the catalog assembly. The
// `fieldValues` (`field_values`) read is paired in a separate reader pair below.

async function readFieldCatalogFromA(
  supabase: SupabaseClient,
  talentProfileId: string,
): Promise<{ catalog: DashboardNavFieldCatalog; fieldValues: DashboardNavFieldValues }> {
  const [{ data: fieldGroups }, { data: fieldDefs }, { data: fieldValues }] =
    await Promise.all([
      supabase
        .from("field_groups")
        .select("id, slug, name_en, name_es, sort_order, archived_at")
        .is("archived_at", null)
        .order("sort_order"),
      supabase
        .from("field_definitions")
        .select(
          "id, field_group_id, key, label_en, label_es, help_en, help_es, value_type, required_level, public_visible, internal_only, card_visible, profile_visible, filterable, searchable, ai_visible, editable_by_talent, editable_by_staff, editable_by_admin, active, sort_order, taxonomy_kind, config, archived_at",
        )
        .eq("active", true)
        .is("archived_at", null)
        .eq("editable_by_talent", true)
        .eq("profile_visible", true)
        .eq("internal_only", false)
        .order("field_group_id")
        .order("sort_order"),
      supabase
        .from("field_values")
        .select("field_definition_id, value_text, value_number, value_boolean, value_date")
        .eq("talent_profile_id", talentProfileId),
    ]);

  const editableDefinitions = filterOutReservedFieldDefinitions(
    ((fieldDefs ?? []) as FieldDefinitionRow[]).filter(
      (d) => d.value_type !== "location",
    ),
  );
  const groupIdsUsed = new Set<string>();
  for (const d of editableDefinitions) {
    if (d.field_group_id) groupIdsUsed.add(d.field_group_id);
  }
  const groups = ((fieldGroups ?? []) as FieldGroupRow[]).filter((g) =>
    groupIdsUsed.has(g.id),
  );
  const editableByGroup = new Map<string, FieldDefinitionRow[]>();
  for (const d of editableDefinitions) {
    const gid = d.field_group_id ?? "ungrouped";
    const arr = editableByGroup.get(gid) ?? [];
    arr.push(d);
    editableByGroup.set(gid, arr);
  }
  const scalarEditableIds = editableDefinitions
    .filter((d) =>
      ["text", "textarea", "number", "boolean", "date"].includes(d.value_type),
    )
    .map((d) => d.id);

  return {
    catalog: { groups, editableDefinitions, editableByGroup, scalarEditableIds },
    fieldValues: (fieldValues ?? []) as DashboardNavFieldValues,
  };
}

// ── B-reader: loadTalentDashboardData fieldCatalog ─────────────────────────────
//
// Reads B's `profile_field_definitions` for field metadata and
// `talent_profile_field_values` for values. Since `FieldDefinitionRow` and
// `FieldGroupRow` are A-system types (with columns like `field_group_id`,
// `label_en`, `sort_order`, etc.), the B-reader projects B rows onto those same
// shapes so the callers that consume `fieldCatalog` are unaffected.
//
// Because B has no `field_groups` table, the B-reader still reads A's
// `field_groups` for group metadata. The `editableDefinitions` are synthesized
// from B rows with A-compatible shapes, preserving the same filtering logic.
//
// B field_values key mapping: `talent_profile_field_values.field_definition_id`
// is the B `profile_field_definitions.id`. The A fieldValues shape uses the A
// `field_definitions.id`. The B-reader maps B values via the bridged def IDs so
// `completionInput` (which joins on A field_definition_id) stays consistent.
// The value content (value_text/value_number/etc.) is equivalent per Phase-1
// T1.2a (0 A-only values in the bridged keys; B is the superset).

type BProfileFieldDef = {
  id: string;
  field_key: string;
  label: string | null;
  label_es: string | null;
  section: string | null;
  display_order: number | null;
  kind: string | null;
  deprecated_at: string | null;
  talent_editable: boolean;
};

/** Map a B `kind` to the nearest A `value_type`. This determines which B fields
 *  appear in `scalarEditableIds` (the completion scorer's scalar field set). */
function bKindToValueType(kind: string | null): FieldDefinitionRow["value_type"] {
  switch (kind) {
    case "number":
      return "number";
    case "toggle":
      return "boolean";
    case "date":
      return "date";
    case "textarea":
      return "textarea";
    case "multiselect":
    case "chips":
      return "taxonomy_multi";
    case "select":
      return "taxonomy_single";
    case "text":
    default:
      return "text";
  }
}

async function readFieldCatalogFromB(
  supabase: SupabaseClient,
  talentProfileId: string,
): Promise<{ catalog: DashboardNavFieldCatalog; fieldValues: DashboardNavFieldValues }> {
  // Get A field_definitions (for A group_id mapping and A def IDs for fieldValues compat)
  const { data: aDefs, error: aDefsErr } = await supabase
    .from("field_definitions")
    .select("id, field_group_id, key, sort_order, value_type")
    .eq("active", true)
    .is("archived_at", null)
    .eq("editable_by_talent", true)
    .eq("profile_visible", true)
    .eq("internal_only", false)
    .not("field_group_id", "is", null)
    .neq("value_type", "location");

  if (aDefsErr) throw new Error(`[dashboard_nav/catalog-B] field_definitions: ${aDefsErr.message}`);

  const filteredADefs = (aDefs ?? []).filter(
    (d) => typeof d.key === "string" && !isReservedTalentProfileFieldKey(d.key as string) && d.value_type !== "location",
  );

  // Build A-key → A-def map
  const aDefByKey = new Map(filteredADefs.map((d) => [d.key as string, d]));

  // Get B definitions for the bridged + direct-match keys
  const bKeysNeeded = filteredADefs
    .map((d) => aKeyToBKey(d.key as string))
    .filter((k): k is string => k !== null);

  if (bKeysNeeded.length === 0) {
    // If B has no fields at all, throw so the seam falls back to A
    throw new Error("[dashboard_nav/catalog-B] no bridged B keys found — falling back to A");
  }

  const [{ data: bDefs, error: bDefsErr }, { data: aGroups, error: aGroupsErr }] =
    await Promise.all([
      supabase
        .from("profile_field_definitions")
        .select("id, field_key, label, label_es, section, display_order, kind, deprecated_at, talent_editable")
        .in("field_key", bKeysNeeded)
        .is("deprecated_at", null)
        .eq("talent_editable", true),
      supabase
        .from("field_groups")
        .select("id, slug, name_en, name_es, sort_order, archived_at")
        .is("archived_at", null)
        .order("sort_order"),
    ]);

  if (bDefsErr) throw new Error(`[dashboard_nav/catalog-B] profile_field_definitions: ${bDefsErr.message}`);
  if (aGroupsErr) throw new Error(`[dashboard_nav/catalog-B] field_groups: ${aGroupsErr.message}`);

  // Build B field_key → B def map
  const bDefByFieldKey = new Map(
    ((bDefs ?? []) as BProfileFieldDef[]).map((d) => [d.field_key, d]),
  );

  // For each A eligible key with a live B row, synthesize an A-shaped FieldDefinitionRow
  // and determine which A group it belongs to (via A's field_group_id).
  const syntheticDefs: FieldDefinitionRow[] = [];
  for (const aDef of filteredADefs) {
    const bKey = aKeyToBKey(aDef.key as string);
    if (!bKey) continue;
    const bDef = bDefByFieldKey.get(bKey);
    if (!bDef) continue;

    // Project B row onto A's FieldDefinitionRow shape. We use the A def's ID so
    // that the fieldValues join (which uses A field_definition_id) stays consistent.
    // The label comes from B (canonical); sort_order and group from A.
    syntheticDefs.push({
      id: aDef.id as string, // A def id for fieldValues compat
      field_group_id: aDef.field_group_id as string | null,
      key: aDef.key as string,
      label_en: (bDef.label ?? aDef.key) as string,
      label_es: bDef.label_es ?? null,
      help_en: null,
      help_es: null,
      value_type: bKindToValueType(bDef.kind),
      required_level: "optional",
      public_visible: true,
      internal_only: false,
      card_visible: false,
      profile_visible: true,
      filterable: false,
      directory_filter_visible: false,
      searchable: false,
      ai_visible: false,
      editable_by_talent: true,
      editable_by_staff: false,
      editable_by_admin: true,
      active: true,
      sort_order: (aDef.sort_order as number) ?? 0,
      taxonomy_kind: null,
      config: {},
      archived_at: null,
    });
  }

  // Build groups (same logic as readFieldCatalogFromA)
  const groupIdsUsed = new Set<string>();
  for (const d of syntheticDefs) {
    if (d.field_group_id) groupIdsUsed.add(d.field_group_id);
  }
  const groups = ((aGroups ?? []) as FieldGroupRow[]).filter((g) =>
    groupIdsUsed.has(g.id),
  );
  const editableByGroup = new Map<string, FieldDefinitionRow[]>();
  for (const d of syntheticDefs) {
    const gid = d.field_group_id ?? "ungrouped";
    const arr = editableByGroup.get(gid) ?? [];
    arr.push(d);
    editableByGroup.set(gid, arr);
  }
  const scalarEditableIds = syntheticDefs
    .filter((d) =>
      ["text", "textarea", "number", "boolean", "date"].includes(d.value_type),
    )
    .map((d) => d.id);

  // Field values: read from B's `talent_profile_field_values` but map back to
  // A `field_definition_id` (the A def id) so downstream consumers (completion
  // scorer, value lookup by A field_definition_id) work without change.
  //
  // B `value` is JSONB scalar — we extract value_text / value_number /
  // value_boolean from it so the A-shaped fieldValues object is satisfied.
  const bDefIds = ((bDefs ?? []) as BProfileFieldDef[]).map((d) => d.id).filter(Boolean);

  const { data: bFieldValues, error: bFvErr } = await supabase
    .from("talent_profile_field_values")
    .select("field_definition_id, value")
    .eq("talent_profile_id", talentProfileId)
    .in("field_definition_id", bDefIds);

  if (bFvErr) throw new Error(`[dashboard_nav/catalog-B] talent_profile_field_values: ${bFvErr.message}`);

  // Build B def-id → A def-id reverse map (via field_key bridge)
  const bDefIdToADefId = new Map<string, string>();
  for (const bDef of (bDefs ?? []) as BProfileFieldDef[]) {
    // Resolve the A key from the B field_key
    const aKey = NEW_TO_OLD_KEY[bDef.field_key] ?? bDef.field_key;
    const aDef = aDefByKey.get(aKey);
    if (aDef) bDefIdToADefId.set(bDef.id, aDef.id as string);
  }

  type BFieldValueRow = { field_definition_id: string; value: unknown };
  type MaybeFV = DashboardNavFieldValues[number] | null;
  const fieldValues: DashboardNavFieldValues = ((bFieldValues ?? []) as BFieldValueRow[])
    .map((bv): MaybeFV => {
      const aDefId = bDefIdToADefId.get(bv.field_definition_id);
      if (!aDefId) return null;
      // Extract typed values from B's JSONB scalar `value`
      const raw = bv.value;
      let value_text: string | null = null;
      let value_number: number | null = null;
      let value_boolean: boolean | null = null;
      const value_date: string | null = null; // date stored as text in B
      if (raw === null || raw === undefined) {
        // no-op
      } else if (typeof raw === "string") {
        value_text = raw;
      } else if (typeof raw === "number") {
        value_number = raw;
      } else if (typeof raw === "boolean") {
        value_boolean = raw;
      } else {
        // array/object — skip (not a scalar)
        return null;
      }
      return {
        field_definition_id: aDefId,
        value_text,
        value_number,
        value_boolean,
        value_date,
      };
    })
    .filter((v): v is DashboardNavFieldValues[number] => v !== null);

  return {
    catalog: { groups, editableDefinitions: syntheticDefs, editableByGroup, scalarEditableIds },
    fieldValues,
  };
}

/** The reader pair for `loadTalentDashboardData`'s fieldCatalog + fieldValues. */
export const fieldCatalogReaderPair: FieldSurfaceReaderPair<
  [SupabaseClient, string],
  { catalog: DashboardNavFieldCatalog; fieldValues: DashboardNavFieldValues }
> = {
  readA: readFieldCatalogFromA,
  readB: readFieldCatalogFromB,
};

/**
 * PUBLIC entry — read the talent dashboard field catalog + field values from
 * the active source for the `dashboard_nav` surface.
 */
export function readDashboardFieldCatalog(
  supabase: SupabaseClient,
  talentProfileId: string,
): Promise<{ catalog: DashboardNavFieldCatalog; fieldValues: DashboardNavFieldValues }> {
  return readFieldSurface("dashboard_nav", fieldCatalogReaderPair, supabase, talentProfileId);
}

// ── Taxonomy-editor reader pair ─────────────────────────────────────────────
//
// Split into read-source-dashboard-nav-taxonomy.ts to stay under the 800-line
// ESLint max-lines limit. Re-exported here so callers see a single import path.

export {
  taxonomyEditableFieldsReaderPair,
  readDashboardTaxonomyEditableFields,
} from "@/lib/field-engine/read-source-dashboard-nav-taxonomy";
