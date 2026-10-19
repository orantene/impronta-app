/**
 * TUL-1271 #5 — the QR menu's full item, built from one catalog row. Pure.
 * Words (title, description, category) come in the guest's language along the
 * same chain the website uses; the amount is the row's own amount, untouched.
 */
import { resolveCategoryLabel } from "@/lib/talent/category-label-fallback";
import { toI18nMap } from "@/lib/i18n/i18n-columns";
import { offeringText } from "@/lib/talent/offerings-types";

export type GuestMenuRow = {
  id: string;
  title: string | null;
  description: string | null;
  amount_cents: number | null;
  prep_station_id: string | null;
  category: string | null;
  category_i18n?: Record<string, string> | null;
  title_i18n: Record<string, string> | null;
  description_i18n: Record<string, string> | null;
  sort_order: number | null;
  inventory_qty: number | null;
  capacity_pool_id: string | null;
};

export type GuestMenuItem = {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  amountCents: number;
  prepStationId: string | null;
  imageUrl: string | null;
  /** A counted pool with nothing left. Unlimited and uncounted items are never sold out. */
  soldOut: boolean;
  sortOrder: number;
};

export function toGuestMenuItem(row: GuestMenuRow, locale: string, imageUrl: string | null): GuestMenuItem {
  const chain = [locale, "en"];
  const textRow = {
    title: row.title ?? "",
    description: row.description,
    title_i18n: row.title_i18n,
    description_i18n: row.description_i18n,
  };
  const plainCategory = row.category?.trim() || null;
  const category = plainCategory
    ? resolveCategoryLabel({ category: plainCategory, categoryI18n: toI18nMap(row.category_i18n), locale, chain }) ?? plainCategory
    : null;
  return {
    id: String(row.id),
    title: offeringText(textRow, "title", locale, chain) ?? row.title ?? "",
    description: offeringText(textRow, "description", locale, chain),
    category,
    amountCents: Number(row.amount_cents ?? 0),
    prepStationId: row.prep_station_id ? String(row.prep_station_id) : null,
    imageUrl,
    soldOut: Boolean(row.capacity_pool_id) && typeof row.inventory_qty === "number" && row.inventory_qty <= 0,
    sortOrder: typeof row.sort_order === "number" ? row.sort_order : 0,
  };
}

/** The owner's order (`sort_order`), then title, so the menu does not shuffle between reads. */
export function sortGuestMenu(items: readonly GuestMenuItem[]): GuestMenuItem[] {
  return [...items].sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
}
