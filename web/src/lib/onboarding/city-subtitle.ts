/**
 * TUL-803: the city picker's second line ("Quintana Roo, Mexico") came from the
 * English country name (or Google's English secondary text), so Spanish
 * visitors read "Mexico" instead of "México". Pure: picks the line per locale,
 * swapping the English country name for the Spanish one when we have it.
 */
export function citySubtitles(c: {
  subtitle?: string | null;
  country_name_en: string;
  country_name_es: string | null;
}): { en: string | null; es: string | null } {
  const en = c.subtitle?.trim() || c.country_name_en?.trim() || null;
  const nameEn = c.country_name_en?.trim();
  const nameEs = c.country_name_es?.trim();
  if (!en) return { en: null, es: null };
  if (!nameEn || !nameEs || nameEn === nameEs) return { en, es: en };
  const escaped = nameEn.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return { en, es: en.replace(new RegExp(`\\b${escaped}\\b`, "g"), nameEs) };
}
