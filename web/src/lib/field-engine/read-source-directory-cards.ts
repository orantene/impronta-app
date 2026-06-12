// src/lib/field-engine/read-source-directory-cards.ts
//
// T2.4 → T3.2b — DIRECTORY CARD SCALAR-METADATA CATALOG, collapsed to System B.
//
// The directory card display pipeline reads a catalog of scalar field
// definitions from `directory-card-display-catalog.ts`. T2.4 put it behind the
// read-source seam with an A-reader (legacy `field_definitions`) and a B-reader
// (canonical `profile_field_definitions`); the `directory_cards` flag defaulted
// to `b`. T3.2b COLLAPSED the surface to System B only: the legacy
// `field_definitions` A-reader was deleted (System A is being retired), and the
// B-reader's residual `field_definitions` METADATA fetch (sort_order +
// taxonomy_kind) was repointed to the frozen directory catalog registry
// (`directory-field-catalog-registry.ts`, captured 1:1 from prod). Both seam
// legs now point at the B reader, preserving the `readFieldSurface` shell + the
// safe-fallback path (which re-runs the same B read). NO `field_definitions`
// read remains.
//
// WHAT THE B-READER PRODUCES:
//   • The field-definition METADATA (value_type, label_en/es, taxonomy_kind,
//     sort_order, id) for the card scalar catalog. Visibility comes from B
//     (`show_in_directory_card` via the canonical resolver); the structural
//     metadata B does not carry (taxonomy_kind, A sort_order, the A def-id the
//     value-store joins on) comes from the frozen registry.
//   • The `fitLabelsEnabled` gate (derived from whether `fit_labels` passes the
//     canonical visibility check).
//   • `heightCardDef` (the special `height_cm` path).
//   • `scalarCardDefs` (all other card-visible scalars).
//
// WHAT DOES NOT MOVE:
//   • The visibility DECISION — already canonical (Phase 1.4).
//     `isResolvedFieldVisibleOnDirectoryCard` reads `profile_field_definitions`
//     via the batch canonical loader. It IGNORES the legacy flag columns
//     (Sub-Task 5), so the synthesized guard row below carries only base-guard
//     defaults.
//   • Tenant overrides for `show_in_directory_card` — confirmed ZERO prod
//     overrides (2026-06-11, in BOTH `field_definitions.tenant_id` and
//     `workspace_profile_field_settings`). The resolver checks the B override
//     home and returns identical decisions for any tenantId.
//
// PARITY (prod 2026-06-11): the card-visible set is height_cm, industries,
//   fit_labels; fitLabelsEnabled=true; heightCardDef=height_cm; scalarCardDefs
//   keys [industries, fit_labels] in A sort order (40, 60). `identity.gender`
//   (B-only, no A legacy key) is excluded — column-backed, no card-builder path.
//   The frozen registry supplies the A sort_order (10/40/60) + taxonomy_kind so
//   the projected order + shape is byte-identical to the prior T2.4 B-read.

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { FieldSurfaceReaderPair } from "@/lib/field-engine/read-source";
import { readFieldSurface } from "@/lib/field-engine/read-source";
import {
  isResolvedFieldVisibleOnDirectoryCard,
  type PublicSurfaceContext,
} from "@/lib/field-engine/public-surface-visibility";
import { NEW_TO_OLD_KEY } from "@/lib/fields/legacy-mirror";
import {
  DIRECTORY_FILTER_CATALOG_REGISTRY,
  DIRECTORY_CARD_CANDIDATE_REGISTRY,
} from "@/lib/field-engine/directory-field-catalog-registry";
// Types only — avoid a runtime circular import (directory-card-display-catalog
// imports readDirectoryCardCatalog from this module; we import the result types
// back, which TypeScript erases at emit).
import type {
  DirectoryCardDisplayCatalog,
  DirectoryCardScalarDef,
} from "@/lib/directory/directory-card-display-catalog";

// ── Options ───────────────────────────────────────────────────────────────────

type DirectoryCardCatalogArgs = { tenantId: string | null };

// ── B-reader: canonical System B (profile_field_definitions) ──────────────────
//
// Reads `profile_field_definitions` for non-deprecated rows with
// `show_in_directory_card=true`, projects each to `DirectoryCardScalarDef`
// using the A→B key bridge in reverse (NEW_TO_OLD_KEY + self-mapping taxonomy
// keys), and uses the A `field_definitions.sort_order` value (from the frozen
// catalog registry) to preserve card attribute ordering.
//
// The canonical visibility decision (isResolvedFieldVisibleOnDirectoryCard) is
// called with a synthesized base-guard row (active + non-archived). The ACTUAL
// decision comes from the canonical batch loader (profile_field_definitions),
// so the legacy guard columns are nominal.
//
// B rows without an A legacy key (identity.gender) are filtered out — they have
// no A def-id and no entry in NEW_TO_OLD_KEY / the taxonomy direct-map.
//
// taxonomy_kind + sort_order + the A def-id: B has no taxonomy_kind column and
// its `display_order` diverges from A's `sort_order`; both are sourced from the
// frozen registry so the projected shape is byte-identical to the prior read.

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

/** Frozen A-metadata (id, sort_order, taxonomy_kind) keyed by A legacy key,
 *  built once from the registry. Replaces the residual `field_definitions`
 *  metadata fetch the B-reader used to run. */
const A_META_BY_KEY = new Map<
  string,
  { id: string; sort_order: number; taxonomy_kind: string | null }
>(
  [...DIRECTORY_FILTER_CATALOG_REGISTRY, ...DIRECTORY_CARD_CANDIDATE_REGISTRY].map(
    (r) => [r.key, { id: r.id, sort_order: r.sort_order, taxonomy_kind: r.taxonomy_kind }],
  ),
);

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
    // No bridged rows — return the safe-empty catalog (fit labels default on).
    return { fitLabelsEnabled: true, heightCardDef: null, scalarCardDefs: [] };
  }

  // Step 3 — route each bridged row through the canonical visibility resolver.
  // We synthesize an A-shaped guard row so the resolver's base-guard (active +
  // non-archived) passes. The actual visibility decision comes from the
  // canonical batch loader (B store).
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

  // Step 4 — assemble the catalog from resolver-approved rows.
  // fit_labels gating: if fit_labels was in the B rows, check if it passed.
  const fitLabelsBridged = bridgedRows.some(({ aKey }) => aKey === "fit_labels");
  const fitLabelsPassedResolver = bridgedRows.some(
    ({ aKey }, i) => aKey === "fit_labels" && cardVisible[i],
  );
  const fitLabelsEnabled = fitLabelsBridged ? fitLabelsPassedResolver : true;

  const approvedDefs: DirectoryCardScalarDef[] = bridgedRows
    .filter((_, i) => cardVisible[i])
    .map(({ bRow, aKey }) => {
      const aMeta = A_META_BY_KEY.get(aKey);
      return {
        // Use the A field_definitions.id as the def id so the card value-lookup
        // pipeline (which joins by A field_definition_id) continues to work.
        id: aMeta?.id ?? bRow.id,
        key: aKey,
        value_type: bKindToValueType(bRow.kind),
        taxonomy_kind: aMeta?.taxonomy_kind ?? null,
        // Use the A sort_order (frozen registry) to preserve card attribute
        // display order. B's display_order diverges for this surface.
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

/** The reader pair for the directory card display catalog. T3.2b collapsed this
 *  surface to System B ONLY: the legacy `field_definitions` A-reader was deleted.
 *  Both legs point at the canonical B reader, so the `readFieldSurface` seam
 *  shell + the `directory_cards` flag are preserved (the flag no longer switches
 *  stores — both resolve to B) and the safe-fallback path re-runs the same B
 *  read. NO `field_definitions` read remains. */
export const directoryCardCatalogReaderPair: FieldSurfaceReaderPair<
  [SupabaseClient | null, DirectoryCardCatalogArgs],
  DirectoryCardDisplayCatalog
> = {
  readA: readDirectoryCardCatalogFromB,
  readB: readDirectoryCardCatalogFromB,
};

/**
 * PUBLIC entry — load the directory card display catalog for the
 * `directory_cards` surface from canonical System B
 * (`profile_field_definitions`), projecting to the `DirectoryCardDisplayCatalog`
 * shape. (T3.2b: System A removed — both seam legs read B; the `directory_cards`
 * flag no longer switches stores.)
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
