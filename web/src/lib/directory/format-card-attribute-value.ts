import type { DirectoryCardScalarDef } from "@/lib/directory/directory-card-display-catalog";
import type { DirectoryLocale } from "@/lib/directory/talent-card-dto";

export type FieldValueRow = {
  talent_profile_id: string;
  field_definition_id: string;
  value_text: string | null;
  value_number: number | string | null;
  value_boolean: boolean | null;
  value_date: string | null;
  value_taxonomy_ids: string[] | null;
};

type TermNames = { name_en: string; name_es: string | null };

/** Flat terms from `talent_profile_taxonomy` (taxonomy fields are often stored here, not in `field_values`). */
export type ProfileTaxonomyTerm = {
  kind: string;
  name_en: string;
  name_es: string | null;
  sort_order: number;
};

function pickLocalized(locale: DirectoryLocale, en: string, es: string | null): string {
  if (locale === "es" && es?.trim()) return es.trim();
  return en.trim() || es?.trim() || "";
}

function boolLabel(v: boolean, locale: DirectoryLocale): string {
  if (locale === "es") return v ? "Sí" : "No";
  return v ? "Yes" : "No";
}

/**
 * Build a single-line directory card value for a field_values row.
 * Returns null when empty or unsupported.
 */
export function formatCardAttributeValue(
  def: DirectoryCardScalarDef,
  fv: FieldValueRow | undefined,
  termsById: Map<string, TermNames>,
  locale: DirectoryLocale,
): string | null {
  if (!fv) return null;

  switch (def.value_type) {
    case "text":
    case "textarea": {
      const t = fv.value_text?.trim();
      return t ? t : null;
    }
    case "number": {
      if (fv.value_number == null || fv.value_number === "") return null;
      const n = Number(fv.value_number);
      return Number.isFinite(n) ? String(n) : null;
    }
    case "boolean": {
      if (fv.value_boolean == null) return null;
      return boolLabel(fv.value_boolean, locale);
    }
    case "date": {
      if (!fv.value_date) return null;
      const d = new Date(`${fv.value_date}T12:00:00Z`);
      if (Number.isNaN(d.getTime())) return fv.value_date;
      return d.toLocaleDateString(locale === "es" ? "es" : "en", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    }
    case "taxonomy_single":
    case "taxonomy_multi": {
      const ids = fv.value_taxonomy_ids ?? [];
      if (!ids.length) return null;
      const labels = ids
        .map((id) => {
          const term = termsById.get(id);
          return term ? pickLocalized(locale, term.name_en, term.name_es) : null;
        })
        .filter(Boolean) as string[];
      return labels.length ? labels.join(", ") : null;
    }
    default:
      return fv.value_text?.trim() || null;
  }
}

/**
 * Format taxonomy_single / taxonomy_multi using profile assignments when `value_taxonomy_ids` is empty.
 */
export function formatTaxonomyCardValueFromAssignments(
  def: DirectoryCardScalarDef,
  profileTerms: readonly ProfileTaxonomyTerm[],
  locale: DirectoryLocale,
): string | null {
  if (def.value_type !== "taxonomy_single" && def.value_type !== "taxonomy_multi") {
    return null;
  }
  const kind = def.taxonomy_kind?.trim();
  if (!kind) return null;

  const matched = profileTerms.filter((t) => t.kind === kind);
  if (!matched.length) return null;

  matched.sort(
    (a, b) => a.sort_order - b.sort_order || a.name_en.localeCompare(b.name_en),
  );
  const labels = matched
    .map((t) => pickLocalized(locale, t.name_en, t.name_es))
    .filter(Boolean);
  return labels.length ? labels.join(", ") : null;
}
