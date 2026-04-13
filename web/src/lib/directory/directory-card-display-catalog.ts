import { unstable_cache } from "next/cache";
import { CACHE_TAG_DIRECTORY } from "@/lib/cache-tags";
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

async function loadDirectoryCardDisplayCatalogUncached(): Promise<DirectoryCardDisplayCatalog> {
  const supabase = createPublicSupabaseClient();
  if (!supabase) {
    return { fitLabelsEnabled: true, heightCardDef: null, scalarCardDefs: [] };
  }

  /** Same gates as scalar card traits: public + profile + card visibility (plus active / not archived / not internal). */
  const { data: fitRow, error: fitErr } = await supabase
    .from("field_definitions")
    .select("card_visible, active, archived_at, internal_only, public_visible, profile_visible")
    .eq("key", "fit_labels")
    .maybeSingle();

  let fitLabelsEnabled = true;
  if (!fitErr && fitRow) {
    fitLabelsEnabled = Boolean(
      !fitRow.archived_at &&
        fitRow.active === true &&
        fitRow.internal_only !== true &&
        fitRow.public_visible === true &&
        fitRow.profile_visible === true &&
        fitRow.card_visible === true,
    );
  }

  /** Directory card trait catalog (excluding fit_labels height special-cases above). */
  const { data: rows, error } = await supabase
    .from("field_definitions")
    .select("id, key, value_type, taxonomy_kind, sort_order, label_en, label_es")
    .is("archived_at", null)
    .eq("active", true)
    .eq("internal_only", false)
    .eq("public_visible", true)
    .eq("profile_visible", true)
    .eq("card_visible", true);

  if (error || !rows?.length) {
    return { fitLabelsEnabled, heightCardDef: null, scalarCardDefs: [] };
  }

  const defs: DirectoryCardScalarDef[] = rows.map((r) => ({
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
export function getCachedDirectoryCardDisplayCatalog(): Promise<DirectoryCardDisplayCatalog> {
  return unstable_cache(
    () => loadDirectoryCardDisplayCatalogUncached(),
    ["directory-card-display-catalog-v3"],
    { tags: [CACHE_TAG_DIRECTORY], revalidate: 120 },
  )();
}
