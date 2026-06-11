import { unstable_cache } from "next/cache";
import { CACHE_TAG_DIRECTORY } from "@/lib/cache-tags";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import {
  isResolvedFieldVisibleOnDirectoryCard,
  type PublicSurfaceContext,
} from "@/lib/field-engine/public-surface-visibility";
import { readDirectoryCardCatalog } from "@/lib/field-engine/read-source-directory-cards";

export type DirectoryCardScalarDef = {
  id: string;
  key: string;
  value_type: string;
  taxonomy_kind: string | null;
  sort_order: number;
  label_en: string;
  label_es: string | null;
};

export type DirectoryCardDisplayCatalog = {
  /** Fit-label chips when `fit_labels` passes the same visibility stack as other card traits. */
  fitLabelsEnabled: boolean;
  /** `height_cm` uses `talent_profiles.height_cm` when this definition is card-eligible. */
  heightCardDef: DirectoryCardScalarDef | null;
  /** Dynamic lines: `card_visible` scalars except `fit_labels` and `height_cm`. */
  scalarCardDefs: DirectoryCardScalarDef[];
};

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

type DirectoryCardDisplayCatalogOptions = {
  tenantId?: string | null;
};

export function pickEffectiveDirectoryCardFieldRows(
  rows: readonly DirectoryCardFieldCatalogRow[],
  tenantId: string | null,
): DirectoryCardFieldCatalogRow[] {
  const byKey = new Map<string, { canonical: DirectoryCardFieldCatalogRow | null; tenant: DirectoryCardFieldCatalogRow | null }>();
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

async function loadDirectoryCardDisplayCatalogUncached(
  opts: DirectoryCardDisplayCatalogOptions = {},
): Promise<DirectoryCardDisplayCatalog> {
  const tenantId = opts.tenantId ?? null;
  const publicSupabase = createPublicSupabaseClient();
  const supabase = createServiceRoleClient() ?? publicSupabase;
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

  const effectiveRows = pickEffectiveDirectoryCardFieldRows(
    [
      ...((canonicalRes.data ?? []) as DirectoryCardFieldCatalogRow[]),
      ...((tenantRes.data ?? []) as DirectoryCardFieldCatalogRow[]),
    ],
    tenantId,
  );
  // Route all effective rows through the unified resolver helper. The helper
  // checks bridged keys against the canonical resolver (effectiveFieldVisibility
  // + show_in_directory) AND the legacy surface flags (public_visible,
  // profile_visible, card_visible, internal_only) — R1: legacy flags gate
  // first, canonical ANDs on top. Non-bridged keys (fit_labels, etc.) go
  // through the synthetic C2 path (Phase 2 collapse target).
  const ctx: PublicSurfaceContext = { supabase, tenantId };
  const cardVisible = await Promise.all(
    effectiveRows.map((row) => isResolvedFieldVisibleOnDirectoryCard(row, ctx)),
  );
  const cardVisibleRows = effectiveRows.filter((_, i) => cardVisible[i]);

  // fit_labels: enabled by default; disabled only when its row exists in
  // effectiveRows but fails the card visibility check (explicit opt-out).
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

/** Cached field catalog for directory cards — invalidated with `CACHE_TAG_DIRECTORY`.
 *
 *  T2.4: the uncached load is now dispatched through the `directory_cards`
 *  read-source seam (`read-source-directory-cards.ts`). Flag `a` (default)
 *  preserves the legacy System A read byte-for-byte; flag `b` reads canonical
 *  System B. Kill switch: `FIELD_ENGINE_READ_SOURCE=directory_cards:a`.
 */
export function getCachedDirectoryCardDisplayCatalog(
  opts: DirectoryCardDisplayCatalogOptions = {},
): Promise<DirectoryCardDisplayCatalog> {
  const tenantId = opts.tenantId ?? null;
  const cacheKey = tenantId
    ? `directory-card-display-catalog-v4:${tenantId}`
    : "directory-card-display-catalog-v4:canonical";
  const publicSupabase = createPublicSupabaseClient();
  const supabase = createServiceRoleClient() ?? publicSupabase;
  return unstable_cache(
    () => readDirectoryCardCatalog(supabase, { tenantId }),
    [cacheKey],
    { tags: [CACHE_TAG_DIRECTORY], revalidate: 120 },
  )();
}
