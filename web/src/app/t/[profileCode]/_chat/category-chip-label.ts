/**
 * A catalogue chip prints the talent's own category.
 * A stored display name is kept. An unaccented slug is spelled out.
 * There is no per-talent list.
 */

const SLUG_NAME: Record<string, string> = {
  unas: "Uñas",
  pestanas: "Pestañas",
  cejas: "Cejas",
  depilacion: "Depilación",
};

export function categoryChipLabel(stored: string | null | undefined): string {
  const trimmed = (stored ?? "").trim();
  if (!trimmed) return "";
  return SLUG_NAME[trimmed.toLowerCase()] ?? trimmed;
}

export function uniqueCategoryChips(categories: readonly (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of categories) {
    const label = categoryChipLabel(raw);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    out.push(label);
  }
  return out;
}
