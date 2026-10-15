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

/** TUL-1064 slice 2: sort + availability filter for the same rows. */
export type CatalogSort = "default" | "price_asc" | "price_desc";

type Sortable = { amountCents: number | null; available: boolean };

export function sortCatalogRows<T extends Sortable>(rows: readonly T[], sort: CatalogSort): T[] {
  if (sort === "default") return [...rows];
  const dir = sort === "price_asc" ? 1 : -1;
  // Rows without a price (people, table times) always sink to the end.
  return [...rows].sort((a, b) => {
    if (a.amountCents == null && b.amountCents == null) return 0;
    if (a.amountCents == null) return 1;
    if (b.amountCents == null) return -1;
    return (a.amountCents - b.amountCents) * dir;
  });
}

export function onlyAvailableRows<T extends Sortable>(rows: readonly T[], only: boolean): T[] {
  return only ? rows.filter((r) => r.available) : [...rows];
}
