/**
 * TUL-516 · public talent-site price labels — one source of truth.
 *
 * Money shape is always `$700 MXN` (via `formatMoney` / TUL-383). Never bare
 * `$700` and never `MX$700`. A zero or missing amount is "Consultar" / "Ask",
 * not `$0 MXN`. A ladder ("from") uses the cheapest variant and the lowercase
 * word `desde` / `from` (book-jorgelina style). The ≈ US$ hint is a separate
 * string for the UI to put on its own muted line — never crammed into the
 * primary with ` · ` or ` (≈…)`.
 *
 * Pure: no React, no server-only. Safe to import from chat, catalog, demos.
 * Does not import catalog-booking-logic (avoids a cycle with offerings-types).
 */

import { formatMoney } from "@/lib/talent/offerings-money";

/** Minimal offering shape — avoids a cycle with offerings-types. */
type PriceOffering = {
  visibility?: string | null;
  priceDisplay?: string | null;
  priceType?: string | null;
  amountCents?: number | null;
  currency: string;
  variants?: ReadonlyArray<{ amountCents?: number | null }> | null;
  attributes?: Record<string, unknown> | null;
};

export function isEsLocale(locale: string): boolean {
  return locale.toLowerCase().startsWith("es");
}

/** Lowercase "desde" / "from" — never CSS-uppercased in product copy. */
export function publicFromWord(locale: string): string {
  return isEsLocale(locale) ? "desde" : "from";
}

/** Zero-priced public rate: ask, do not paint `$0 MXN`. */
export function publicConsultLabel(locale: string): string {
  return isEsLocale(locale) ? "Consultar" : "Ask";
}

/** Explicit quote / custom / unset amount. */
export function publicQuoteLabel(locale: string): string {
  return isEsLocale(locale) ? "A cotizar" : "Quote";
}

export function publicOnRequestLabel(locale: string): string {
  return isEsLocale(locale) ? "Bajo consulta" : "On request";
}

/** True when there is no honest positive amount to print. */
export function isPublicUnpriced(
  amountCents: number | null | undefined,
  priceDisplay?: string | null,
  priceType?: string | null,
): boolean {
  if (priceDisplay === "quote" || priceType === "custom") return true;
  if (amountCents == null || !Number.isFinite(amountCents) || amountCents <= 0) return true;
  return false;
}

/** Min bookable cents for a row — base amount or cheapest variant. */
export function catalogRowMinCents(
  o: Pick<PriceOffering, "amountCents" | "variants">,
): number | null {
  const prices = [
    ...(o.variants ?? []).map((v) => v.amountCents ?? o.amountCents),
    o.amountCents,
  ].filter((c): c is number => typeof c === "number" && c > 0);
  return prices.length ? Math.min(...prices) : o.amountCents ?? null;
}

/** Ladder: priceDisplay "from" OR more than one variant → desde / from. */
export function catalogRowShowsFrom(
  o: Pick<PriceOffering, "priceDisplay" | "variants">,
): boolean {
  return o.priceDisplay === "from" || (o.variants ?? []).length > 1;
}

/** Unit a service is priced by ("uña" in "desde $120 por uña"). */
export function offeringPriceUnit(
  attributes: Record<string, unknown> | null | undefined,
  locale: string,
): string | null {
  const raw = attributes?.price_unit;
  if (typeof raw === "string") return raw.trim() || null;
  if (raw && typeof raw === "object") {
    const map = raw as Record<string, unknown>;
    const lang = isEsLocale(locale) ? "es" : "en";
    const pick = map[lang] ?? map.en ?? map.es;
    return typeof pick === "string" && pick.trim() ? pick.trim() : null;
  }
  return null;
}

/** `$1,500 MXN` — the only public money format. */
export function formatPublicMoney(amountCents: number, currency: string, locale: string): string {
  return formatMoney(amountCents, currency, locale);
}

/** `desde $500 MXN` / `from $500 MXN`. */
export function formatPublicFromMoney(amountCents: number, currency: string, locale: string): string {
  return `${publicFromWord(locale)} ${formatPublicMoney(amountCents, currency, locale)}`;
}

type CatalogPriceItem = Pick<
  PriceOffering,
  "visibility" | "priceDisplay" | "priceType" | "amountCents" | "currency" | "variants" | "attributes"
>;

/**
 * One-line catalog / hero / card / chat price for an offering.
 * Uses min cents so a ladder never disagrees with the matrix.
 */
export function publicCatalogPriceLabel(item: CatalogPriceItem, locale: string): string {
  if (item.visibility === "on_request") return publicOnRequestLabel(locale);
  const minCents = catalogRowMinCents(item);
  const explicitQuote = item.priceDisplay === "quote" || item.priceType === "custom";
  if (explicitQuote || minCents == null) return publicQuoteLabel(locale);
  if (minCents <= 0) return publicConsultLabel(locale);
  const money = formatPublicMoney(minCents, item.currency, locale);
  const unit = offeringPriceUnit(item.attributes, locale);
  const es = isEsLocale(locale);
  if (unit) {
    return `${publicFromWord(locale)} ${money} ${es ? "por" : "per"} ${unit}`;
  }
  return catalogRowShowsFrom(item) ? `${publicFromWord(locale)} ${money}` : money;
}

/**
 * Selection-bar / dock summary price (same rules, shorter quote word).
 * Quote → "A cotizar"/"Quote"; zero → "Consultar"/"Ask".
 */
export function publicBarPriceLabel(
  item: Pick<PriceOffering, "priceDisplay" | "priceType" | "amountCents" | "currency" | "variants">,
  locale: string,
): string {
  const minCents = catalogRowMinCents(item);
  const explicitQuote = item.priceDisplay === "quote" || item.priceType === "custom";
  if (explicitQuote || minCents == null) return publicQuoteLabel(locale);
  if (minCents <= 0) return publicConsultLabel(locale);
  const money = formatPublicMoney(minCents, item.currency, locale);
  return catalogRowShowsFrom(item) ? `${publicFromWord(locale)} ${money}` : money;
}

/** Primary money + optional USD hint as separate strings (own muted line). */
export type PublicPriceParts = {
  primary: string;
  /** `≈ US$38` or null — never concatenate into `primary`. */
  usd: string | null;
};

export function publicPricedParts(
  amountCents: number | null | undefined,
  currency: string | null | undefined,
  locale: string,
  usdHint: string | null | undefined,
): PublicPriceParts | null {
  if (amountCents == null || !Number.isFinite(amountCents) || amountCents <= 0) return null;
  const cur = (currency ?? "USD").trim().toUpperCase() || "USD";
  return {
    primary: formatPublicMoney(amountCents, cur, locale),
    usd: usdHint?.trim() ? usdHint.trim() : null,
  };
}
