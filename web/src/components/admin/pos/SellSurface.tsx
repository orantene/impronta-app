"use client";

/**
 * SellSurface — C02/C03/C04's product side: search, category tabs, a
 * favourites row, and the product grid itself. Variant chips render inline
 * on a tile once it carries `variants` (C04's required-modifier choice).
 *
 * Presentational only: every list, every selection, every keystroke is a
 * prop or a callback. Money renders through `formatOrderMoney` — the one
 * money formatter — never a hand-built string.
 */

import { formatOrderMoney } from "@/lib/orders/money-format";
import { cn } from "@/lib/utils";
import {
  POS_CHIP,
  POS_CHIP_ACTIVE,
  POS_CHIP_IDLE,
  POS_INPUT,
  POS_SURFACE,
  POS_TAB,
  POS_TAB_ACTIVE,
  POS_TAB_IDLE,
} from "./pos-classes";
import type { PosCategoryTab, PosProductTile } from "./pos-types";

export const ALL_CATEGORIES_ID = "__all__";

export type SellSurfaceCopy = {
  readonly searchPlaceholder: string;
  readonly searchLabel: string;
  readonly favourites: string;
  readonly allCategories: string;
  readonly add: string;
  readonly empty: string;
  readonly emptyCatalog: string;
  /** Announced on a tile's variant-chip row (C04's required modifier choice). */
  readonly chooseVariant: string;
};

export type SellSurfaceProps = {
  readonly products: readonly PosProductTile[];
  readonly categories: readonly PosCategoryTab[];
  readonly activeCategoryId: string;
  readonly onSelectCategory: (categoryId: string) => void;
  readonly searchValue: string;
  readonly onSearchChange: (value: string) => void;
  readonly onSelectProduct: (productId: string) => void;
  readonly onSelectVariant: (productId: string, variantId: string) => void;
  readonly copy: SellSurfaceCopy;
  readonly className?: string;
};

export function SellSurface({
  products,
  categories,
  activeCategoryId,
  onSelectCategory,
  searchValue,
  onSearchChange,
  onSelectProduct,
  onSelectVariant,
  copy,
  className,
}: SellSurfaceProps) {
  const favourites = products.filter((p) => p.favourite);
  const visible =
    activeCategoryId === ALL_CATEGORIES_ID
      ? products
      : products.filter((p) => p.categoryId === activeCategoryId);

  return (
    <div className={cn("flex h-full flex-col gap-4 p-4", className)}>
      <label className="sr-only" htmlFor="pos-sell-search">
        {copy.searchLabel}
      </label>
      <input
        id="pos-sell-search"
        type="search"
        className={POS_INPUT}
        placeholder={copy.searchPlaceholder}
        value={searchValue}
        onChange={(event) => onSearchChange(event.target.value)}
      />

      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label={copy.allCategories}>
        <button
          type="button"
          role="tab"
          aria-selected={activeCategoryId === ALL_CATEGORIES_ID}
          className={cn(
            POS_TAB,
            activeCategoryId === ALL_CATEGORIES_ID ? POS_TAB_ACTIVE : POS_TAB_IDLE,
          )}
          onClick={() => onSelectCategory(ALL_CATEGORIES_ID)}
        >
          {copy.allCategories}
        </button>
        {categories.map((category) => (
          <button
            key={category.id}
            type="button"
            role="tab"
            aria-selected={activeCategoryId === category.id}
            className={cn(
              POS_TAB,
              activeCategoryId === category.id ? POS_TAB_ACTIVE : POS_TAB_IDLE,
            )}
            onClick={() => onSelectCategory(category.id)}
          >
            {category.label}
          </button>
        ))}
      </div>

      {favourites.length > 0 && (
        <section aria-label={copy.favourites}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {copy.favourites}
          </h3>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {favourites.map((product) => (
              <button
                key={`fav-${product.id}`}
                type="button"
                onClick={() => onSelectProduct(product.id)}
                className={cn(POS_SURFACE, "flex h-14 min-w-[9rem] shrink-0 flex-col justify-center px-3 text-left hover:bg-accent")}
              >
                <span className="truncate text-sm font-medium text-foreground">{product.title}</span>
                <span className="text-xs text-muted-foreground">
                  {formatOrderMoney(product.amountCents, product.currency)}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {products.length === 0 ? (
        <p className="text-sm text-muted-foreground">{copy.emptyCatalog}</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">{copy.empty}</p>
      ) : (
        <div className="grid flex-1 grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3 lg:grid-cols-4">
          {visible.map((product) => (
            <div key={product.id} className={cn(POS_SURFACE, "flex flex-col gap-2 p-3")}>
              <button
                type="button"
                onClick={() => onSelectProduct(product.id)}
                className="flex min-h-14 flex-1 flex-col items-start justify-center gap-1 text-left"
              >
                <span className="line-clamp-2 text-sm font-medium text-foreground">{product.title}</span>
                <span className="text-sm text-muted-foreground">
                  {formatOrderMoney(product.amountCents, product.currency)}
                </span>
              </button>
              {product.variants && product.variants.length > 0 && (
                <div
                  role="group"
                  aria-label={copy.chooseVariant}
                  className="flex flex-wrap gap-1.5"
                >
                  {product.variants.map((variant) => (
                    <button
                      key={variant.id}
                      type="button"
                      disabled={variant.disabled}
                      aria-pressed={variant.selected}
                      onClick={() => onSelectVariant(product.id, variant.id)}
                      className={cn(POS_CHIP, variant.selected ? POS_CHIP_ACTIVE : POS_CHIP_IDLE)}
                    >
                      {variant.label}
                      {variant.deltaCents !== 0 &&
                        ` (${variant.deltaCents > 0 ? "+" : ""}${formatOrderMoney(variant.deltaCents, product.currency)})`}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
