/**
 * TUL-750: the type picker listed "Estilista" twice (two catalogue terms, such
 * as "Hair Stylist" and "Stylist", share one Spanish label). A person sees
 * labels, not ids, so options that read the same in the flow's language are one
 * option: the first (best scored) wins.
 */
export function dedupeTypeOptionsByLabel<T extends { label: { en: string; es: string } }>(
  options: readonly T[],
  locale: "en" | "es",
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const o of options) {
    const text = (o.label[locale] || o.label.en).trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    if (seen.has(text)) continue;
    seen.add(text);
    out.push(o);
  }
  return out;
}
