/**
 * TUL-1064 slice 1: keyword search over the Concierge catalog rows. Accent- and
 * case-insensitive, every typed word must match somewhere in the row's visible
 * text. (Semantic search and filters build on this; see the card.)
 */

type Searchable = { title: string; sub: string | null };

function fold(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function searchCatalogRows<T extends Searchable>(rows: readonly T[], query: string): T[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...rows];
  return rows.filter((row) => {
    const hay = fold(`${row.title} ${row.sub ?? ""}`);
    return words.every((w) => hay.includes(w));
  });
}
