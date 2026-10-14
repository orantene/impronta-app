/** Pure helpers for seeding a composed site's header menu. */

export type NavSeedItem = { label: string; href: string };

/** One row per destination: two roles that resolve to the same href (or label) must not repeat in the menu. */
export function dedupeNavItems(items: readonly NavSeedItem[]): NavSeedItem[] {
  const seenHref = new Set<string>();
  const seenLabel = new Set<string>();
  const out: NavSeedItem[] = [];
  for (const it of items) {
    const h = it.href.trim().toLowerCase();
    const l = it.label.trim().toLowerCase();
    if (seenHref.has(h) || seenLabel.has(l)) continue;
    seenHref.add(h);
    seenLabel.add(l);
    out.push(it);
  }
  return out;
}

