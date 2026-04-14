/**
 * Canonical AI intent object for directory search (analytics, inquiry context, logs).
 * Only `taxonomy_term_ids` and `location_slug` are enforced against DB allow-lists in MVP.
 */

export type AiIntentConfidence = {
  roles: number;
  location: number;
  industries: number;
};

export type ParsedIntent = {
  raw_query: string;
  normalized_summary: string;
  taxonomy_term_ids: string[];
  talent_roles: string[];
  industries: string[];
  event_types: string[];
  skills: string[];
  fit_labels: string[];
  languages: string[];
  location_slug: string | null;
  free_text_fallback: string | null;
  gender_preference: string | null;
  confidence: AiIntentConfidence;
  needs_clarification: boolean;
  /** Resolved directory height filter (cm), if any */
  height_min_cm: number | null;
  height_max_cm: number | null;
};

export function emptyConfidence(): AiIntentConfidence {
  return { roles: 0, location: 0, industries: 0 };
}

export function minimalParsedIntent(raw: string): ParsedIntent {
  const q = raw.trim();
  return {
    raw_query: q,
    normalized_summary: q,
    taxonomy_term_ids: [],
    talent_roles: [],
    industries: [],
    event_types: [],
    skills: [],
    fit_labels: [],
    languages: [],
    location_slug: null,
    free_text_fallback: q || null,
    gender_preference: null,
    confidence: emptyConfidence(),
    needs_clarification: false,
    height_min_cm: null,
    height_max_cm: null,
  };
}
