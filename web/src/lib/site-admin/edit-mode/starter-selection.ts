import type { SectionTypeKey } from "@/lib/site-admin/sections/registry";
import { SECTION_TEMPLATE_STARTERS } from "@/lib/site-admin/sections/shared/section-template-starters";

const HOME_CORE_SECTION_TYPES: ReadonlySet<SectionTypeKey> = new Set(
  SECTION_TEMPLATE_STARTERS.filter((starter) => starter.homeCore).map(
    (starter) => starter.sectionTypeKey,
  ),
);

/**
 * Backward-compatible alias: callers previously used ESSENTIAL_HOME_* naming.
 * "Essential home" now maps to the canonical Home Core starter sequence.
 */
export const ESSENTIAL_HOME_SECTION_TYPES = HOME_CORE_SECTION_TYPES;

export function resolveEssentialHomeIndexes(
  sectionTypeKeys: ReadonlyArray<SectionTypeKey>,
): number[] {
  return sectionTypeKeys
    .map((typeKey, index) => ({ typeKey, index }))
    .filter((row) => ESSENTIAL_HOME_SECTION_TYPES.has(row.typeKey))
    .map((row) => row.index);
}

export const STARTER_STYLE_OPTIONS_BY_TYPE: Partial<
  Record<SectionTypeKey, ReadonlyArray<{ id: string; label: string }>>
> = {
  hero: [
    { id: "clean-center", label: "Clean center" },
    { id: "editorial-airy", label: "Editorial airy" },
    { id: "cinematic-dark", label: "Cinematic dark" },
  ],
  category_grid: [
    { id: "editorial-tiles", label: "Editorial tiles" },
    { id: "icon-cloud", label: "Icon cloud" },
    { id: "scroll-rail", label: "Scroll rail" },
  ],
  featured_talent: [
    { id: "grid-standard", label: "Grid standard" },
    { id: "carousel-focus", label: "Carousel focus" },
  ],
  gallery_strip: [
    { id: "mosaic-editorial", label: "Mosaic editorial" },
    { id: "uniform-grid", label: "Uniform grid" },
    { id: "scroll-lookbook", label: "Scroll lookbook" },
  ],
  cta_banner: [
    { id: "centered-overlay", label: "Centered overlay" },
    { id: "split-image", label: "Split image" },
    { id: "minimal-band", label: "Minimal band" },
  ],
  map_overlay: [
    { id: "wide-panorama", label: "Wide panorama" },
    { id: "balanced-map", label: "Balanced map" },
  ],
};

export const STARTER_ENTRY_STYLE_PRESETS: Partial<
  Record<SectionTypeKey, Record<string, Record<string, unknown>>>
> = {
  hero: {
    "clean-center": {
      mood: "clean",
      overlay: "gradient-scrim",
      presentation: {
        align: "center",
        containerWidth: "wide",
      },
    },
    "editorial-airy": {
      mood: "editorial",
      overlay: "soft-vignette",
      presentation: {
        align: "left",
        containerWidth: "wide",
        paddingTop: "editorial",
      },
    },
    "cinematic-dark": {
      mood: "cinematic",
      overlay: "aurora",
      presentation: {
        align: "center",
        containerWidth: "narrow",
      },
    },
  },
  category_grid: {
    "editorial-tiles": {
      variant: "portrait-masonry",
      columnsDesktop: 4,
    },
    "icon-cloud": {
      variant: "small-icon-list",
      columnsDesktop: 4,
    },
    "scroll-rail": {
      variant: "horizontal-scroll",
      columnsDesktop: 3,
    },
  },
  featured_talent: {
    "grid-standard": {
      variant: "grid",
      columnsDesktop: 4,
    },
    "carousel-focus": {
      variant: "carousel",
      columnsDesktop: 3,
    },
  },
  gallery_strip: {
    "mosaic-editorial": {
      variant: "mosaic",
    },
    "uniform-grid": {
      variant: "grid-uniform",
    },
    "scroll-lookbook": {
      variant: "scroll-rail",
    },
  },
  cta_banner: {
    "centered-overlay": {
      variant: "centered-overlay",
      insetCard: true,
    },
    "split-image": {
      variant: "split-image",
      imageSide: "right",
      insetCard: false,
    },
    "minimal-band": {
      variant: "minimal-band",
      bandTone: "espresso",
    },
  },
  map_overlay: {
    "wide-panorama": {
      ratio: "21/9",
      side: "card-bottom",
    },
    "balanced-map": {
      ratio: "16/9",
      side: "card-right",
    },
  },
};

export const STARTER_SECTION_SOURCE_BY_TYPE: Partial<
  Record<SectionTypeKey, "live-data" | "starter-content" | "navigation">
> = {
  featured_talent: "live-data",
  map_overlay: "live-data",
  category_grid: "navigation",
};

export function sectionSourceLabel(typeKey: SectionTypeKey): string {
  const source = STARTER_SECTION_SOURCE_BY_TYPE[typeKey] ?? "starter-content";
  if (source === "live-data") return "Live data";
  if (source === "navigation") return "Navigation data";
  return "Starter content";
}

export function sectionSourceKind(
  typeKey: SectionTypeKey,
): "live-data" | "starter-content" | "navigation" {
  return STARTER_SECTION_SOURCE_BY_TYPE[typeKey] ?? "starter-content";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function mergeStarterRecords(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const current = next[key];
    next[key] =
      isPlainObject(current) && isPlainObject(value)
        ? mergeStarterRecords(current, value)
        : value;
  }
  return next;
}

export function parseSelectedStarterEntryIndexes(
  formData: FormData,
  totalEntries: number,
): Set<number> | null {
  const raw = formData.getAll("starterEntryIndex");
  if (raw.length === 0) return null;
  const selected = new Set<number>();
  for (const value of raw) {
    const asNumber =
      typeof value === "string" ? Number.parseInt(value, 10) : Number.NaN;
    if (!Number.isFinite(asNumber)) continue;
    if (asNumber < 0 || asNumber >= totalEntries) continue;
    selected.add(asNumber);
  }
  return selected;
}

export function parseSelectedStarterEntryStyles(
  formData: FormData,
  totalEntries: number,
): Map<number, string> {
  const out = new Map<number, string>();
  for (const value of formData.getAll("starterEntryStyle")) {
    if (typeof value !== "string") continue;
    const [indexRaw, styleIdRaw] = value.split(":", 2);
    const index = Number.parseInt(indexRaw ?? "", 10);
    const styleId = (styleIdRaw ?? "").trim();
    if (!Number.isFinite(index) || index < 0 || index >= totalEntries) continue;
    if (!styleId) continue;
    out.set(index, styleId);
  }
  return out;
}

export function resolveStarterEntryStylePatch(
  sectionTypeKey: SectionTypeKey,
  styleId: string | undefined,
): Record<string, unknown> | null {
  if (!styleId) return null;
  const map = STARTER_ENTRY_STYLE_PRESETS[sectionTypeKey];
  if (!map) return null;
  return map[styleId] ?? null;
}
