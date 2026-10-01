/**
 * "Save as new design" (Template Factory S13): pure helpers, no I/O.
 * Slug derivation, the independent payload copy, and the gallery meta
 * fallback for authored Designs that have no code builtin.
 */
import { COLLECTION_DESIGNS } from "@/lib/talent-site/theme-catalog/collection/designs";
import type { GalleryDesign, Localized } from "@/lib/talent-site/theme-catalog/gallery-meta";
import type { DesignPayload, ThemePreview } from "@/lib/talent-site/theme-catalog/types";

const SLUG_MAX = 48;

/** Slugs that can never be taken by an authored design (code builtins). */
export function reservedDesignSlugs(): string[] {
  return ["maison", ...COLLECTION_DESIGNS.map((d) => d.slug)];
}

/** kebab-case of a name; accents folded; matches the catalog slug check. */
export function slugifyDesignName(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, "");
  return base || "design";
}

/** First free slug: `base`, `base-2`, `base-3`, ... against taken (case-insensitive). */
export function deriveUniqueDesignSlug(name: string, taken: Iterable<string>): string {
  const used = new Set([...taken].map((s) => s.toLowerCase()));
  for (const r of reservedDesignSlugs()) used.add(r);
  const base = slugifyDesignName(name);
  if (!used.has(base)) return base;
  for (let n = 2; n < 10_000; n += 1) {
    const suffix = `-${n}`;
    const candidate = `${base.slice(0, SLUG_MAX - suffix.length)}${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${base.slice(0, SLUG_MAX - 9)}-${Date.now().toString(36)}`;
}

function stripDesignKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripDesignKeys);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === "designKey") continue;
      out[k] = stripDesignKeys(v);
    }
    return out;
  }
  return value;
}

/**
 * Independent copy of a design payload for a NEW design identity: deep clone
 * (no shared references with the source) and every frozen `designKey`
 * dropped; the server then mints the new design's own keys (S2 `ensureDesignKeys`).
 */
export function copyDesignPayload(source: DesignPayload): DesignPayload {
  return stripDesignKeys(JSON.parse(JSON.stringify(source))) as DesignPayload;
}

/** Preview JSON stored on the authored catalog row. */
export function authoredPreview(names: Localized, paletteSource: string, base: ThemePreview = {}): ThemePreview {
  return { ...base, names: { en: names.en, es: names.es }, paletteSource };
}

/**
 * Gallery meta for an authored design: name from the catalog row, palettes,
 * fonts, tags and professions inherited from the source design. `source` is
 * the code design's gallery entry (undefined when unknown: a bare entry).
 */
export function galleryDesignFromAuthored(
  row: { slug: string; title: string; summary?: string; preview?: ThemePreview | null },
  source: GalleryDesign | undefined,
): GalleryDesign {
  const names = row.preview?.names;
  const desc = source?.description ?? { en: row.summary ?? "", es: row.summary ?? "" };
  return {
    slug: row.slug,
    name: names?.en || row.title,
    description: desc,
    styleTags: source?.styleTags ?? [],
    featureTags: source?.featureTags ?? [],
    professions: source?.professions ?? [],
    categoryChips: source?.categoryChips ?? [],
    palettes: source?.palettes ?? [],
    ...(source?.fonts ? { fonts: source.fonts } : {}),
    demos: [],
  };
}
