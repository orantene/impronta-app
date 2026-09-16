/**
 * catalog_grid — the types the island codes against.
 *
 * Photo cards 1-up → 2-up → desktop 4-up with a sticky "View order (n)".
 * Read-only: adding to the order is `cart_checkout`'s act.
 */

export type CatalogGridProps = {
  /** Category keys to show, or `"all"` (default). */
  collections?: string[] | "all";
  showPhotos?: boolean;
  showPhases?: boolean;
  /** When false the island renders prices without an add button. */
  orderable?: boolean;
  /** Restrict to these offerings. */
  offeringIds?: string[] | null;
  locale?: string | null;
};

export type CatalogOption = { id: string; label: string; amountCents: number | null };
export type CatalogAddon = { id: string; label: string; amountCents: number };

export type CatalogItem = {
  id: string;
  title: string;
  description: string | null;
  kind: "service" | "package" | "product";
  category: string | null;
  /** The base price; null = priced on request. */
  amountCents: number | null;
  /** The price in force NOW after price phases; equals amountCents when no phase applies. */
  livePriceCents: number | null;
  phase: { id: string; label: string } | null;
  currency: string;
  priceDisplay: "exact" | "from" | "quote";
  imageUrl: string | null;
  /** Remaining stock; null = unlimited. */
  unitsLeft: number | null;
  allowPayInPerson: boolean;
  requiresIdentity: boolean;
  options: CatalogOption[];
  addons: CatalogAddon[];
  /** For a package: what it is made of. */
  components: Array<{ offeringId: string; title: string; qty: number; required: boolean }> | null;
  sortOrder: number;
};

export type CatalogCollection = { key: string; label: string; itemIds: string[] };

export type CatalogGridData = {
  collections: CatalogCollection[];
  items: CatalogItem[];
  currency: string;
  /** Promotions are codes typed at checkout; none are published here. */
  promotions: [];
};
