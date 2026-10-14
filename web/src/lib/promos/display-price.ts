/**
 * displayPrice: the ONE price a client sees for an offering (design E, L6).
 *
 * Every client surface (service card, service page, "Otros servicios", hub
 * profile, checkout) asks this for the price instead of rendering a number
 * itself, so the card and the checkout can never disagree. It runs the catalog
 * price through `quote()` with the tenant's LIVE AUTO promos only: codes, links
 * and personal offers are never advertised on a public price.
 *
 * Pure: no DB, no clock reads (the caller passes `now`). Integer minor units.
 */

import { pickHeadlinePrice, type CatalogPriceRow } from "@/lib/directory/headline-price";

import { publicPromoCopy } from "./copy/public";
import { quote } from "./quote";
import type { LineKind, Promo, UsageMap } from "./types";

/** Scarcity only reads as honest when it is small (E: "only when <=5 left"). */
export const LEFT_LABEL_MAX = 5;

export type PromoBadgeData =
  | { kind: "percent"; percent: number; label: string }
  | { kind: "gift"; addonId: string; label: string };

export type DisplayPrice = {
  currency: string;
  list_cents: number;
  final_cents: number;
  /** True only when a live promo actually changes what the client sees. */
  hasPromo: boolean;
  promoId: string | null;
  badge: PromoBadgeData | null;
  /** Units left on the winning promo, only when <= 5. */
  left: number | null;
  leftLabel: string | null;
};

export type DisplayPriceContext = {
  promos: readonly Promo[];
  usage?: UsageMap;
  now: string | Date;
  locale?: string | null;
  /** addon id -> client-facing name, for the "Gratis: X" badge. */
  addonLabels?: Readonly<Record<string, string>>;
};

/** Promos a public price may show: auto, not personal. */
export function isAdvertisable(p: Promo): boolean {
  return p.unlock === "auto" && p.audience !== "one_client" && !p.is_single_use && !p.customer_id;
}

const NONE = (list: number, currency: string): DisplayPrice => ({
  currency, list_cents: list, final_cents: list, hasPromo: false, promoId: null, badge: null, left: null, leftLabel: null,
});

export function displayPrice(
  offering: { id: string; list_cents: number; currency: string; kind?: LineKind },
  ctx: DisplayPriceContext,
): DisplayPrice {
  const currency = (offering.currency || "MXN").toUpperCase();
  const list = Math.max(0, Math.trunc(offering.list_cents));
  const promos = ctx.promos.filter(isAdvertisable);
  if (list <= 0 || promos.length === 0) return NONE(list, currency);

  const q = quote({
    cart: [{ id: offering.id, kind: offering.kind ?? "service", target_id: offering.id, list_cents: list, qty: 1, currency }],
    // A public price is for anyone browsing: a first-time visitor.
    client: { status: "new" },
    now: ctx.now,
    promos,
    usage: ctx.usage ?? {},
    unlocked: { codes: [], linkPromoIds: [] },
  });

  const line = q.lines[0];
  const final = line ? line.final_cents : list;
  const price = q.applied.find((a) => a.kind === "price");
  const gift = q.gifts[0] ?? null;
  if (!price && !gift) return NONE(list, currency);

  const copy = publicPromoCopy(ctx.locale);
  let badge: PromoBadgeData | null = null;
  if (price && final < list) {
    const percent = Math.max(1, Math.round(((list - final) * 100) / list));
    badge = { kind: "percent", percent, label: copy.off(percent) };
  } else if (gift) {
    badge = { kind: "gift", addonId: gift.addonId, label: copy.gift(ctx.addonLabels?.[gift.addonId] ?? null) };
  }

  const winnerId = price?.promoId ?? gift?.promoId ?? null;
  const winner = winnerId ? promos.find((p) => p.id === winnerId) : undefined;
  const max = winner ? (winner.is_single_use ? 1 : winner.max_uses ?? null) : null;
  const left = max != null && winnerId ? Math.max(0, max - (ctx.usage?.[winnerId]?.used ?? 0)) : null;
  const showLeft = left != null && left > 0 && left <= LEFT_LABEL_MAX && max != null;

  return {
    currency,
    list_cents: list,
    final_cents: final,
    hasPromo: badge !== null,
    promoId: winnerId,
    badge,
    left: showLeft ? left : null,
    leftLabel: showLeft && max != null ? copy.left(left, max) : null,
  };
}

export type HeadlineOffering = CatalogPriceRow & { id: string };

/**
 * The "Desde" headline through the same engine (L6): pickHeadlinePrice picks
 * the offering, displayPrice prices it. A promo on some other service keeps the
 * headline at list price; the caller may add the "en algunos servicios" badge
 * via `someOnPromo`.
 */
export function displayHeadlinePrice(
  offerings: readonly HeadlineOffering[],
  ctx: DisplayPriceContext,
): { price: DisplayPrice; someOnPromo: number | null } | null {
  const head = pickHeadlinePrice(offerings);
  if (!head) return null;
  const row = offerings.find(
    (o) => o.amountCents === head.amountCents && o.currency === head.currency && o.priceType === head.priceType,
  );
  if (!row) return null;
  const price = displayPrice({ id: row.id, list_cents: row.amountCents, currency: row.currency }, ctx);
  let someOnPromo: number | null = null;
  if (!price.hasPromo) {
    for (const o of offerings) {
      if (o.id === row.id || o.amountCents <= 0) continue;
      const p = displayPrice({ id: o.id, list_cents: o.amountCents, currency: o.currency }, ctx);
      if (p.badge?.kind === "percent") someOnPromo = Math.max(someOnPromo ?? 0, p.badge.percent);
    }
  }
  return { price, someOnPromo };
}
