/** Derive fit-label slug set from directory cards (SSR + client listing) for refine ranking. */
export function collectFitSlugsFromCards(
  items: { fitLabels: readonly { slug: string }[] }[],
  maxCards = 16,
): string[] {
  const s = new Set<string>();
  for (const c of items.slice(0, maxCards)) {
    for (const f of c.fitLabels) {
      const slug = f.slug?.trim().toLowerCase();
      if (slug) s.add(slug);
    }
  }
  return [...s].slice(0, 48);
}
