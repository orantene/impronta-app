import type { DirectoryCardScalarDef } from "@/lib/directory/directory-card-display-catalog";
import {
  type FieldValueRow,
  formatCardAttributeValue,
  formatTaxonomyCardValueFromAssignments,
  type ProfileTaxonomyTerm,
} from "@/lib/directory/format-card-attribute-value";
import type { DirectoryLocale } from "@/lib/directory/talent-card-dto";

export const MAX_CARD_ATTRIBUTE_LINES = 12;

export type CardAttributeRpc = {
  key: string;
  label_en: string;
  label_es: string | null;
  value: string;
};

type TalentProfileHeight = { id: string; height_cm: number | null };

export function buildCardAttributesForProfile(
  profile: TalentProfileHeight,
  locale: DirectoryLocale,
  heightCardDef: DirectoryCardScalarDef | null,
  scalarCardDefs: DirectoryCardScalarDef[],
  valuesByDefId: Map<string, FieldValueRow>,
  termsById: Map<string, { name_en: string; name_es: string | null }>,
  /** Taxonomy terms assigned to the profile (tags, industry, skills, etc.). */
  profileTaxonomyTerms: readonly ProfileTaxonomyTerm[],
): CardAttributeRpc[] {
  const blocks: CardAttributeRpc[] = [];

  if (heightCardDef) {
    const h = profile.height_cm;
    if (h != null && Number.isFinite(Number(h))) {
      blocks.push({
        key: "height_cm",
        label_en: heightCardDef.label_en,
        label_es: heightCardDef.label_es,
        value: `${Math.round(Number(h))} cm`,
      });
    }
  }

  for (const def of scalarCardDefs) {
    const fv = valuesByDefId.get(def.id);
    let value = formatCardAttributeValue(def, fv, termsById, locale);
    if (
      !value &&
      (def.value_type === "taxonomy_single" || def.value_type === "taxonomy_multi")
    ) {
      value = formatTaxonomyCardValueFromAssignments(def, profileTaxonomyTerms, locale);
    }
    if (value) {
      blocks.push({
        key: def.key,
        label_en: def.label_en,
        label_es: def.label_es,
        value,
      });
    }
  }

  const orderForKey = (key: string): number => {
    if (key === "height_cm" && heightCardDef) return heightCardDef.sort_order;
    const d = scalarCardDefs.find((x) => x.key === key);
    return d?.sort_order ?? 999;
  };

  blocks.sort(
    (a, b) => orderForKey(a.key) - orderForKey(b.key) || a.key.localeCompare(b.key),
  );

  return blocks.slice(0, MAX_CARD_ATTRIBUTE_LINES);
}
