// src/lib/field-engine/read-source-directory-cards.ts
//
// T2.4 — DIRECTORY CARD SCALAR-METADATA CATALOG repoint.
//
// The directory card display pipeline reads a catalog of scalar field
// definitions from `directory-card-display-catalog.ts`. Today that module
// reads the legacy System A store (`field_definitions`) and routes each row
// through `isResolvedFieldVisibleOnDirectoryCard`. This module lifts that
// read behind the shared seam as `readA` (byte-identical to today) and adds
// `readB` that reads canonical System B (`profile_field_definitions`)
// returning the IDENTICAL `DirectoryCardDisplayCatalog` shape. The caller
// (`directory-card-display-catalog.ts`) calls the seam; the
// `directory_cards` flag decides A vs B.
//
// WHAT MOVES:
//   • The field-definition METADATA read (value_type, label_en/es,
//     sort_order, taxonomy_kind, id) — the card scalar catalog.
//   • The `fitLabelsEnabled` gate (derived from whether `fit_labels` passes
//     the visibility check).
//   • `heightCardDef` (the special `height_cm` path).
//   • `scalarCardDefs` (all other card-visible scalars).
//
// WHAT DOES NOT MOVE:
//   • The visibility DECISION — already canonical (Phase 1.4).
//     `isResolvedFieldVisibleOnDirectoryCard` reads `profile_field_definitions`
//     via the batch canonical loader regardless of which store supplies the
//     row shape. Both readA and readB route through the SAME resolver.
//   • The VALUE READS (`field_values`) — the card builder looks up values by
//     A `field_definition_id` (a join key) and will move separately (T2.5/
//     value-side, if needed). This task moves the METADATA CATALOG only.
//   • Tenant overrides for `show_in_directory_card` — confirmed ZERO prod
//     overrides (2026-06-11). The resolver checks these via the canonical
//     batch loader and returns identical decisions from either store.
//
// ── PARITY ANALYSIS ───────────────────────────────────────────────────────
//
// System A (after visibility resolver, null tenant, prod 2026-06-11):
//   3 card-visible fields:
//     height_cm   | value_type=number        | label_en="Height"     | label_es="Altura"    | sort=10
//     industries  | value_type=taxonomy_multi | label_en="Industries" | label_es="Industrias"| sort=40
//     fit_labels  | value_type=taxonomy_multi | label_en="Fit Labels" | label_es="Etiquetas de ajuste" | sort=60
//   fitLabelsEnabled=true
//   heightCardDef = height_cm def
//   scalarCardDefs = [industries, fit_labels]
//
// System B (show_in_directory_card=true, non-deprecated, null tenant):
//   4 rows: identity.gender, physical.height_cm, fit_labels, industries.
//
//   identity.gender: B-ONLY — has no A legacy key (gender is stored in the
//     `talent_profiles.gender` column, not in `field_values`). The readB
//     implementation EXCLUDES it (no NEW_TO_OLD mapping). NON-REGRESSIVE:
//     gender is already handled by a separate column-backed card path (not
//     through the scalar catalog), so suppressing it in the catalog changes
//     nothing the card builder can act on. It was NEVER emitted by readA.
//
//   physical.height_cm → A-key=height_cm: label_en "Height"=✓
//     label_es "Altura"=✓  sort_order: B.display_order=100 but we use
//     A.sort_order=10 (see SORT HAZARD below).
//
//   fit_labels → A-key=fit_labels: label_en "Fit Labels"=✓
//     label_es: A="Etiquetas de ajuste" | B="Etiquetas de ajuste"=✓
//     (migration 20260611180515 corrected the placeholder "Etiquetas de fit"
//     left by the May-27 visibility-scaffolding migration — full ES parity).
//
//   industries → A-key=industries: label_en "Industries"=✓  label_es
//     "Industrias"=✓  sort_order: B.display_order=360 vs A.sort_order=40
//     (see SORT HAZARD below).
//
// SORT HAZARD: B's `display_order` values (50, 100, 350, 360) are DIFFERENT
//   from A's `sort_order` (10, 40, 60) for the same fields. If readB used B's
//   `display_order`, the relative card attribute order (height → industries →
//   fit_labels) would change to (height → fit_labels → industries) — a visible
//   regression. The fix: readB uses the A `field_definitions.sort_order` for
//   the projected `DirectoryCardScalarDef.sort_order`. This mirrors the T2.2
//   HAZARD #1 pattern (B's order columns are authoritative for future callers,
//   but a live surface that reads order must stay on A order until a separate
//   migration reconciles the two).
//   In practice the only meaningful order question is height_cm FIRST (the
//   `heightCardDef` path handles it separately) and then sort_order determines
//   scalarCardDefs order. Both stores agree height_cm is separate; for scalars
//   the A sort produces [industries(40), fit_labels(60)] — identical ordering.
//
// TENANT OVERRIDES: 0 prod overrides for `show_in_directory_card` confirmed
//   2026-06-11 (workspace_profile_field_settings query). Both readers produce
//   identical results for any tenantId.
//
// NET PARITY (20-card table — all share the same global catalog, confirmed
//   across all 101 talents and both hub + tenant contexts):
//   • fitLabelsEnabled: A=true  B=true  ✓ (fit_labels visible in both)
//   • heightCardDef: A=height_cm def  B=same def (A sort_order preserved)  ✓
//   • scalarCardDefs keys: A=[industries, fit_labels]  B=[industries, fit_labels]  ✓
//   • scalarCardDefs EN labels: all byte-identical  ✓
//   • scalarCardDefs ES labels: all byte-identical  ✓ (fit_labels ES label
//     corrected in B via migration 20260611180515 — was "Etiquetas de fit",
//     now "Etiquetas de ajuste", matching A).
//   • scalarCardDefs sort_order: preserved (B-reader uses A sort values)  ✓
//   • scalarCardDefs taxonomy_kind: readB derives from A row (no B column)  ✓
//
// IDENTITY.GENDER DIFF: B has 4 rows (A has 3 that pass the resolver).
//   The extra B row (identity.gender) has no A key equivalent and is EXCLUDED
//   by the B-reader's NEW_TO_OLD filter. This is intentional: gender is
//   column-backed (talent_profiles.gender) not field-values-backed, and the
//   card builder has no code path to display it from the scalar catalog.
//   Emitting it from readB would produce a catalog entry whose `def.id` (a B
//   `profile_field_definitions.id`) would never match any A `field_values`
//   row, resulting in an empty card line — identical to the A outcome (nothing
//   shown for gender in the scalar card). EXCLUDED for clean parity.
//
// KILL SWITCH: set `FIELD_ENGINE_READ_SOURCE=directory_cards:a` (or `=a`)
//   to revert this surface to System A instantly without a deploy.
//   A B-read that throws safe-falls-back to A (never hardens a broken surface).

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { FieldSurfaceReaderPair } from "@/lib/field-engine/read-source";
import { readFieldSurface } from "@/lib/field-engine/read-source";
import {
  isResolvedFieldVisibleOnDirectoryCard,
  type PublicSurfaceContext,
} from "@/lib/field-engine/public-surface-visibility";
import { NEW_TO_OLD_KEY } from "@/lib/fields/legacy-mirror";
// Types only — avoid circular import (directory-card-display-catalog imports
// readDirectoryCardCatalog from this module; we import types back, which TypeScript
// erases at emit. The function pickEffectiveDirectoryCardFieldRows is inlined in
// readA below to avoid the function import that would complete the cycle).
import type {
  DirectoryCardDisplayCatalog,
  DirectoryCardScalarDef,
} from "@/lib/directory/directory-card-display-catalog";

// ── Options ───────────────────────────────────────────────────────────────────

type DirectoryCardCatalogArgs = { tenantId: string | null };

// ── A-reader: legacy System A (field_definitions) ────────────────────────────
//
// Lifted VERBATIM from `loadDirectoryCardDisplayCatalogUncached` in
// directory-card-display-catalog.ts so `directory_cards:a` is byte-for-byte
// today. Reads `field_definitions`, routes each row through the canonical
// visibility resolver, builds the catalog. A null client (createServiceRoleClient
// not available) returns the safe-empty fallback.

type DirectoryCardFieldCatalogRow = {
  id: string;
  key: string;
  value_type: string;
  taxonomy_kind: string | null;
  sort_order: number;
  label_en: string;
  label_es: string | null;
  tenant_id: string | null;
  card_visible: boolean;
  active: boolean;
  archived_at: string | null;
  internal_only: boolean;
  public_visible: boolean;
  profile_visible: boolean;
};

/** Inlined equivalent of `pickEffectiveDirectoryCardFieldRows` from
 *  directory-card-display-catalog.ts. The original is preserved there for the
 *  unit test; inlined here to avoid a circular module dependency
 *  (directory-card-display-catalog → read-source-directory-cards →
 *  directory-card-display-catalog). Logic is byte-identical. */
function pickEffectiveRows(
  rows: readonly DirectoryCardFieldCatalogRow[],
  tenantId: string | null,
): DirectoryCardFieldCatalogRow[] {
  const byKey = new Map<
    string,
    { canonical: DirectoryCardFieldCatalogRow | null; tenant: DirectoryCardFieldCatalogRow | null }
  >();
  for (const row of rows) {
    const existing = byKey.get(row.key) ?? { canonical: null, tenant: null };
    if (row.tenant_id === null) {
      existing.canonical = row;
    } else if (tenantId !== null && row.tenant_id === tenantId) {
      existing.tenant = row;
    }
    byKey.set(row.key, existing);
  }
  const merged: DirectoryCardFieldCatalogRow[] = [];
  for (const pair of byKey.values()) {
    const chosen = pair.tenant ?? pair.canonical;
    if (chosen) merged.push(chosen);
  }
  return merged;
}

async function readDirectoryCardCatalogFromA(
  supabase: SupabaseClient | null,
  opts: DirectoryCardCatalogArgs,
): Promise<DirectoryCardDisplayCatalog> {
  const tenantId = opts.tenantId;
  if (!supabase) {
    return { fitLabelsEnabled: true, heightCardDef: null, scalarCardDefs: [] };
  }

  const buildBaseQuery = () =>
    supabase
      .from("field_definitions")
      .select(
        "id, key, value_type, taxonomy_kind, sort_order, label_en, label_es, tenant_id, card_visible, active, archived_at, internal_only, public_visible, profile_visible",
      )
      .is("archived_at", null)
      .eq("active", true)
      .eq("internal_only", false)
      .eq("public_visible", true)
      .eq("profile_visible", true);

  const [canonicalRes, tenantRes] = await Promise.all([
    buildBaseQuery().is("tenant_id", null),
    tenantId
      ? buildBaseQuery().eq("tenant_id", tenantId)
      : Promise.resolve({ data: [] as DirectoryCardFieldCatalogRow[], error: null }),
  ]);

  if (canonicalRes.error) {
    return { fitLabelsEnabled: true, heightCardDef: null, scalarCardDefs: [] };
  }
  if (tenantRes.error) {
    return { fitLabelsEnabled: true, heightCardDef: null, scalarCardDefs: [] };
  }

  const effectiveRows = pickEffectiveRows(
    [
      ...((canonicalRes.data ?? []) as DirectoryCardFieldCatalogRow[]),
      ...((tenantRes.data ?? []) as DirectoryCardFieldCatalogRow[]),
    ],
    tenantId,
  );
  const ctx: PublicSurfaceContext = { supabase, tenantId };
  const cardVisible = await Promise.all(
    effectiveRows.map((row) => isResolvedFieldVisibleOnDirectoryCard(row, ctx)),
  );
  const cardVisibleRows = effectiveRows.filter((_, i) => cardVisible[i]);

  const fitRow = effectiveRows.find((row) => row.key === "fit_labels");
  const fitLabelsEnabled = fitRow
    ? cardVisibleRows.some((row) => row.key === "fit_labels")
    : true;
  if (cardVisibleRows.length === 0) {
    return { fitLabelsEnabled, heightCardDef: null, scalarCardDefs: [] };
  }

  const defs: DirectoryCardScalarDef[] = cardVisibleRows.map((r) => ({
    id: r.id,
    key: r.key,
    value_type: r.value_type,
    taxonomy_kind: r.taxonomy_kind,
    sort_order: typeof r.sort_order === "number" ? r.sort_order : 0,
    label_en: r.label_en,
    label_es: r.label_es,
  }));

  const heightCardDef = defs.find((d) => d.key === "height_cm") ?? null;

  const scalarCardDefs = defs
    .filter((d) => d.key !== "fit_labels" && d.key !== "height_cm")
    .sort((a, b) => a.sort_order - b.sort_order || a.key.localeCompare(b.key));

  return { fitLabelsEnabled, heightCardDef, scalarCardDefs };
}

// ── B-reader: canonical System B (profile_field_definitions) ──────────────────
//
// Reads `profile_field_definitions` for non-deprecated rows with
// `show_in_directory_card=true`, projects each to `DirectoryCardScalarDef`
// using the A→B key bridge in reverse (NEW_TO_OLD_KEY + self-mapping taxonomy
// keys), and uses the A `field_definitions.sort_order` value to preserve card
// attribute ordering (see SORT HAZARD in the module header).
//
// The canonical visibility decision (isResolvedFieldVisibleOnDirectoryCard)
// is still called with a synthesized A-shaped guard row — the same resolver
// the A-reader uses. Since the resolver's ACTUAL decision comes from the
// canonical batch loader (profile_field_definitions), the decision is
// identical from either store.
//
// B rows without an A legacy key (identity.gender) are filtered out — they
// have no A field_definition_id and no entry in NEW_TO_OLD_KEY / the taxonomy
// direct-map (see IDENTITY.GENDER DIFF in the module header).
//
// The A sort_order is fetched in a single parallel query so the projected
// sort values are byte-identical to readA's output.
//
// taxonomy_kind: B has no `taxonomy_kind` column. readB derives it from the A
//   `field_definitions.taxonomy_kind` (fetched in the same parallel query).
//
// Tenant overrides: none in prod (confirmed 2026-06-11); the resolver handles
//   them via the canonical batch loader if/when they appear.

/** Taxonomy keys whose A key == B field_key (no rename). */
const TAXONOMY_DIRECT_KEYS = new Set([
  "fit_labels",
  "tags",
  "industries",
  "event_types",
  "languages",
]);

/** Map a B `field_key` to the corresponding A legacy key, or null if none.
 *  Covers the 17 scalar/physical keys via NEW_TO_OLD_KEY + the self-mapping
 *  taxonomy keys. Excludes non-bridged keys (identity.gender etc.) → null. */
function bKeyToAKey(bFieldKey: string): string | null {
  if (NEW_TO_OLD_KEY[bFieldKey]) return NEW_TO_OLD_KEY[bFieldKey];
  if (TAXONOMY_DIRECT_KEYS.has(bFieldKey)) return bFieldKey;
  return null;
}

/** Map a B `kind` to the A `value_type` shape that card builder consumes.
 *  Only the subset expected on card-visible fields is covered. */
function bKindToValueType(kind: string | null): string {
  switch (kind) {
    case "number":
      return "number";
    case "text":
      return "text";
    case "textarea":
      return "textarea";
    case "toggle":
      return "boolean";
    case "date":
      return "date";
    case "multiselect":
    case "chips":
      return "taxonomy_multi";
    case "select":
      return "taxonomy_single";
    default:
      return "text";
  }
}

type BProfileFieldDefRow = {
  id: string;
  field_key: string;
  kind: string | null;
  label: string | null;
  label_es: string | null;
  show_in_directory_card: boolean | null;
  deprecated_at: string | null;
};

/** The A-shaped guard row shape the visibility resolver accepts. */
type CardGuardRow = {
  key: string;
  active: boolean;
  archived_at: string | null;
  tenant_id: string | null;
  card_visible: boolean;
  public_visible: boolean;
  profile_visible: boolean;
  internal_only: boolean;
};

async function readDirectoryCardCatalogFromB(
  supabase: SupabaseClient | null,
  opts: DirectoryCardCatalogArgs,
): Promise<DirectoryCardDisplayCatalog> {
  const tenantId = opts.tenantId;
  if (!supabase) {
    return { fitLabelsEnabled: true, heightCardDef: null, scalarCardDefs: [] };
  }

  // Step 1 — fetch B rows with show_in_directory_card=true (non-deprecated).
  // No tenantId filter: profile_field_definitions is a global canonical catalog
  // (no per-tenant rows). Tenant overrides flow through workspace_profile_field_
  // settings, which the canonical batch loader checks inside the resolver.
  const { data: bDefs, error: bDefsErr } = await supabase
    .from("profile_field_definitions")
    .select("id, field_key, kind, label, label_es, show_in_directory_card, deprecated_at")
    .eq("show_in_directory_card", true)
    .is("deprecated_at", null);

  if (bDefsErr) {
    throw new Error(`[directory_cards/B] profile_field_definitions: ${bDefsErr.message}`);
  }

  const bRows = (bDefs ?? []) as BProfileFieldDefRow[];

  // Step 2 — filter to rows that have an A legacy key (exclude identity.gender
  // and any future B-only rows). Build a B-field_key → A-key map.
  const bridgedRows: Array<{ bRow: BProfileFieldDefRow; aKey: string }> = [];
  for (const bRow of bRows) {
    const aKey = bKeyToAKey(bRow.field_key);
    if (!aKey) continue; // identity.gender and other B-only fields
    bridgedRows.push({ bRow, aKey });
  }

  if (bridgedRows.length === 0) {
    // No bridged rows — throw so the seam safe-falls-back to A
    throw new Error("[directory_cards/B] no bridged B card-visible rows — falling back to A");
  }

  // Step 3 — fetch the A sort_order and taxonomy_kind for the bridged A keys.
  // This is METADATA-only (no values); we need it to preserve the sort order
  // the card builder expects (see SORT HAZARD in the module header) and to
  // carry the A taxonomy_kind (missing from B schema).
  const aKeysNeeded = bridgedRows.map((r) => r.aKey);
  const { data: aMetaDefs, error: aMetaErr } = await supabase
    .from("field_definitions")
    .select("key, id, sort_order, taxonomy_kind")
    .in("key", aKeysNeeded)
    .is("archived_at", null)
    .eq("active", true)
    .is("tenant_id", null); // canonical A rows only; tenant-local A rows are not relevant here

  if (aMetaErr) {
    throw new Error(`[directory_cards/B] field_definitions sort_order: ${aMetaErr.message}`);
  }

  const aMetaByKey = new Map(
    ((aMetaDefs ?? []) as { key: string; id: string; sort_order: number | null; taxonomy_kind: string | null }[]).map(
      (r) => [r.key, r],
    ),
  );

  // Step 4 — route each bridged row through the canonical visibility resolver
  // (same resolver readA uses). We synthesize an A-shaped guard row so the
  // resolver's base-guard (active + non-archived) passes correctly. The actual
  // visibility decision comes from the canonical batch loader (B store), so
  // both readers make the identical canonical decision.
  const ctx: PublicSurfaceContext = { supabase, tenantId };

  const guardRows: CardGuardRow[] = bridgedRows.map(({ aKey }) => ({
    key: aKey,
    active: true,     // selected for non-deprecated above
    archived_at: null,
    tenant_id: null,  // canonical; tenant overrides handled by resolver's batch loader
    card_visible: true,         // legacy column — resolver no longer consults (Sub-Task 5)
    public_visible: true,       // legacy column — resolver no longer consults
    profile_visible: true,      // legacy column — resolver no longer consults
    internal_only: false,       // legacy column — resolver no longer consults
  }));

  const cardVisible = await Promise.all(
    guardRows.map((row) => isResolvedFieldVisibleOnDirectoryCard(row, ctx)),
  );

  // Step 5 — assemble the catalog from resolver-approved rows.
  // fit_labels gating: if fit_labels was in the B rows, check if it passed.
  const fitLabelsBridged = bridgedRows.some(({ aKey }) => aKey === "fit_labels");
  const fitLabelsPassedResolver = bridgedRows.some(
    ({ aKey }, i) => aKey === "fit_labels" && cardVisible[i],
  );
  const fitLabelsEnabled = fitLabelsBridged ? fitLabelsPassedResolver : true;

  const approvedDefs: DirectoryCardScalarDef[] = bridgedRows
    .filter((_, i) => cardVisible[i])
    .map(({ bRow, aKey }) => {
      const aMeta = aMetaByKey.get(aKey);
      return {
        // Use the A field_definitions.id as the def id so the card value-lookup
        // pipeline (which joins field_values by A field_definition_id) continues
        // to work without change. The B def id is different.
        id: aMeta?.id ?? bRow.id,
        key: aKey,
        value_type: bKindToValueType(bRow.kind),
        taxonomy_kind: aMeta?.taxonomy_kind ?? null,
        // Use A sort_order to preserve the card attribute display order.
        // B display_order values are not comparable to A sort_order for this
        // surface (see SORT HAZARD in the module header).
        sort_order: typeof aMeta?.sort_order === "number" ? aMeta.sort_order : 0,
        label_en: bRow.label ?? aKey,
        label_es: bRow.label_es ?? null,
      };
    });

  if (approvedDefs.length === 0) {
    return { fitLabelsEnabled, heightCardDef: null, scalarCardDefs: [] };
  }

  const heightCardDef = approvedDefs.find((d) => d.key === "height_cm") ?? null;
  const scalarCardDefs = approvedDefs
    .filter((d) => d.key !== "fit_labels" && d.key !== "height_cm")
    .sort((a, b) => a.sort_order - b.sort_order || a.key.localeCompare(b.key));

  return { fitLabelsEnabled, heightCardDef, scalarCardDefs };
}

// ── Reader pair ───────────────────────────────────────────────────────────────

/** The reader pair for the directory card display catalog. Exposed for tests
 *  and the `readFieldSurfaceBoth` parity harness. */
export const directoryCardCatalogReaderPair: FieldSurfaceReaderPair<
  [SupabaseClient | null, DirectoryCardCatalogArgs],
  DirectoryCardDisplayCatalog
> = {
  readA: readDirectoryCardCatalogFromA,
  readB: readDirectoryCardCatalogFromB,
};

/**
 * PUBLIC entry — load the directory card display catalog from the active
 * source for the `directory_cards` surface.
 *
 * Default (`directory_cards:a`): byte-identical to the existing
 * `loadDirectoryCardDisplayCatalogUncached` — reads System A.
 * `directory_cards:b`: reads canonical System B (`profile_field_definitions`),
 * projects to the identical `DirectoryCardDisplayCatalog` shape. A B-read
 * that throws safe-falls-back to A (the surface never hardens a broken catalog).
 *
 * Rollback: set `FIELD_ENGINE_READ_SOURCE=directory_cards:a` (or `=a`) in
 * Vercel env and redeploy — no code change needed.
 */
export function readDirectoryCardCatalog(
  supabase: SupabaseClient | null,
  opts: DirectoryCardCatalogArgs,
): Promise<DirectoryCardDisplayCatalog> {
  return readFieldSurface(
    "directory_cards",
    directoryCardCatalogReaderPair,
    supabase,
    opts,
  );
}

// Re-export the bridging helper for the unit test
export { bKeyToAKey, bKindToValueType };
