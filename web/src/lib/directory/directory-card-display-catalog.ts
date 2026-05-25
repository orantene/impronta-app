import { unstable_cache } from "next/cache";
import { CACHE_TAG_DIRECTORY } from "@/lib/cache-tags";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createPublicSupabaseClient } from "@/lib/supabase/public";

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

function isVisibleDirectoryCardField(row: DirectoryCardFieldCatalogRow): boolean {
  return Boolean(
    !row.archived_at &&
      row.active === true &&
      row.internal_only !== true &&
      row.public_visible === true &&
      row.profile_visible === true,
  );
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

  const fitRow = effectiveRows.find((row) => row.key === "fit_labels") ?? null;

  let fitLabelsEnabled = true;
  if (fitRow) {
    fitLabelsEnabled = isVisibleDirectoryCardField(fitRow) && fitRow.card_visible === true;
  }

  const cardVisibleRows = effectiveRows.filter(
    (row) => isVisibleDirectoryCardField(row) && row.card_visible === true,
  );
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

/** Cached field catalog for directory cards — invalidated with `CACHE_TAG_DIRECTORY`. */
export function getCachedDirectoryCardDisplayCatalog(
  opts: DirectoryCardDisplayCatalogOptions = {},
): Promise<DirectoryCardDisplayCatalog> {
  const tenantId = opts.tenantId ?? null;
  const cacheKey = tenantId
    ? `directory-card-display-catalog-v4:${tenantId}`
    : "directory-card-display-catalog-v4:canonical";
  return unstable_cache(
    () => loadDirectoryCardDisplayCatalogUncached({ tenantId }),
    [cacheKey],
    { tags: [CACHE_TAG_DIRECTORY], revalidate: 120 },
  )();
}
