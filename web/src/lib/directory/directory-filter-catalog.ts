import { unstable_cache } from "next/cache";
import { CACHE_TAG_DIRECTORY } from "@/lib/cache-tags";
import { createPublicSupabaseClient } from "@/lib/supabase/public";

export type DirectoryHeightFilterConfig = {
  enabled: boolean;
  /** Slider / clamp bounds from `field_definitions.config` */
  sliderMinCm: number;
  sliderMaxCm: number;
  labelEn: string;
  labelEs: string | null;
};

const DEFAULT_SLIDER_MIN = 140;
const DEFAULT_SLIDER_MAX = 220;

async function loadHeightFilterCatalogUncached(): Promise<DirectoryHeightFilterConfig> {
  const supabase = createPublicSupabaseClient();
  if (!supabase) {
    return {
      enabled: false,
      sliderMinCm: DEFAULT_SLIDER_MIN,
      sliderMaxCm: DEFAULT_SLIDER_MAX,
      labelEn: "Height (cm)",
      labelEs: null,
    };
  }

  type HeightRow = {
    filterable?: boolean;
    directory_filter_visible?: boolean | null;
    active?: boolean;
    archived_at?: string | null;
    config?: unknown;
    label_en?: string;
    label_es?: string | null;
  };

  const first = await supabase
    .from("field_definitions")
    .select("filterable, directory_filter_visible, active, archived_at, config, label_en, label_es")
    .eq("key", "height_cm")
    .maybeSingle();

  let row: HeightRow | null = first.data as HeightRow | null;
  let error = first.error;

  const colMissing =
    error && `${error.message ?? ""}`.toLowerCase().includes("directory_filter_visible");
  if (colMissing) {
    const retry = await supabase
      .from("field_definitions")
      .select("filterable, active, archived_at, config, label_en, label_es")
      .eq("key", "height_cm")
      .maybeSingle();
    row = retry.data as HeightRow | null;
    error = retry.error;
  }

  if (error || !row) {
    return {
      enabled: false,
      sliderMinCm: DEFAULT_SLIDER_MIN,
      sliderMaxCm: DEFAULT_SLIDER_MAX,
      labelEn: "Height (cm)",
      labelEs: null,
    };
  }

  const r = row;
  const dirOn =
    r.directory_filter_visible !== undefined && r.directory_filter_visible !== null
      ? r.directory_filter_visible === true
      : r.filterable === true;
  const active = Boolean(r.active === true && r.archived_at == null && dirOn);
  const cfg = (row.config ?? {}) as { min?: unknown; max?: unknown };
  const rawMin = typeof cfg.min === "number" ? cfg.min : Number(cfg.min);
  const rawMax = typeof cfg.max === "number" ? cfg.max : Number(cfg.max);
  const sliderMinCm = Number.isFinite(rawMin)
    ? Math.round(Math.min(250, Math.max(100, rawMin)))
    : DEFAULT_SLIDER_MIN;
  const sliderMaxCm = Number.isFinite(rawMax)
    ? Math.round(Math.min(250, Math.max(100, rawMax)))
    : DEFAULT_SLIDER_MAX;

  return {
    enabled: active,
    sliderMinCm: Math.min(sliderMinCm, sliderMaxCm),
    sliderMaxCm: Math.max(sliderMinCm, sliderMaxCm),
    labelEn: typeof row.label_en === "string" && row.label_en.trim() ? row.label_en.trim() : "Height (cm)",
    labelEs: typeof row.label_es === "string" && row.label_es.trim() ? row.label_es.trim() : null,
  };
}

/** Whether height range filtering is allowed + UI bounds (cached with directory). */
export function getCachedDirectoryHeightFilterConfig(): Promise<DirectoryHeightFilterConfig> {
  return unstable_cache(
    () => loadHeightFilterCatalogUncached(),
    ["directory-height-filter-catalog-v2"],
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
