import {
  DIRECTORY_SORT_VALUES,
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

const HEIGHT_ABS_MIN = 140;
const HEIGHT_ABS_MAX = 220;

function parseIntParam(raw: string | string[] | undefined): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value == null || value === "") return null;
  const n = Number.parseInt(String(value), 10);
  if (!Number.isFinite(n)) return null;
  return n;
}

/** Clamp directory height query params to a safe cm band. */
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
  view?: DirectoryViewMode;
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
  if (opts.view === "list") params.set("view", "list");
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
  canonicalizeDirectorySearchParams(params);
}
