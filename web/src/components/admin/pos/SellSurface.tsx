"use client";

/**
 * SellSurface — the product side of `POSCounter`: the `Search or scan` bar
 * with its scan door, the category chips (`Favorites` first, then `All`, then
 * each category the catalog actually has), and the 4-up tile grid. A tile is
 * its name over its price and a badge (`Options`, `3 left`, `Sold out`,
 * `Pick session`, `Approval`).
 *
 * Presentational only: every list, every selection, every keystroke is a
 * prop or a callback. Money renders through `formatOrderMoney` — the one
 * money formatter — never a hand-built string.
 *
 * A CLASS PLACE NEEDS A SESSION. A tile with more than one upcoming session
 * carries `Pick session` and a tap opens the chooser below (one row per
 * session) instead of selling the first one blind; a tile with exactly one
 * session sells it directly, the way a plain product does.
 */

import { Scan, Search, X } from "lucide-react";
import { useState } from "react";

import { interpolate } from "@/i18n/interpolate";
import { formatOrderMoney } from "@/lib/orders/money-format";
import { cn } from "@/lib/utils";
import { PosDialog } from "./PosSheet";
import {
  POS_CHIP,
  POS_CHIP_ACTIVE,
  POS_CHIP_IDLE,
  POS_NUM,
  POS_PILL,
  POS_PILL_CORAL,
  POS_PILL_INDIGO,
  POS_PILL_RED,
  POS_PILL_SLATE,
} from "./pos-classes";
import type { PosCategoryTab, PosProductTile, PosTileBadge } from "./pos-types";

export const ALL_CATEGORIES_ID = "__all__";
export const FAVOURITES_ID = "__favourites__";

export type SellSurfaceCopy = {
  readonly searchPlaceholder: string;
  readonly searchLabel: string;
  readonly favourites: string;
  /** Why the Favorites chip is disabled (no favourites data exists yet). */
  readonly favouritesUnavailable: string;
  readonly allCategories: string;
  readonly add: string;
  readonly empty: string;
  readonly emptyCatalog: string;
  /** The session chooser's title (C19). */
  readonly chooseVariant: string;
  readonly closeLabel: string;
  /** The scan door beside the search: `Scanner ready · open the scan screen`. */
  readonly scanLabel: string;
  readonly badgeOptions: string;
  /** `{count} left` */
  readonly badgeLeft: string;
  readonly badgeSoldOut: string;
  readonly badgePickSession: string;
  readonly badgeApproval: string;
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
  /** Opens the scan screen (`POSScan`). */
  readonly onOpenScan: () => void;
  /** Number of columns; the portrait board draws 3. */
  readonly columns?: 3 | 4;
  readonly copy: SellSurfaceCopy;
  readonly className?: string;
};

function badgeLabel(badge: PosTileBadge, copy: SellSurfaceCopy): { text: string; tone: string } {
  switch (badge.kind) {
    case "options":
      return { text: copy.badgeOptions, tone: POS_PILL_SLATE };
    case "left":
      return { text: interpolate(copy.badgeLeft, { count: badge.count }), tone: POS_PILL_CORAL };
    case "soldOut":
      return { text: copy.badgeSoldOut, tone: POS_PILL_RED };
    case "pickSession":
      return { text: copy.badgePickSession, tone: POS_PILL_INDIGO };
    case "approval":
      return { text: copy.badgeApproval, tone: POS_PILL_SLATE };
  }
}

export function SellSurface({
  products,
  categories,
  activeCategoryId,
  onSelectCategory,
  searchValue,
  onSearchChange,
  onSelectProduct,
  onSelectVariant,
  onOpenScan,
  columns = 4,
  copy,
  className,
}: SellSurfaceProps) {
  const [chooser, setChooser] = useState<string | null>(null);
  const visible =
    activeCategoryId === ALL_CATEGORIES_ID
      ? products
      : activeCategoryId === FAVOURITES_ID
        ? products.filter((p) => p.favourite)
        : products.filter((p) => p.categoryId === activeCategoryId);
  const choosing = chooser ? products.find((p) => p.id === chooser) ?? null : null;

  const tap = (product: PosProductTile) => {
    if (product.soldOut) return;
    if (product.variants && product.variants.length > 1) {
      setChooser(product.id);
      return;
    }
    onSelectProduct(product.id);
  };

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      <div className="px-5 pb-2.5 pt-3.5">
        <div className="flex h-[52px] items-center gap-2.5 rounded-[14px] border-[1.5px] border-admin-border bg-admin-card px-4">
          <Search aria-hidden size={20} strokeWidth={1.75} className="shrink-0 text-admin-ink-dim" />
          <label className="sr-only" htmlFor="pos-sell-search">
            {copy.searchLabel}
          </label>
          <input
            id="pos-sell-search"
            type="search"
            className="h-full min-w-0 flex-1 bg-transparent text-[16px] text-admin-ink outline-none placeholder:text-admin-ink-dim"
            placeholder={copy.searchPlaceholder}
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
          />
          {searchValue && (
            <button
              type="button"
              aria-label={copy.closeLabel}
              onClick={() => onSearchChange("")}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-admin-ink-dim hover:bg-admin-surface-alt"
            >
              <X aria-hidden size={16} strokeWidth={1.75} />
            </button>
          )}
          <button
            type="button"
            data-pos-scanner-ready
            onClick={onOpenScan}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-admin-ink-dim hover:bg-admin-surface-alt hover:text-admin-ink"
          >
            <Scan aria-hidden size={20} strokeWidth={1.75} />
            <span className="sr-only">{copy.scanLabel}</span>
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto px-5 pb-2.5" role="tablist" aria-label={copy.allCategories}>
        <button
          type="button"
          role="tab"
          aria-selected={activeCategoryId === FAVOURITES_ID}
          disabled
          title={copy.favouritesUnavailable}
          className={cn(POS_CHIP, POS_CHIP_IDLE)}
        >
          {copy.favourites}
          <span className="sr-only">{copy.favouritesUnavailable}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeCategoryId === ALL_CATEGORIES_ID}
          className={cn(POS_CHIP, activeCategoryId === ALL_CATEGORIES_ID ? POS_CHIP_ACTIVE : POS_CHIP_IDLE)}
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
            className={cn(POS_CHIP, activeCategoryId === category.id ? POS_CHIP_ACTIVE : POS_CHIP_IDLE)}
            onClick={() => onSelectCategory(category.id)}
          >
            {category.label}
          </button>
        ))}
      </div>

      {products.length === 0 ? (
        <p className="m-0 px-5 py-6 text-[15px] text-admin-ink-muted">{copy.emptyCatalog}</p>
      ) : visible.length === 0 ? (
        <p className="m-0 px-5 py-6 text-[15px] text-admin-ink-muted">{copy.empty}</p>
      ) : (
        <div
          className={cn(
            "grid min-h-0 flex-1 auto-rows-[112px] content-start gap-3 overflow-y-auto px-5 pb-5 pt-1.5",
            // POSHandheld: a phone takes two tiles across.
            columns === 3 ? "grid-cols-3 max-[520px]:grid-cols-2" : "grid-cols-4 max-[900px]:grid-cols-3 max-[520px]:grid-cols-2",
          )}
        >
          {visible.map((product) => {
            const badge = product.badge ? badgeLabel(product.badge, copy) : null;
            return (
              <button
                key={product.id}
                type="button"
                data-pos-tile={product.id}
                disabled={product.soldOut}
                aria-disabled={product.soldOut || undefined}
                onClick={() => tap(product)}
                className={cn(
                  "flex h-[112px] flex-col justify-between rounded-[16px] border-[1.5px] border-admin-border bg-admin-card p-4 text-left transition-colors hover:bg-admin-surface-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-admin-brand",
                  product.soldOut && "cursor-not-allowed opacity-45 hover:bg-admin-card",
                )}
              >
                <span className="line-clamp-2 text-[16px] font-semibold leading-[1.2] text-admin-ink">{product.title}</span>
                <span className="flex items-center gap-2">
                  <span className={cn("text-[16px] font-bold tracking-[-0.025em] text-admin-ink", POS_NUM)}>
                    {product.amountCents === null ? "—" : formatOrderMoney(product.amountCents, product.currency)}
                  </span>
                  {badge && <span className={cn(POS_PILL, badge.tone)}>{badge.text}</span>}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <PosDialog
        open={choosing !== null}
        name="session-chooser"
        title={choosing?.title ?? ""}
        subtitle={copy.chooseVariant}
        closeLabel={copy.closeLabel}
        onClose={() => setChooser(null)}
      >
        {choosing && (
          <div role="group" aria-label={copy.chooseVariant} className="flex flex-col gap-2">
            {choosing.variants?.map((variant) => (
              <button
                key={variant.id}
                type="button"
                disabled={variant.disabled}
                aria-pressed={variant.selected}
                onClick={() => {
                  onSelectVariant(choosing.id, variant.id);
                  setChooser(null);
                  onSelectProduct(choosing.id);
                }}
                className={cn(
                  "flex h-14 items-center justify-between rounded-[12px] border-[1.5px] px-4 text-left text-[15px] font-semibold text-admin-ink transition-colors hover:bg-admin-surface-alt disabled:cursor-not-allowed disabled:opacity-40",
                  variant.selected ? "border-admin-brand bg-admin-brand-soft" : "border-admin-border bg-admin-card",
                )}
              >
                <span>{variant.label}</span>
                {variant.deltaCents !== 0 && (
                  <span className={cn("text-admin-ink-muted", POS_NUM)}>
                    {variant.deltaCents > 0 ? "+" : ""}
                    {formatOrderMoney(variant.deltaCents, choosing.currency)}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </PosDialog>
    </div>
  );
}
