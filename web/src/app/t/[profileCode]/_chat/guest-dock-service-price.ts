/**
 * Price line for a talent's own service rows inside the guest dock catalog.
 * TUL-516: primary is `$500 MXN` only. The ≈ US$ hint is a separate string so
 * the dock can put it on its own muted line (never `$500 MXN · ≈ US$28`).
 */
import {
  usdEquivalentLabel,
  type UsdRates,
} from "@/lib/pricing/usd-equivalent";
import { formatPublicMoney, publicPricedParts } from "@/lib/talent/public-price-format";

export type DockServiceMenuItem = {
  title: string;
  category: string;
  amountCents?: number | null;
  currency?: string | null;
  /** Preformatted `$500 MXN` (local only). Null/absent = unpriced. */
  priceLabel?: string | null;
  /** Optional `≈ US$28` for a second muted line. */
  usdLabel?: string | null;
};

export function guestDockServicePriceLabel(
  amountCents: number | null | undefined,
  currency: string | null | undefined,
  fx: UsdRates | null | undefined,
  locale: string,
): string | null {
  if (amountCents == null || !Number.isFinite(amountCents) || amountCents <= 0) {
    return null;
  }
  const cur = (currency ?? "USD").trim().toUpperCase() || "USD";
  return formatPublicMoney(amountCents, cur, locale);
}

/** Separate USD hint for the dock's muted second line. */
export function guestDockServiceUsdLabel(
  amountCents: number | null | undefined,
  currency: string | null | undefined,
  fx: UsdRates | null | undefined,
  locale: string,
): string | null {
  return usdEquivalentLabel(amountCents, currency, fx, locale);
}

/** Primary + USD parts (tests / callers that want both). */
export function guestDockServicePriceParts(
  amountCents: number | null | undefined,
  currency: string | null | undefined,
  fx: UsdRates | null | undefined,
  locale: string,
) {
  const usd = usdEquivalentLabel(amountCents, currency, fx, locale);
  return publicPricedParts(amountCents, currency, locale, usd);
}
