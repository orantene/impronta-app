/**
 * Talent-type names in the visitor's language for the marketing global
 * directory. The discover matview carries `category_label` in English only;
 * `taxonomy_terms.name_i18n` holds every language. Pure: the loader lives in
 * `talent-type-labels.server.ts`.
 */

export type TalentTypeTermRow = {
  slug: string | null;
  name_i18n: Readonly<Record<string, string | null | undefined>> | null;
};

export type TalentTypeLabels = {
  /** taxonomy slug → localized name */
  bySlug: Readonly<Record<string, string>>;
  /** English name (what the matview stores) → localized name */
  byEnglish: Readonly<Record<string, string>>;
};

export const NO_TALENT_TYPE_LABELS: TalentTypeLabels = { bySlug: {}, byEnglish: {} };

function langOf(locale: string | null | undefined): string {
  return (locale ?? "").trim().toLowerCase().slice(0, 2);
}

/** English is what the matview already stores, so it needs no relabel. */
export function needsTalentTypeLabels(locale: string | null | undefined): boolean {
  const lang = langOf(locale);
  return lang.length > 0 && lang !== "en";
}

/** A term with no name in `locale` keeps its English name. */
export function buildTalentTypeLabels(
  rows: readonly TalentTypeTermRow[],
  locale: string | null | undefined,
): TalentTypeLabels {
  if (!needsTalentTypeLabels(locale)) return NO_TALENT_TYPE_LABELS;
  const lang = langOf(locale);
  const bySlug: Record<string, string> = {};
  const byEnglish: Record<string, string> = {};
  for (const row of rows) {
    const local = row.name_i18n?.[lang]?.trim();
    if (!local) continue;
    const slug = row.slug?.trim();
    if (slug) bySlug[slug] = local;
    const en = row.name_i18n?.en?.trim();
    if (en && !(en in byEnglish)) byEnglish[en] = local;
  }
  return { bySlug, byEnglish };
}

export function localizeTypeLabel(label: string | null, labels: TalentTypeLabels): string | null {
  if (!label) return label;
  return labels.byEnglish[label.trim()] ?? label;
}

export function localizeCategoryFacets<T extends { value: string; label: string }>(
  categories: readonly T[],
  labels: TalentTypeLabels,
): T[] {
  return categories.map((c) => {
    const local = labels.bySlug[c.value];
    return local ? { ...c, label: local } : c;
  });
}

export function localizeRowTypeLabels<T extends { primaryTypeLabel: string | null }>(
  rows: readonly T[],
  labels: TalentTypeLabels,
): T[] {
  return rows.map((row) => {
    const local = localizeTypeLabel(row.primaryTypeLabel, labels);
    return local === row.primaryTypeLabel ? row : { ...row, primaryTypeLabel: local };
  });
}
