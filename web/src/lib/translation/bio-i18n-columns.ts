/**
 * DB-boundary mapper for the per-locale bio JSONB columns on talent_profiles
 * (WS4 multi-language migration).
 *
 * The Translation Center bio engine (`talent-bio-translation-service.ts`) is
 * written against a FLAT row/patch shape (`bio_en`, `bio_es`, `bio_*_draft`,
 * `bio_*_status`, `bio_*_updated_at`). Storage is now four per-locale JSONB
 * maps. These helpers convert between the two at the single read + write seams
 * so the engine's intricate cross-locale staleness logic stays untouched.
 *
 *   bio_i18n            { en, es }  ← published bio
 *   bio_draft_i18n      { en, es }  ← unpublished draft buffer
 *   bio_status_i18n     { en, es }  ← per-locale review status (enum text)
 *   bio_updated_at_i18n { en, es }  ← per-locale last-published timestamp
 */

type Jsonish = Record<string, unknown> | null | undefined;

/** The raw per-locale JSONB columns as selected from the DB. */
export type BioI18nColumns = {
  bio_i18n: Jsonish;
  bio_draft_i18n: Jsonish;
  bio_status_i18n: Jsonish;
  bio_updated_at_i18n: Jsonish;
  short_bio: string | null;
};

/** The flat per-locale fields the bio engine reads/writes. */
export type FlatBioRow = {
  bio_en: string | null;
  bio_es: string | null;
  bio_en_draft: string | null;
  bio_es_draft: string | null;
  bio_en_status: string | null;
  bio_es_status: string | null;
  bio_en_updated_at: string | null;
  bio_es_updated_at: string | null;
  short_bio: string | null;
};

/** Columns the bio SELECT must request. */
export const BIO_I18N_SELECT =
  "bio_i18n, bio_draft_i18n, bio_status_i18n, bio_updated_at_i18n, short_bio";

function str(map: Jsonish, locale: string): string | null {
  const v = map?.[locale];
  return typeof v === "string" ? v : null;
}

/** Map the four JSONB columns into the flat shape the bio engine consumes. */
export function flattenBioColumns(cols: BioI18nColumns): FlatBioRow {
  return {
    bio_en: str(cols.bio_i18n, "en"),
    bio_es: str(cols.bio_i18n, "es"),
    bio_en_draft: str(cols.bio_draft_i18n, "en"),
    bio_es_draft: str(cols.bio_draft_i18n, "es"),
    bio_en_status: str(cols.bio_status_i18n, "en"),
    bio_es_status: str(cols.bio_status_i18n, "es"),
    bio_en_updated_at: str(cols.bio_updated_at_i18n, "en"),
    bio_es_updated_at: str(cols.bio_updated_at_i18n, "es"),
    short_bio: cols.short_bio ?? null,
  };
}

/** A flat patch the bio engine builds (only the keys it actually sets). */
export type FlatBioPatch = {
  bio_en?: string | null;
  bio_es?: string | null;
  bio_en_draft?: string | null;
  bio_es_draft?: string | null;
  bio_en_status?: string | null;
  bio_es_status?: string | null;
  bio_en_updated_at?: string | null;
  bio_es_updated_at?: string | null;
  short_bio?: string | null;
  updated_at?: string | null;
};

function setLocale(
  base: Record<string, string>,
  locale: "en" | "es",
  value: string | null | undefined,
): Record<string, string> {
  const next = { ...base };
  const t = typeof value === "string" ? value.trim() : "";
  if (t) next[locale] = value as string;
  else delete next[locale];
  return next;
}

function toMap(j: Jsonish): Record<string, string> {
  const out: Record<string, string> = {};
  if (j && typeof j === "object") {
    for (const [k, v] of Object.entries(j)) if (typeof v === "string") out[k] = v;
  }
  return out;
}

/**
 * Translate a flat patch into a JSONB-column update object, merging each
 * locale key into the existing per-locale map (so the OTHER locale is never
 * clobbered). `current` is the row as freshly loaded (its raw JSONB columns).
 */
export function bioPatchToColumns(
  current: BioI18nColumns,
  patch: FlatBioPatch,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  // published bio
  if ("bio_en" in patch || "bio_es" in patch) {
    let m = toMap(current.bio_i18n);
    if ("bio_en" in patch) m = setLocale(m, "en", patch.bio_en);
    if ("bio_es" in patch) m = setLocale(m, "es", patch.bio_es);
    out.bio_i18n = m;
  }
  // draft buffer
  if ("bio_en_draft" in patch || "bio_es_draft" in patch) {
    let m = toMap(current.bio_draft_i18n);
    if ("bio_en_draft" in patch) m = setLocale(m, "en", patch.bio_en_draft);
    if ("bio_es_draft" in patch) m = setLocale(m, "es", patch.bio_es_draft);
    out.bio_draft_i18n = m;
  }
  // status (NOT trimmed away — a status string like "missing" is meaningful)
  if ("bio_en_status" in patch || "bio_es_status" in patch) {
    const m = toMap(current.bio_status_i18n);
    if ("bio_en_status" in patch) {
      if (patch.bio_en_status) m.en = patch.bio_en_status;
      else delete m.en;
    }
    if ("bio_es_status" in patch) {
      if (patch.bio_es_status) m.es = patch.bio_es_status;
      else delete m.es;
    }
    out.bio_status_i18n = m;
  }
  // updated_at timestamps
  if ("bio_en_updated_at" in patch || "bio_es_updated_at" in patch) {
    const m = toMap(current.bio_updated_at_i18n);
    if ("bio_en_updated_at" in patch) {
      if (patch.bio_en_updated_at) m.en = patch.bio_en_updated_at;
      else delete m.en;
    }
    if ("bio_es_updated_at" in patch) {
      if (patch.bio_es_updated_at) m.es = patch.bio_es_updated_at;
      else delete m.es;
    }
    out.bio_updated_at_i18n = m;
  }
  // non-localized pass-through
  if ("short_bio" in patch) out.short_bio = patch.short_bio ?? null;
  if ("updated_at" in patch) out.updated_at = patch.updated_at ?? null;

  return out;
}
