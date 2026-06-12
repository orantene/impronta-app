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
import { OLD_TO_NEW_KEY } from "@/lib/fields/legacy-mirror";

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

// ── Dashboard-nav field→group skeleton (STATIC — System A registry retired) ───
//
// T3.2 — the nav-group + dashboard-catalog readers used to read legacy System A
// `field_definitions` purely as a REGISTRY SKELETON: which dynamic-field keys are
// talent-editable + profile-visible, and which `field_groups` group each belongs
// to (with the field's intra-group sort). That metadata never lived in the value
// store and is FROZEN (System A is being retired in T3.x — no new A fields will
// ever be added). So we pin the skeleton as a code-level constant, captured 1:1
// from the prod `field_definitions`/`field_groups` join (ref pluhdapdnuiulvxmyspd,
// 2026-06-11) using the SAME gate the A-reader applied (active, non-archived,
// editable_by_talent, profile_visible, !internal_only, value_type<>location).
// This removes the last `field_definitions` reads from the dashboard_nav surface
// while preserving group display metadata (still read from `field_groups`, which
// is NOT a T3.2 target). Whether a group/field ACTUALLY appears is still decided
// at runtime by querying System B (`profile_field_definitions`) for live rows —
// the static map only supplies the A-key→group skeleton, never a liveness verdict.

/** One eligible dynamic-field key from the (frozen) System-A registry: its owning
 *  group slug + the field's intra-group sort. Mirrors the A `field_definitions`
 *  row the readers previously fetched. */
type DashboardNavFieldSkeleton = {
  key: string;
  groupSlug: string;
  fieldSort: number;
  valueType: string;
};

/** The complete dashboard-nav-eligible field skeleton (frozen System-A registry).
 *  Order within the array is the A-reader's group-sort → field-sort order. */
const DASHBOARD_NAV_FIELD_SKELETON: readonly DashboardNavFieldSkeleton[] = [
  { key: "display_name", groupSlug: "basic_info", fieldSort: 10, valueType: "text" },
  { key: "short_bio", groupSlug: "basic_info", fieldSort: 110, valueType: "textarea" },
  { key: "talent_type", groupSlug: "classification", fieldSort: 10, valueType: "taxonomy_single" },
  { key: "skills", groupSlug: "abilities", fieldSort: 30, valueType: "taxonomy_multi" },
  { key: "languages", groupSlug: "abilities", fieldSort: 70, valueType: "taxonomy_multi" },
  { key: "height_cm", groupSlug: "traits", fieldSort: 10, valueType: "number" },
  { key: "eye_color", groupSlug: "traits", fieldSort: 20, valueType: "text" },
  { key: "tags", groupSlug: "traits", fieldSort: 20, valueType: "taxonomy_multi" },
  { key: "hair_color", groupSlug: "traits", fieldSort: 30, valueType: "text" },
  { key: "hair_length", groupSlug: "traits", fieldSort: 40, valueType: "text" },
  { key: "body_type", groupSlug: "traits", fieldSort: 50, valueType: "text" },
  { key: "clothing_size", groupSlug: "traits", fieldSort: 60, valueType: "text" },
  { key: "shoe_size", groupSlug: "traits", fieldSort: 70, valueType: "text" },
  { key: "experience_level", groupSlug: "experience", fieldSort: 10, valueType: "text" },
  { key: "years_experience", groupSlug: "experience", fieldSort: 20, valueType: "number" },
  { key: "notable_work", groupSlug: "experience", fieldSort: 30, valueType: "textarea" },
  { key: "professional_highlights", groupSlug: "experience", fieldSort: 40, valueType: "textarea" },
  { key: "industries", groupSlug: "experience", fieldSort: 40, valueType: "taxonomy_multi" },
  { key: "availability_status", groupSlug: "availability_mobility", fieldSort: 10, valueType: "text" },
  { key: "willing_to_travel", groupSlug: "availability_mobility", fieldSort: 20, valueType: "boolean" },
  { key: "travel_scope", groupSlug: "availability_mobility", fieldSort: 30, valueType: "text" },
  { key: "available_for", groupSlug: "availability_mobility", fieldSort: 40, valueType: "text" },
  { key: "event_types", groupSlug: "availability_mobility", fieldSort: 50, valueType: "taxonomy_multi" },
  { key: "fit_labels", groupSlug: "availability_mobility", fieldSort: 60, valueType: "taxonomy_multi" },
  { key: "instagram_url", groupSlug: "social_external", fieldSort: 10, valueType: "text" },
  { key: "tiktok_url", groupSlug: "social_external", fieldSort: 20, valueType: "text" },
  { key: "website_url", groupSlug: "social_external", fieldSort: 30, valueType: "text" },
  { key: "youtube_url", groupSlug: "social_external", fieldSort: 40, valueType: "text" },
] as const;

/** The eligible skeleton minus reserved keys + location types — the exact set
 *  the A-reader produced after its `.filter(...)`. `display_name`/`short_bio` are
 *  reserved (basic_info) and dropped here, matching the A-reader. */
function dashboardNavEligibleSkeleton(): DashboardNavFieldSkeleton[] {
  return DASHBOARD_NAV_FIELD_SKELETON.filter(
    (f) => !isReservedTalentProfileFieldKey(f.key) && f.valueType !== "location",
  );
}

// ── Nav-group-items reader (System B liveness + field_groups metadata) ────────
//
// T3.2 — repointed off legacy System A `field_definitions`. The eligible
// key→group skeleton now comes from the frozen-registry constant above; LIVENESS
// (which groups actually appear) is decided by querying System B
// (`profile_field_definitions`) for non-deprecated talent-editable rows; group
// display metadata comes from `field_groups` (NOT a T3.2 target). Documented diffs
// vs the historical A render (all non-regressive — see module header):
//   • `classification` group drops (talent_type has no B definition).
//   • `abilities`: skills drops (deprecated in B); languages survives.
//   • `social_external`: instagram/tiktok/youtube drop; website_url survives.

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

async function readNavGroupItemsFromB(
  supabase: SupabaseClient,
): Promise<DashboardNavProfileGroupItems> {
  // Step 1 — the eligible key→group skeleton from the frozen System-A registry
  // (static constant; no `field_definitions` read).
  const skeleton = dashboardNavEligibleSkeleton();

  // Step 2 — for each eligible key, find its B canonical key.
  const bKeysNeeded = skeleton
    .map((d) => aKeyToBKey(d.key))
    .filter((k): k is string => k !== null);

  if (bKeysNeeded.length === 0) return [];

  // Step 3 — query System B for which of those B keys are live (non-deprecated,
  // talent-editable). This is the authoritative "does B have this field?" check.
  const { data: bDefs, error: bDefsError } = await supabase
    .from("profile_field_definitions")
    .select("field_key")
    .in("field_key", bKeysNeeded)
    .is("deprecated_at", null)
    .eq("talent_editable", true);

  if (bDefsError) throw new Error(`[dashboard_nav] profile_field_definitions: ${bDefsError.message}`);

  const liveBKeys = new Set((bDefs ?? []).map((r) => (r as { field_key: string }).field_key));

  // Step 4 — collect the group slugs that have ≥1 live B field.
  const groupSlugsWithBFields = new Set<string>();
  for (const def of skeleton) {
    const bKey = aKeyToBKey(def.key);
    if (bKey && liveBKeys.has(bKey)) groupSlugsWithBFields.add(def.groupSlug);
  }

  if (groupSlugsWithBFields.size === 0) return [];

  // Step 5 — group display metadata from `field_groups` (NOT a T3.2 target),
  // matched by slug. B has no group table; group labels/order live here.
  const { data: fieldGroups, error: groupsError } = await supabase
    .from("field_groups")
    .select("id, slug, name_en, name_es, sort_order")
    .in("slug", [...groupSlugsWithBFields])
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

/** The reader pair for `fetchTalentNavProfileGroupItems`. T3.2 — System A
 *  removed: both legs read System B liveness + `field_groups` metadata via the
 *  frozen-registry skeleton (no `field_definitions` read). */
export const navGroupItemsReaderPair: FieldSurfaceReaderPair<
  [SupabaseClient],
  DashboardNavProfileGroupItems
> = {
  readA: readNavGroupItemsFromB,
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

// ── fieldCatalog + fieldValues reader (System B native) ───────────────────────
//
// T3.2 — repointed off legacy System A. Field metadata comes from System B
// `profile_field_definitions` (id/label/kind) + the frozen-registry skeleton
// (key→group slug + intra-group sort); values come from
// `talent_profile_field_values`; group display metadata from `field_groups` by
// slug (NOT a T3.2 target). The synthesized `FieldDefinitionRow`s are keyed by the
// B def-id, and `fieldValues` are keyed by the SAME B def-id, so the completion
// scorer's `definitions[].id ↔ fieldValues[].field_definition_id` Map join stays
// internally consistent (the id is opaque to the scorer — it only needs both
// sides to agree, which they do on the B def-id). `field_group_id` carries the B
// group-slug (used only to bucket `editableByGroup` + filter `groups`, which is
// then matched against `field_groups.slug`).

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
  // Step 1 — eligible key→group skeleton from the frozen System-A registry
  // (static; no `field_definitions` read). Remember each key's group slug + sort.
  const skeleton = dashboardNavEligibleSkeleton();
  const skeletonByAKey = new Map(skeleton.map((s) => [s.key, s]));

  // Step 2 — the B field_keys we need, plus a B-key → A-key reverse for grouping.
  const bKeyToAKey = new Map<string, string>();
  for (const s of skeleton) {
    const bKey = aKeyToBKey(s.key);
    if (bKey) bKeyToAKey.set(bKey, s.key);
  }
  const bKeysNeeded = [...bKeyToAKey.keys()];

  if (bKeysNeeded.length === 0) {
    return {
      catalog: { groups: [], editableDefinitions: [], editableByGroup: new Map(), scalarEditableIds: [] },
      fieldValues: [],
    };
  }

  const [{ data: bDefs, error: bDefsErr }, { data: groupRows, error: groupsErr }] =
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
  if (groupsErr) throw new Error(`[dashboard_nav/catalog-B] field_groups: ${groupsErr.message}`);

  // Step 3 — synthesize an A-shaped FieldDefinitionRow per live B field, keyed by
  // the B def-id (the same id we key fieldValues on below). `field_group_id`
  // carries the group SLUG from the skeleton.
  const liveBDefs = (bDefs ?? []) as BProfileFieldDef[];
  const syntheticDefs: FieldDefinitionRow[] = [];
  const bDefIds: string[] = [];
  for (const bDef of liveBDefs) {
    const aKey = bKeyToAKey.get(bDef.field_key);
    if (!aKey) continue;
    const skel = skeletonByAKey.get(aKey);
    if (!skel) continue;
    bDefIds.push(bDef.id);
    syntheticDefs.push({
      id: bDef.id, // B def id — consistent across definitions + fieldValues
      field_group_id: skel.groupSlug, // group SLUG (matched to field_groups.slug)
      key: aKey,
      label_en: bDef.label ?? aKey,
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
      sort_order: skel.fieldSort,
      taxonomy_kind: null,
      config: {},
      archived_at: null,
    });
  }

  const editableDefinitions = filterOutReservedFieldDefinitions(syntheticDefs);

  // Step 4 — groups: filter `field_groups` to the slugs actually used, then
  // bucket by slug (the synthetic rows' field_group_id IS the slug).
  const groupSlugsUsed = new Set<string>();
  for (const d of editableDefinitions) {
    if (d.field_group_id) groupSlugsUsed.add(d.field_group_id);
  }
  const groups = ((groupRows ?? []) as FieldGroupRow[]).filter((g) =>
    groupSlugsUsed.has(g.slug),
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

  // Step 5 — field values from B, keyed by the B def-id (same id as the synthetic
  // definitions above), with B's JSONB scalar projected to the typed columns.
  const { data: bFieldValues, error: bFvErr } = await supabase
    .from("talent_profile_field_values")
    .select("field_definition_id, value")
    .eq("talent_profile_id", talentProfileId)
    .in("field_definition_id", bDefIds);

  if (bFvErr) throw new Error(`[dashboard_nav/catalog-B] talent_profile_field_values: ${bFvErr.message}`);

  const liveBDefIds = new Set(bDefIds);
  type BFieldValueRow = { field_definition_id: string; value: unknown };
  type MaybeFV = DashboardNavFieldValues[number] | null;
  const fieldValues: DashboardNavFieldValues = ((bFieldValues ?? []) as BFieldValueRow[])
    .map((bv): MaybeFV => {
      if (!liveBDefIds.has(bv.field_definition_id)) return null;
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
        field_definition_id: bv.field_definition_id,
        value_text,
        value_number,
        value_boolean,
        value_date,
      };
    })
    .filter((v): v is DashboardNavFieldValues[number] => v !== null);

  return {
    catalog: { groups, editableDefinitions, editableByGroup, scalarEditableIds },
    fieldValues,
  };
}

/** The reader pair for `loadTalentDashboardData`'s fieldCatalog + fieldValues.
 *  T3.2 — System A removed: both legs read System B + `field_groups` metadata. */
export const fieldCatalogReaderPair: FieldSurfaceReaderPair<
  [SupabaseClient, string],
  { catalog: DashboardNavFieldCatalog; fieldValues: DashboardNavFieldValues }
> = {
  readA: readFieldCatalogFromB,
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
