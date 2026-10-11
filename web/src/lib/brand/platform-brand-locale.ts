/**
 * Locale-aware platform brand lines for public surfaces.
 *
 * Root `layout.tsx` metadata defaults are English-only. Talent sites without a
 * page meta description inherit that English pitch on Spanish pages (live on
 * qa-fresh-studio). On Spanish talent hosts, missing pages (404) and any route
 * that inherits the root default still show `Tulala · Sell what you do…` in the
 * tab unless callers use `platformDefaultTitle`. Marketing `/es` already ships
 * Spanish; keep one helper so Max-site metadata and dashboard tabs match.
 *
 * Neutral Mexican Spanish (tú). No em dashes.
 */
import { TULALA_BRAND } from "@/lib/brand/tulala";

/** Same line as `dashboard-metadata` / marketing brand.descriptor. */
export const PLATFORM_TAGLINE_ES = "Vende lo que haces, no lo que envías";

/**
 * Mirrors the marketing home `/es` meta description (page.tsx), not a
 * literal translate of every EN clause.
 */
export const PLATFORM_DESCRIPTION_ES =
  "Tulala es la plataforma de comercio para el talento: una tienda con tu marca, reservas ordenadas y una red compartida que te trae trabajo nuevo.";

export function isSpanishLocale(locale: string | undefined | null): boolean {
  return Boolean(locale && locale.toLowerCase().startsWith("es"));
}

export function platformBrandTagline(locale: string | undefined | null): string {
  return isSpanishLocale(locale) ? PLATFORM_TAGLINE_ES : TULALA_BRAND.tagline;
}

export function platformBrandDescription(locale: string | undefined | null): string {
  return isSpanishLocale(locale) ? PLATFORM_DESCRIPTION_ES : TULALA_BRAND.description;
}

/** Root / dashboard default tab title: `Tulala · <tagline>`. */
export function platformDefaultTitle(locale: string | undefined | null): string {
  return `${TULALA_BRAND.name} · ${platformBrandTagline(locale)}`;
}

/**
 * Talent-site meta description: page value wins; otherwise the platform pitch
 * in the visitor/page language. No locale hint → leave unset (root layout).
 */
export function resolvePublicMetaDescription(
  pageDescription: string | undefined | null,
  localeHint: string | undefined | null,
): string | undefined {
  const trimmed = pageDescription?.trim();
  if (trimmed) return trimmed;
  if (!localeHint) return undefined;
  return platformBrandDescription(localeHint);
}
