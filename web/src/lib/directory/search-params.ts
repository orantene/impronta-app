import {
  DIRECTORY_SORT_VALUES,
  type DirectoryFieldFacetSelection,
  type DirectorySortValue,
} from "@/lib/directory/types";

export type DirectoryViewMode = "grid" | "list";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** For API routes / preview URLs that receive `locale` or `lang` as query params. Prefer `getRequestLocale()` for App Router pages (path + middleware). */
export function parseDirectoryLocale(
  sp: Record<string, string | string[] | undefined>,
): "en" | "es" {
  const raw = sp.locale ?? sp.lang;
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === "es" ? "es" : "en";
}

export function parseTaxonomyParam(tax: string | string[] | undefined): string[] {
  if (!tax) return [];
  const raw = Array.isArray(tax) ? tax.join(",") : tax;
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((id) => UUID_RE.test(id));
}

export function parseDirectoryQuery(
  raw: string | string[] | undefined,
): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value?.trim() ?? "";
}

export function parseDirectoryLocation(
  raw: string | string[] | undefined,
): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value?.trim() ?? "";
}

export function parseDirectorySort(
  raw: string | string[] | undefined,
): DirectorySortValue {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value && DIRECTORY_SORT_VALUES.includes(value as DirectorySortValue)) {
    return value as DirectorySortValue;
  }
  return "recommended";
}

export function parseDirectoryView(
  sp: Record<string, string | string[] | undefined>,
): DirectoryViewMode {
  const raw = sp.view;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === "list" ? "list" : "grid";
}

/** Short URL param for AI normalized summary (UTF-8, length-capped by client). */
export function parseDirectoryAiSummary(
  raw: string | string[] | undefined,
): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || typeof value !== "string") return "";
  try {
    return decodeURIComponent(value.trim());
  } catch {
    return value.trim();
  }
}

/** Directory height filter bounds (cm); shared with interpret + listing. */
export const DIRECTORY_HEIGHT_CM_MIN = 140;
export const DIRECTORY_HEIGHT_CM_MAX = 220;

const HEIGHT_ABS_MIN = DIRECTORY_HEIGHT_CM_MIN;
const HEIGHT_ABS_MAX = DIRECTORY_HEIGHT_CM_MAX;

function parseIntParam(raw: string | string[] | undefined): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value == null || value === "") return null;
  const n = Number.parseInt(String(value), 10);
  if (!Number.isFinite(n)) return null;
  return n;
}

/** Clamp directory height query params to a safe cm band. */
function parseFfSegment(segment: string): { fieldKey: string; values: string[] } | null {
  const s = segment.trim();
  const idx = s.indexOf(":");
  if (idx <= 0) return null;
  const fieldKey = s.slice(0, idx).trim();
  if (!fieldKey) return null;
  const rest = s.slice(idx + 1);
  const values = rest
    .split(",")
    .map((v) => {
      try {
        return decodeURIComponent(v.trim());
      } catch {
        return v.trim();
      }
    })
    .filter(Boolean);
  if (values.length === 0) return null;
  return { fieldKey, values };
}

/**
 * Directory `ff` params: repeat `ff=key:v1,v2` (OR within a key, AND across keys).
 * Values may be `encodeURIComponent`’d when they contain commas.
 */
export function parseDirectoryFieldFacets(
  raw: string | string[] | undefined,
): DirectoryFieldFacetSelection[] {
  const parts: string[] = [];
  if (Array.isArray(raw)) {
    for (const p of raw) {
      if (typeof p === "string" && p.trim()) parts.push(p.trim());
    }
  } else if (typeof raw === "string" && raw.trim()) {
    parts.push(raw.trim());
  }
  const byKey = new Map<string, Set<string>>();
  for (const p of parts) {
    const parsed = parseFfSegment(p);
    if (!parsed) continue;
    const set = byKey.get(parsed.fieldKey) ?? new Set<string>();
    for (const v of parsed.values) set.add(v);
    byKey.set(parsed.fieldKey, set);
  }
  return [...byKey.entries()]
    .map(([fieldKey, set]) => ({ fieldKey, values: [...set].sort() }))
    .sort((a, b) => a.fieldKey.localeCompare(b.fieldKey));
}

export function serializeDirectoryFieldFacetParams(
  facets: DirectoryFieldFacetSelection[] | undefined,
): string[] {
  if (!facets?.length) return [];
  const out: string[] = [];
  for (const { fieldKey, values } of [...facets].sort((a, b) =>
    a.fieldKey.localeCompare(b.fieldKey),
  )) {
    if (!fieldKey.trim() || !values.length) continue;
    const enc = [...values]
      .sort()
      .map((v) => encodeURIComponent(v.trim()))
      .filter(Boolean)
      .join(",");
    if (enc) out.push(`${fieldKey.trim()}:${enc}`);
  }
  return out;
}

export function parseDirectoryFieldFacetsFromSearchParams(
  sp: URLSearchParams,
): DirectoryFieldFacetSelection[] {
  return parseDirectoryFieldFacets(sp.getAll("ff"));
}

export function parseDirectoryHeightRange(raw: {
  hmin?: string | string[] | undefined;
  hmax?: string | string[] | undefined;
}): { heightMinCm: number | null; heightMaxCm: number | null } {
  let min = parseIntParam(raw.hmin);
  let max = parseIntParam(raw.hmax);
  if (min != null) min = Math.min(HEIGHT_ABS_MAX, Math.max(HEIGHT_ABS_MIN, min));
  if (max != null) max = Math.min(HEIGHT_ABS_MAX, Math.max(HEIGHT_ABS_MIN, max));
  if (min != null && max != null && min > max) {
    const t = min;
    min = max;
    max = t;
  }
  return { heightMinCm: min, heightMaxCm: max };
}

export const DIRECTORY_AGE_MIN = 18;
export const DIRECTORY_AGE_MAX = 70;

/** Parse `amin`/`amax` age params (integer years). */
export function parseDirectoryAgeRange(raw: {
  amin?: string | string[] | undefined;
  amax?: string | string[] | undefined;
}): { ageMin: number | null; ageMax: number | null } {
  let min = parseIntParam(raw.amin);
  let max = parseIntParam(raw.amax);
  if (min != null) min = Math.min(DIRECTORY_AGE_MAX, Math.max(DIRECTORY_AGE_MIN, min));
  if (max != null) max = Math.min(DIRECTORY_AGE_MAX, Math.max(DIRECTORY_AGE_MIN, max));
  if (min != null && max != null && min > max) {
    const t = min;
    min = max;
    max = t;
  }
  return { ageMin: min, ageMax: max };
}

/**
 * Remove default directory params so URLs are stable (shareable, cache-friendly).
 * Mutates `params` in place.
 */
export function canonicalizeDirectorySearchParams(params: URLSearchParams): void {
  const sort = params.get("sort");
  if (!sort || sort === "recommended") {
    params.delete("sort");
  }
  if (params.get("view") !== "list") {
    params.delete("view");
  }
  const tax = params.get("tax")?.trim();
  if (!tax) params.delete("tax");
  const q = params.get("q")?.trim();
  if (!q) params.delete("q");
  const loc = params.get("location")?.trim();
  if (!loc) params.delete("location");
  const ai = params.get("ai_sum")?.trim();
  if (!ai) params.delete("ai_sum");
  const hmin = params.get("hmin")?.trim();
  if (!hmin) params.delete("hmin");
  const hmax = params.get("hmax")?.trim();
  if (!hmax) params.delete("hmax");
  const amin = params.get("amin")?.trim();
  if (!amin) params.delete("amin");
  const amax = params.get("amax")?.trim();
  if (!amax) params.delete("amax");
  if (params.getAll("ff").length === 0) {
    params.delete("ff");
  }
}

/**
 * Canonical query string for directory listing URLs (share links, inquiry `sourcePage`, etc.).
 * Uses the same rules as client navigations after `canonicalizeDirectorySearchParams`.
 */
export function serializeCanonicalDirectoryListingParams(opts: {
  query?: string;
  locationSlug?: string;
  sort?: DirectorySortValue;
  taxonomyTermIds?: string[];
  heightMinCm?: number | null;
  heightMaxCm?: number | null;
  ageMin?: number | null;
  ageMax?: number | null;
  fieldFacets?: DirectoryFieldFacetSelection[];
  view?: DirectoryViewMode;
  /** Optional AI strip headline (stored URL-encoded in `ai_sum`). */
  aiSummary?: string;
}): string {
  const params = new URLSearchParams();
  const q = opts.query?.trim() ?? "";
  if (q) params.set("q", q);
  const loc = opts.locationSlug?.trim() ?? "";
  if (loc) params.set("location", loc);
  const sort = opts.sort ?? "recommended";
  if (sort !== "recommended") params.set("sort", sort);
  const tax = opts.taxonomyTermIds ?? [];
  if (tax.length > 0) params.set("tax", [...tax].sort().join(","));
  if (opts.heightMinCm != null) params.set("hmin", String(opts.heightMinCm));
  if (opts.heightMaxCm != null) params.set("hmax", String(opts.heightMaxCm));
  if (opts.ageMin != null) params.set("amin", String(opts.ageMin));
  if (opts.ageMax != null) params.set("amax", String(opts.ageMax));
  for (const seg of serializeDirectoryFieldFacetParams(opts.fieldFacets)) {
    params.append("ff", seg);
  }
  if (opts.view === "list") params.set("view", "list");
  const sum = opts.aiSummary?.trim() ?? "";
  if (sum) {
    params.set("ai_sum", sum.slice(0, 400));
  }
  canonicalizeDirectorySearchParams(params);
  return params.toString();
}

/**
 * Apply directory search fields to a `URLSearchParams` for `/api/directory` (and keep them
 * canonical). Does not set `limit` / `cursor`.
 */
export function applyCanonicalDirectoryFetchSearchParams(
  params: URLSearchParams,
  input: {
    taxonomyTermIds: string[];
    locale: "en" | "es";
    sort: DirectorySortValue;
    query: string;
    locationSlug: string;
    heightMinCm: number | null;
    heightMaxCm: number | null;
    fieldFacets?: DirectoryFieldFacetSelection[];
  },
): void {
  const tax = [...input.taxonomyTermIds].filter(Boolean).sort().join(",");
  if (tax) params.set("tax", tax);
  if (input.locale !== "en") params.set("locale", input.locale);
  if (input.sort !== "recommended") params.set("sort", input.sort);
  const qq = input.query.trim();
  if (qq) params.set("q", qq);
  const sl = input.locationSlug.trim();
  if (sl) params.set("location", sl);
  if (input.heightMinCm != null) params.set("hmin", String(input.heightMinCm));
  if (input.heightMaxCm != null) params.set("hmax", String(input.heightMaxCm));
  params.delete("ff");
  for (const seg of serializeDirectoryFieldFacetParams(input.fieldFacets)) {
    params.append("ff", seg);
  }
  canonicalizeDirectorySearchParams(params);
}
