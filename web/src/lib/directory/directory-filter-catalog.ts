import { unstable_cache } from "next/cache";
import { CACHE_TAG_DIRECTORY } from "@/lib/cache-tags";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { logServerError } from "@/lib/server/safe-error";

export type DirectoryHeightFilterConfig = {
  enabled: boolean;
  /** Slider / clamp bounds — System B `directory_filter_config.{min,max}` when
   *  the `directory_facets` flag is `b`, else legacy A `field_definitions.config`. */
  sliderMinCm: number;
  sliderMaxCm: number;
  labelEn: string;
  labelEs: string | null;
};

const DEFAULT_SLIDER_MIN = 140;
const DEFAULT_SLIDER_MAX = 220;

const HEIGHT_FALLBACK: DirectoryHeightFilterConfig = {
  enabled: false,
  sliderMinCm: DEFAULT_SLIDER_MIN,
  sliderMaxCm: DEFAULT_SLIDER_MAX,
  labelEn: "Height (cm)",
  labelEs: null,
};

/** Clamp a raw bound to the absolute safety band + round (shared by A + B). */
function clampBound(raw: number, fallback: number): number {
  return Number.isFinite(raw)
    ? Math.round(Math.min(250, Math.max(100, raw)))
    : fallback;
}

/**
 * System-B height-filter catalog: reads `physical.height_cm`'s
 * `directory_filter_config.{min,max}` + the canonical `show_in_directory_filter`
 * COLUMN, returning the IDENTICAL shape as the A reader. Throws on a DB error so
 * the caller safe-falls-back to A.
 */
async function loadHeightFilterCatalogFromB(
  supabase: ReturnType<typeof createPublicSupabaseClient>,
): Promise<DirectoryHeightFilterConfig> {
  if (!supabase) return HEIGHT_FALLBACK;
  const { data, error } = await supabase
    .from("profile_field_definitions")
    .select("show_in_directory_filter, deprecated_at, directory_filter_config, label, label_es")
    .eq("field_key", "physical.height_cm")
    .maybeSingle();
  if (error) {
    throw new Error(`[directory] height filter config (System B): ${error.message}`);
  }
  if (!data) return HEIGHT_FALLBACK;
  const r = data as {
    show_in_directory_filter?: boolean | null;
    deprecated_at?: string | null;
    directory_filter_config?: { min?: unknown; max?: unknown } | null;
    label?: string | null;
    label_es?: string | null;
  };
  const enabled = Boolean(r.show_in_directory_filter === true && r.deprecated_at == null);
  const cfg = r.directory_filter_config ?? {};
  const rawMin = typeof cfg.min === "number" ? cfg.min : Number(cfg.min);
  const rawMax = typeof cfg.max === "number" ? cfg.max : Number(cfg.max);
  const sliderMinCm = clampBound(rawMin, DEFAULT_SLIDER_MIN);
  const sliderMaxCm = clampBound(rawMax, DEFAULT_SLIDER_MAX);
  return {
    enabled,
    sliderMinCm: Math.min(sliderMinCm, sliderMaxCm),
    sliderMaxCm: Math.max(sliderMinCm, sliderMaxCm),
    labelEn:
      typeof r.label === "string" && r.label.trim() ? r.label.trim() : "Height (cm)",
    labelEs: typeof r.label_es === "string" && r.label_es.trim() ? r.label_es.trim() : null,
  };
}

async function loadHeightFilterCatalogUncached(): Promise<DirectoryHeightFilterConfig> {
  const supabase = createPublicSupabaseClient();
  if (!supabase) {
    return { ...HEIGHT_FALLBACK };
  }

  // T3.2 — System A removed. The height filter config reads canonical System B
  // ONLY (`profile_field_definitions.directory_filter_config` for the slider
  // bounds + the `show_in_directory_filter` column for enablement, keyed by the
  // single canonical key `physical.height_cm`; no tenant-override row mechanism is
  // involved). On a B read error, fall back to the safe HEIGHT_FALLBACK (filtering
  // disabled) rather than the retired legacy `field_definitions` read.
  try {
    return await loadHeightFilterCatalogFromB(supabase);
  } catch (err) {
    logServerError("directory/height-filter-catalog/b", err);
    return { ...HEIGHT_FALLBACK };
  }
}

/** Whether height range filtering is allowed + UI bounds (cached with directory). */
export function getCachedDirectoryHeightFilterConfig(): Promise<DirectoryHeightFilterConfig> {
  return unstable_cache(
    () => loadHeightFilterCatalogUncached(),
    ["directory-height-filter-catalog-v3-b-config"],
    { tags: [CACHE_TAG_DIRECTORY], revalidate: 120 },
  )();
}

/** Clamp requested URL range to catalog slider + absolute safety band. */
export function clampHeightRangeToCatalog(
  minCm: number | null,
  maxCm: number | null,
  catalog: DirectoryHeightFilterConfig,
): { minCm: number | null; maxCm: number | null } {
  if (!catalog.enabled) return { minCm: null, maxCm: null };
  const lo = catalog.sliderMinCm;
  const hi = catalog.sliderMaxCm;
  let a = minCm;
  let b = maxCm;
  if (a != null) a = Math.min(hi, Math.max(lo, a));
  if (b != null) b = Math.min(hi, Math.max(lo, b));
  if (a != null && b != null && a > b) {
    const t = a;
    a = b;
    b = t;
  }
  return { minCm: a, maxCm: b };
}
