/**
 * Pure state + derivations for the browse gallery (P3, 2026-09-28).
 * Reads `gallery-meta` only; no React, no DOM beyond guarded sessionStorage.
 */
import {
  GALLERY_EMPTY_SUGGESTIONS,
  GALLERY_PROFESSIONS,
  GALLERY_STYLE_TAGS,
  normalizeSearchText,
  professionsForTerm,
  searchGallery,
  splitQuery,
  tagCounts,
  visibleGalleryDesigns,
  type GalleryCategoryChip,
  type GalleryFeatureTag,
  type GalleryProfession,
  type GallerySearchOutput,
  type GallerySearchResult,
  type GalleryStyleTag,
} from "@/lib/talent-site/theme-catalog/gallery-meta";

export type GalleryBrowseState = {
  query: string;
  chip: GalleryCategoryChip | null;
  /** "Visual style" dropdown (single). */
  style: GalleryStyleTag | null;
  /** Tags dropdown (multi): style tags and layout/feature tags, all must match. */
  tags: string[];
  combined: boolean;
  lastViewed: string | null;
  scrollY: number;
};

export const GALLERY_BROWSE_STORAGE_KEY = "tulala.gallery-browse.v1";

export const DEFAULT_GALLERY_BROWSE_STATE: GalleryBrowseState = {
  query: "",
  chip: null,
  style: null,
  tags: [],
  combined: false,
  lastViewed: null,
  scrollY: 0,
};

const isStyleTag = (t: string): t is GalleryStyleTag => (GALLERY_STYLE_TAGS as readonly string[]).includes(t);

export function isFilterActive(s: GalleryBrowseState): boolean {
  return Boolean(s.query.trim() || s.chip || s.style || s.tags.length || s.combined);
}

/** Filters reset; lastViewed and scroll are kept apart (callers decide). */
export function resetFilters(s: GalleryBrowseState): GalleryBrowseState {
  return { ...s, query: "", chip: null, style: null, tags: [], combined: false };
}

export function queryTerms(query: string): string[] {
  return splitQuery(query);
}

/** Remove one term from a multi-term query (removable profession chips). */
export function removeQueryTerm(query: string, index: number): string {
  return queryTerms(query)
    .filter((_, i) => i !== index)
    .join(", ");
}

export type GalleryBrowseView = {
  output: GallerySearchOutput;
  /** Results before the Tags filter, used for dropdown counts. */
  countsBase: GallerySearchResult[];
  top: GallerySearchResult[];
  rest: GallerySearchResult[];
  terms: string[];
};

export function deriveGalleryView(s: GalleryBrowseState): GalleryBrowseView {
  const terms = queryTerms(s.query);
  const featureTags = s.tags.filter((t) => !isStyleTag(t)) as GalleryFeatureTag[];
  const styleTagFilters = s.tags.filter(isStyleTag);
  const base = searchGallery({
    query: s.query,
    chips: s.chip ? [s.chip] : [],
    styleTags: s.style ? [s.style] : [],
    combined: s.combined,
  });
  const filtered = base.results.filter(
    (r) =>
      featureTags.every((t) => r.design.featureTags.includes(t)) &&
      styleTagFilters.every((t) => r.design.styleTags.includes(t)),
  );
  const output: GallerySearchOutput = {
    results: filtered,
    demoCount: filtered.reduce((n, r) => n + r.matchingDemos.length, 0),
    themeCount: filtered.length,
    suggestionsWhenEmpty: filtered.length ? [] : emptySuggestions(),
  };
  const multi = terms.length >= 2;
  const top = s.combined && multi ? filtered.filter((r) => r.combinesBoth) : filtered;
  const rest = s.combined && multi ? filtered.filter((r) => !r.combinesBoth) : [];
  return { output, countsBase: base.results, top, rest, terms };
}

function emptySuggestions() {
  const present = new Set(visibleGalleryDesigns().flatMap((d) => d.professions));
  return GALLERY_EMPTY_SUGGESTIONS.filter((x) => present.has(x.profession));
}

export function galleryTagCounts(results: readonly GallerySearchResult[]) {
  return tagCounts(results);
}

// ── Search suggestions (typing) ─────────────────────────────────────────────

export type GallerySearchSuggestion = {
  /** Text shown on line 1. */
  label: string;
  /** Query applied on tap. */
  query: string;
  kind: "profession" | "synonym";
  demos: number;
  themes: number;
  /** For synonyms: the profession label it maps to. */
  sameAs?: string;
};

export function gallerySearchSuggestions(input: string, locale: "en" | "es", max = 5): GallerySearchSuggestion[] {
  const terms = queryTerms(input);
  const last = terms[terms.length - 1] ?? "";
  if (normalizeSearchText(last).length < 2) return [];
  const out: GallerySearchSuggestion[] = [];
  const profs: GalleryProfession[] = professionsForTerm(last);
  const other = locale === "es" ? "en" : "es";
  for (const p of profs) {
    const meta = GALLERY_PROFESSIONS[p];
    const label = meta.label[locale];
    const res = searchGallery({ query: meta.label.en });
    out.push({ kind: "profession", label, query: label, demos: res.demoCount, themes: res.themeCount });
    const otherLabel = meta.label[other];
    const typed = normalizeSearchText(last);
    if (
      normalizeSearchText(otherLabel) !== normalizeSearchText(label) &&
      normalizeSearchText(otherLabel).startsWith(typed)
    ) {
      out.push({ kind: "synonym", label: otherLabel, query: label, demos: res.demoCount, themes: res.themeCount, sameAs: label });
    }
  }
  // Theme names match too.
  for (const d of visibleGalleryDesigns()) {
    if (normalizeSearchText(d.name).startsWith(normalizeSearchText(last))) {
      out.push({ kind: "profession", label: d.name, query: d.name, demos: d.demos.length, themes: 1 });
    }
  }
  return out.slice(0, max);
}

// ── Persistence ─────────────────────────────────────────────────────────────

export function parseGalleryBrowseState(raw: string | null | undefined): GalleryBrowseState {
  if (!raw) return { ...DEFAULT_GALLERY_BROWSE_STATE };
  try {
    const v = JSON.parse(raw) as Partial<GalleryBrowseState>;
    return {
      query: typeof v.query === "string" ? v.query : "",
      chip: typeof v.chip === "string" ? (v.chip as GalleryCategoryChip) : null,
      style: typeof v.style === "string" && isStyleTag(v.style) ? v.style : null,
      tags: Array.isArray(v.tags) ? v.tags.filter((t): t is string => typeof t === "string") : [],
      combined: v.combined === true,
      lastViewed: typeof v.lastViewed === "string" ? v.lastViewed : null,
      scrollY: typeof v.scrollY === "number" && Number.isFinite(v.scrollY) ? Math.max(0, v.scrollY) : 0,
    };
  } catch {
    return { ...DEFAULT_GALLERY_BROWSE_STATE };
  }
}

export function loadGalleryBrowseState(): GalleryBrowseState {
  try {
    if (typeof window === "undefined") return { ...DEFAULT_GALLERY_BROWSE_STATE };
    return parseGalleryBrowseState(window.sessionStorage.getItem(GALLERY_BROWSE_STORAGE_KEY));
  } catch {
    return { ...DEFAULT_GALLERY_BROWSE_STATE };
  }
}

export function saveGalleryBrowseState(s: GalleryBrowseState): void {
  try {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(GALLERY_BROWSE_STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable: state just is not kept */
  }
}

/** "{n}" style placeholders. */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}
