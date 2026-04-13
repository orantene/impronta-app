export const VIEW_TABS = [
  { key: "bio", label: "Talent bios (ES)" },
  { key: "taxonomy", label: "Taxonomy (ES)" },
  { key: "locations", label: "Locations (ES)" },
] as const;

export const BIO_STATUS_FILTERS = [
  { key: "all", label: "All profiles" },
  { key: "needs_attention", label: "Needs attention" },
  { key: "missing", label: "Status: missing" },
  { key: "stale", label: "Status: stale" },
  { key: "draft", label: "Draft pending" },
  { key: "auto", label: "Status: auto" },
  { key: "reviewed", label: "Status: reviewed" },
  { key: "approved", label: "Status: approved" },
] as const;

/** URL `status` when view is taxonomy or locations (computed missing / translated only). */
export const TAX_LOC_STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "needs_attention", label: "Needs attention" },
  { key: "missing", label: "Missing Spanish" },
  { key: "translated", label: "Translated" },
] as const;

export type ViewKey = (typeof VIEW_TABS)[number]["key"];
export type BioFilterKey = (typeof BIO_STATUS_FILTERS)[number]["key"];
export type TaxLocFilterKey = (typeof TAX_LOC_STATUS_FILTERS)[number]["key"];
export type BioSortKey = "name" | "code" | "es_at" | "en_at";
export type TaxonomySortKey = "name_en" | "name_es" | "kind" | "slug" | "updated";
export type LocationSortKey = "display_en" | "display_es" | "country" | "slug" | "updated";
export type SortDir = "asc" | "desc";

const TAX_SORT_VALUES: TaxonomySortKey[] = ["name_en", "name_es", "kind", "slug", "updated"];
const LOC_SORT_VALUES: LocationSortKey[] = ["display_en", "display_es", "country", "slug", "updated"];

import {
  buildPathWithAdminPanel,
  isAdminPanelAid,
  type AdminPanelState,
} from "@/lib/admin/admin-panel-search-params";

/** `apanel` value for talent bio editor drawer on `/admin/translations`. */
export const TRANSLATIONS_APANEL_BIO = "bio" as const;
/** `apanel` for taxonomy term ES edit drawer (Phase 3). */
export const TRANSLATIONS_APANEL_TAXONOMY_TERM = "taxonomy_term" as const;
/** `apanel` for location ES edit drawer (Phase 3). */
export const TRANSLATIONS_APANEL_LOCATION = "location" as const;

export type TranslationsHrefStatus = BioFilterKey | TaxLocFilterKey;

export function translationsHref(options: {
  view?: ViewKey;
  status?: TranslationsHrefStatus;
  q?: string;
  /** Raw sort key — interpreted per active view on the target page. */
  sort?: string;
  dir?: SortDir;
}) {
  const sp = new URLSearchParams();
  if (options.view && options.view !== "bio") sp.set("view", options.view);
  if (options.status && options.status !== "all") sp.set("status", options.status);
  if (options.q?.trim()) sp.set("q", options.q.trim());
  const defaultSortKey =
    options.view === "taxonomy" ? "kind" : options.view === "locations" ? "country" : "name";
  if (options.sort && options.sort !== defaultSortKey) sp.set("sort", options.sort);
  if (options.dir && options.dir !== "asc") sp.set("dir", options.dir);
  const qs = sp.toString();
  return qs ? `/admin/translations?${qs}` : "/admin/translations";
}

export function bioSortHref(
  target: BioSortKey,
  currentSort: BioSortKey,
  currentDir: SortDir,
  status: BioFilterKey,
  q: string,
): string {
  const nextDir: SortDir =
    currentSort === target ? (currentDir === "asc" ? "desc" : "asc") : "asc";
  return translationsHref({
    view: "bio",
    status,
    q,
    sort: target,
    dir: nextDir,
  });
}

export function taxonomySortHref(
  target: TaxonomySortKey,
  currentSort: TaxonomySortKey,
  currentDir: SortDir,
  status: TaxLocFilterKey,
  q: string,
): string {
  const nextDir: SortDir =
    currentSort === target ? (currentDir === "asc" ? "desc" : "asc") : "asc";
  return translationsHref({
    view: "taxonomy",
    status,
    q,
    sort: target,
    dir: nextDir,
  });
}

export function locationSortHref(
  target: LocationSortKey,
  currentSort: LocationSortKey,
  currentDir: SortDir,
  status: TaxLocFilterKey,
  q: string,
): string {
  const nextDir: SortDir =
    currentSort === target ? (currentDir === "asc" ? "desc" : "asc") : "asc";
  return translationsHref({
    view: "locations",
    status,
    q,
    sort: target,
    dir: nextDir,
  });
}

function parseBioSort(sortRaw: string | undefined): BioSortKey {
  return sortRaw === "code" || sortRaw === "es_at" || sortRaw === "en_at" ? sortRaw : "name";
}

function parseTaxonomySort(sortRaw: string | undefined): TaxonomySortKey {
  return TAX_SORT_VALUES.includes(sortRaw as TaxonomySortKey) ? (sortRaw as TaxonomySortKey) : "kind";
}

function parseLocationSort(sortRaw: string | undefined): LocationSortKey {
  return LOC_SORT_VALUES.includes(sortRaw as LocationSortKey) ? (sortRaw as LocationSortKey) : "country";
}

export function parseTranslationsSearchParams(sp: {
  view?: string;
  status?: string;
  bio?: string;
  q?: string;
  sort?: string;
  dir?: string;
}): {
  view: ViewKey;
  bioStatusFilter: BioFilterKey;
  taxLocStatusFilter: TaxLocFilterKey;
  q: string;
  bioSort: BioSortKey;
  taxonomySort: TaxonomySortKey;
  locationSort: LocationSortKey;
  sortDir: SortDir;
} {
  const view = (VIEW_TABS.some((t) => t.key === sp.view) ? sp.view : "bio") as ViewKey;
  const statusRaw = ((sp.status ?? sp.bio) ?? "").trim() || "all";
  const q = (sp.q ?? "").trim();
  const sortDir: SortDir = sp.dir === "desc" ? "desc" : "asc";
  const sortRaw = sp.sort;

  const bioStatusFilter = BIO_STATUS_FILTERS.some((f) => f.key === statusRaw)
    ? (statusRaw as BioFilterKey)
    : "all";
  const taxLocStatusFilter = TAX_LOC_STATUS_FILTERS.some((f) => f.key === statusRaw)
    ? (statusRaw as TaxLocFilterKey)
    : "all";

  return {
    view,
    bioStatusFilter,
    taxLocStatusFilter,
    q,
    bioSort: parseBioSort(sortRaw),
    taxonomySort: parseTaxonomySort(sortRaw),
    locationSort: parseLocationSort(sortRaw),
    sortDir,
  };
}

/** Parse `apanel` / `aid` from translations page search params. */
export function parseTranslationsAdminPanel(sp: {
  apanel?: string;
  aid?: string;
}): AdminPanelState {
  const apanel = sp.apanel?.trim() || null;
  const aidRaw = sp.aid?.trim() || "";
  const aid = isAdminPanelAid(aidRaw) ? aidRaw : null;
  return { apanel, aid };
}

/** Full path to translations with current bio filters + bio editor drawer open. */
export function translationsBioEditorHref(
  filters: {
    status: BioFilterKey;
    q: string;
    sort: BioSortKey;
    dir: SortDir;
  },
  talentProfileId: string,
): string {
  const sp = new URLSearchParams();
  if (filters.status !== "all") sp.set("status", filters.status);
  if (filters.q.trim()) sp.set("q", filters.q.trim());
  if (filters.sort !== "name") sp.set("sort", filters.sort);
  if (filters.dir !== "asc") sp.set("dir", filters.dir);
  return buildPathWithAdminPanel("/admin/translations", sp, {
    apanel: TRANSLATIONS_APANEL_BIO,
    aid: talentProfileId,
  });
}

export function translationsTaxonomyEditorHref(
  filters: {
    status: TaxLocFilterKey;
    q: string;
    sort: TaxonomySortKey;
    dir: SortDir;
  },
  termId: string,
): string {
  const sp = new URLSearchParams();
  sp.set("view", "taxonomy");
  if (filters.status !== "all") sp.set("status", filters.status);
  if (filters.q.trim()) sp.set("q", filters.q.trim());
  if (filters.sort !== "kind") sp.set("sort", filters.sort);
  if (filters.dir !== "asc") sp.set("dir", filters.dir);
  return buildPathWithAdminPanel("/admin/translations", sp, {
    apanel: TRANSLATIONS_APANEL_TAXONOMY_TERM,
    aid: termId,
  });
}

export function translationsLocationEditorHref(
  filters: {
    status: TaxLocFilterKey;
    q: string;
    sort: LocationSortKey;
    dir: SortDir;
  },
  locationId: string,
): string {
  const sp = new URLSearchParams();
  sp.set("view", "locations");
  if (filters.status !== "all") sp.set("status", filters.status);
  if (filters.q.trim()) sp.set("q", filters.q.trim());
  if (filters.sort !== "country") sp.set("sort", filters.sort);
  if (filters.dir !== "asc") sp.set("dir", filters.dir);
  return buildPathWithAdminPanel("/admin/translations", sp, {
    apanel: TRANSLATIONS_APANEL_LOCATION,
    aid: locationId,
  });
}
