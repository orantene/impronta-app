import type { InterpretCatalogTerm } from "@/lib/ai/interpret-search-catalog";
import { resolveDeterministicGenderTaxonomyIds } from "@/lib/ai/deterministic-gender-taxonomy";
import { resolveLocationSlugFromQuery } from "@/lib/ai/resolve-location-from-query";
import { resolveSynonymTaxonomyIds, stripResolvedTaxonomyTokens } from "@/lib/ai/interpret-taxonomy-synonyms";
import {
  emptyConfidence,
  minimalParsedIntent,
  type ParsedIntent,
} from "@/lib/ai/intent-schema";
import {
  parseHeightSearchBandFromQuery,
  stripHeightMentionsFromQuery,
} from "@/lib/directory/parse-height-from-query";
import {
  parseAgeSearchBandFromQuery,
  stripAgeMentionsFromQuery,
} from "@/lib/directory/parse-age-from-query";
import {
  DIRECTORY_HEIGHT_CM_MAX,
  DIRECTORY_HEIGHT_CM_MIN,
} from "@/lib/directory/search-params";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type RawModelIntent = {
  normalized_summary?: unknown;
  taxonomy_term_ids?: unknown;
  talent_roles?: unknown;
  industries?: unknown;
  event_types?: unknown;
  skills?: unknown;
  fit_labels?: unknown;
  languages?: unknown;
  location_slug?: unknown;
  free_text_fallback?: unknown;
  gender_preference?: unknown;
  confidence?: unknown;
  needs_clarification?: unknown;
  /** LLM optional height (cm); 0 or absent = none */
  height_min_cm?: unknown;
  height_max_cm?: unknown;
};

function asStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function asStrList(v: unknown, max = 32): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, max);
}

function asNum(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return Math.max(0, Math.min(1, v));
  return 0;
}

function parseConfidence(raw: unknown): ParsedIntent["confidence"] {
  if (!raw || typeof raw !== "object") return emptyConfidence();
  const o = raw as Record<string, unknown>;
  return {
    roles: asNum(o.roles),
    location: asNum(o.location),
    industries: asNum(o.industries),
  };
}

function clampHeightCm(n: number): number {
  return Math.min(DIRECTORY_HEIGHT_CM_MAX, Math.max(DIRECTORY_HEIGHT_CM_MIN, Math.round(n)));
}

function bandFromTargetCm(target: number): { min: number; max: number } {
  const t = clampHeightCm(target);
  return { min: clampHeightCm(t - 2), max: clampHeightCm(t + 2) };
}

function mergeHeightFromModel(raw: RawModelIntent): {
  heightMinCm: number | null;
  heightMaxCm: number | null;
} {
  const a = raw.height_min_cm;
  const b = raw.height_max_cm;
  const minIn = typeof a === "number" && Number.isFinite(a) && a > 0 ? a : null;
  const maxIn = typeof b === "number" && Number.isFinite(b) && b > 0 ? b : null;
  if (minIn != null && maxIn != null) {
    let lo = clampHeightCm(minIn);
    let hi = clampHeightCm(maxIn);
    if (lo > hi) {
      const t = lo;
      lo = hi;
      hi = t;
    }
    return { heightMinCm: lo, heightMaxCm: hi };
  }
  if (minIn != null) {
    const { min, max } = bandFromTargetCm(minIn);
    return { heightMinCm: min, heightMaxCm: max };
  }
  return { heightMinCm: null, heightMaxCm: null };
}

export type MappedDirectoryParams = {
  taxonomyTermIds: string[];
  locationSlug: string;
  query: string;
  normalizedSummary: string;
  heightMinCm: number | null;
  heightMaxCm: number | null;
  ageMin: number | null;
  ageMax: number | null;
  parsedIntent: ParsedIntent;
};

function mergeTaxonomyIds(
  modelIds: string[],
  catalogTerms: InterpretCatalogTerm[],
  originalQuery: string,
  maxTotal: number,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  function take(ids: readonly string[]) {
    for (const id of ids) {
      if (out.length >= maxTotal) return;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
  }

  take(resolveDeterministicGenderTaxonomyIds(originalQuery, catalogTerms));
  take(modelIds);
  const syn = resolveSynonymTaxonomyIds(
    originalQuery,
    catalogTerms,
    Math.max(0, maxTotal - out.length),
    3,
  );
  take(syn);
  return out;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripResolvedLocationFromQuery(
  query: string,
  locationSlug: string,
): string {
  const loc = locationSlug.trim().replace(/-/g, " ");
  if (!query.trim() || !loc) return query.trim();
  const locPattern = loc
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => escapeRegex(part))
    .join("\\s+");
  if (!locPattern) return query.trim();

  let out = query;
  const phrasePatterns = [
    new RegExp(`\\b(?:from|in|at|near|de|en)\\s+${locPattern}\\b`, "gi"),
    new RegExp(`\\b${locPattern}\\b`, "gi"),
  ];
  for (const pattern of phrasePatterns) {
    out = out.replace(pattern, " ");
  }
  out = out.replace(/\b(?:from|in|at|near|de|en)\b/gi, " ");
  return out.replace(/\s+/g, " ").trim();
}

/**
 * Validates model output against catalog; maps to directory URL params + canonical ParsedIntent.
 */
export function validateAndMergeInterpretIntent(
  raw: RawModelIntent,
  catalogTerms: InterpretCatalogTerm[],
  locationSlugs: Set<string>,
  originalQuery: string,
  locale: "en" | "es",
): MappedDirectoryParams {
  void locale;

  const termIdOk = new Set(catalogTerms.map((t) => t.id));
  const idsIn = asStrList(raw.taxonomy_term_ids, 64);
  const modelTaxonomyIds: string[] = [];
  const seenModel = new Set<string>();
  for (const id of idsIn) {
    if (!UUID_RE.test(id)) continue;
    if (!termIdOk.has(id)) continue;
    if (seenModel.has(id)) continue;
    seenModel.add(id);
    modelTaxonomyIds.push(id);
  }

  let locationSlug = asStr(raw.location_slug);
  if (locationSlug && !locationSlugs.has(locationSlug)) {
    locationSlug = "";
  }
  if (!locationSlug) {
    locationSlug = resolveLocationSlugFromQuery(originalQuery, locationSlugs);
  }

  const confidence = parseConfidence(raw.confidence);
  const needsClarification = Boolean(raw.needs_clarification);
  const avgConf =
    (confidence.roles + confidence.location + confidence.industries) / 3;
  const taxonomyCap = needsClarification || avgConf < 0.35 ? 3 : 6;

  const taxonomyTermIds = mergeTaxonomyIds(
    modelTaxonomyIds,
    catalogTerms,
    originalQuery,
    taxonomyCap,
  );

  let query = asStr(raw.free_text_fallback);
  if (!query) {
    query = originalQuery.trim();
  }

  // Strip tokens that were resolved to taxonomy IDs (gender/synonym words like "woman", "blonde")
  // so they don't also pass through as free-text search and produce 0 results via AND intersection.
  if (taxonomyTermIds.length > 0) {
    query = stripResolvedTaxonomyTokens(query);
  }
  if (locationSlug) {
    query = stripResolvedLocationFromQuery(query, locationSlug);
  }

  // Parse age range from query (e.g. "20 to 30 years old")
  const parsedAgeBand = parseAgeSearchBandFromQuery(originalQuery);
  let ageMin: number | null = null;
  let ageMax: number | null = null;
  if (parsedAgeBand) {
    ageMin = parsedAgeBand.ageMin;
    ageMax = parsedAgeBand.ageMax;
    query = stripAgeMentionsFromQuery(query);
    if (!query.trim()) {
      let fallback = stripAgeMentionsFromQuery(originalQuery.trim());
      if (taxonomyTermIds.length > 0) {
        fallback = stripResolvedTaxonomyTokens(fallback);
      }
      query = fallback;
    }
    query = query.trim();
  }

  const parsedBand = parseHeightSearchBandFromQuery(originalQuery);
  let heightMinCm: number | null;
  let heightMaxCm: number | null;
  if (parsedBand) {
    heightMinCm = parsedBand.heightMinCm;
    heightMaxCm = parsedBand.heightMaxCm;
    query = stripHeightMentionsFromQuery(query);
    if (!query.trim()) {
      let fallback = stripHeightMentionsFromQuery(originalQuery.trim());
      if (taxonomyTermIds.length > 0) {
        fallback = stripResolvedTaxonomyTokens(fallback);
      }
      query = fallback;
    }
    query = query.trim();
  } else {
    const m = mergeHeightFromModel(raw);
    heightMinCm = m.heightMinCm;
    heightMaxCm = m.heightMaxCm;
  }

  let normalizedSummary =
    asStr(raw.normalized_summary) || originalQuery.trim() || query;
  if (locationSlug) {
    const locPretty = locationSlug.replace(/-/g, " ").trim();
    const sumLo = normalizedSummary.trim().toLowerCase();
    const rawLo = originalQuery.trim().toLowerCase();
    if (
      locPretty &&
      !sumLo.includes(locPretty.toLowerCase()) &&
      (sumLo === rawLo || !asStr(raw.normalized_summary))
    ) {
      normalizedSummary = `${normalizedSummary.trim()} · ${locPretty}`.slice(0, 400);
    }
  }

  const parsedIntent: ParsedIntent = {
    raw_query: originalQuery.trim(),
    normalized_summary: normalizedSummary,
    taxonomy_term_ids: taxonomyTermIds,
    talent_roles: asStrList(raw.talent_roles),
    industries: asStrList(raw.industries),
    event_types: asStrList(raw.event_types),
    skills: asStrList(raw.skills),
    fit_labels: asStrList(raw.fit_labels),
    languages: asStrList(raw.languages),
    location_slug: locationSlug || null,
    free_text_fallback: query || null,
    gender_preference: asStr(raw.gender_preference) || null,
    confidence,
    needs_clarification: needsClarification,
    height_min_cm: heightMinCm,
    height_max_cm: heightMaxCm,
  };

  if (
    taxonomyTermIds.length === 0 &&
    !locationSlug &&
    !query &&
    heightMinCm == null &&
    ageMin == null
  ) {
    const fb = minimalParsedIntent(originalQuery);
    return {
      taxonomyTermIds: [],
      locationSlug: "",
      query: originalQuery.trim(),
      normalizedSummary: fb.normalized_summary,
      heightMinCm: parsedBand?.heightMinCm ?? null,
      heightMaxCm: parsedBand?.heightMaxCm ?? null,
      ageMin: parsedAgeBand?.ageMin ?? null,
      ageMax: parsedAgeBand?.ageMax ?? null,
      parsedIntent: {
        ...fb,
        height_min_cm: parsedBand?.heightMinCm ?? null,
        height_max_cm: parsedBand?.heightMaxCm ?? null,
      },
    };
  }

  return {
    taxonomyTermIds,
    locationSlug,
    query,
    normalizedSummary,
    heightMinCm,
    heightMaxCm,
    ageMin,
    ageMax,
    parsedIntent,
  };
}
