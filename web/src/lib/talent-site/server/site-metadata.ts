import "server-only";

import type { Metadata } from "next";

import type { Locale } from "@/i18n/config";
import { resolvePublicMetaDescription } from "@/lib/brand/platform-brand-locale";
import { buildMarketingLocaleAlternates } from "@/lib/seo/locale-alternates";

import type { MaxSiteSeo } from "./render-max-site";

const OG_LOCALES: Record<string, string> = { en: "en_US", es: "es_MX" };

/** og:locale for the page and og:locale:alternate for its other hreflang languages. */
export function ogLocaleTags(
  locale: string | undefined,
  languages: Record<string, string> | undefined,
): { locale?: string; alternateLocale?: string[] } {
  const tag = (code: string) => OG_LOCALES[code] ?? code;
  if (!locale) return {};
  const others = Object.keys(languages ?? {}).filter((c) => c !== "x-default" && c !== locale);
  return { locale: tag(locale), ...(others.length > 0 ? { alternateLocale: others.map(tag) } : {}) };
}

/**
 * SEO-2 — map the SHARED `MaxSiteSeo` envelope to a Next `Metadata` object.
 *
 * One mapper, consumed IN LOCKSTEP by all three talent-site routes
 * (`/t/site/[siteSlug]`, `/t/site/[siteSlug]/[pageSlug]`, and the custom-domain
 * `_talent-site/[[...pageSlug]]` catch-all). Centralizing it here is what stops
 * the custom-domain route from silently forking — there is exactly one place
 * that turns the SEO envelope into `openGraph` + `alternates` + `robots`.
 *
 * - `openGraph` carries og:title/og:description/og:image (with the page-level
 *   override falling back to title/description). The route-level
 *   `opengraph-image.tsx` ALSO contributes an `og:image` via the file
 *   convention; an explicit `ogImageUrl` here is an additional/override image.
 * - `alternates` reuse the SHARED platform locale-alternates builder (canonical
 *   + hreflang) when an English-relative `localePathWithoutLocale` is supplied
 *   (the `/t/site/...` routes, which are served from the platform apex and so
 *   genuinely own those URLs). The custom-domain apex has no EN/ES split, so it
 *   passes only an absolute `canonical` and no hreflang.
 * - `noindex` → `robots: { index:false, follow:false }` (draft preview).
 */
export function maxSiteSeoToMetadata(
  seo: MaxSiteSeo,
  opts: {
    /**
     * For the `/t/site/...` routes: the English (unprefixed) path of THIS page,
     * so the shared locale-alternates helper emits canonical + EN/ES hreflang.
     * Omit for the custom-domain apex (no locale split there).
     */
    localePathWithoutLocale?: string;
    /** The visitor locale, required when `localePathWithoutLocale` is set. */
    locale?: Locale;
    /** TUL-74: this page's language, for og:locale + og:locale:alternate. */
    ogLocale?: string;
  } = {},
): Metadata {
  const ogImages = seo.ogImageUrl ? [{ url: seo.ogImageUrl }] : undefined;
  // TUL-121 theme8: pages without meta_description used to omit `description`
  // and inherit the English root-layout PLATFORM_BRAND pitch on ES talent
  // sites. Prefer ogLocale (the language the Max-site body actually rendered
  // in after talent-locale bounding) over the platform request locale, so a
  // Spanish-only site at unprefixed /t/site/… does not keep an English pitch.
  const description = resolvePublicMetaDescription(
    seo.description,
    opts.ogLocale ?? opts.locale,
  );
  const socialDescription = seo.ogDescription ?? description;

  const base: Metadata = {
    title: seo.title,
    ...(description ? { description } : {}),
    ...(seo.noindex ? { robots: { index: false, follow: false } } : {}),
    // DS-18: the business's own tab icon replaces the platform icon from the root layout.
    ...(seo.faviconUrl ? { icons: { icon: [{ url: seo.faviconUrl }] } } : {}),
    openGraph: {
      type: "website",
      title: seo.ogTitle ?? seo.title,
      ...(socialDescription ? { description: socialDescription } : {}),
      ...(seo.canonical ? { url: seo.canonical } : {}),
      ...ogLocaleTags(opts.ogLocale, seo.alternates?.languages),
      ...(ogImages ? { images: ogImages } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: seo.ogTitle ?? seo.title,
      ...(socialDescription ? { description: socialDescription } : {}),
      ...(ogImages ? { images: ogImages } : {}),
    },
  };

  // PR 5 — the talent's OWN language set wins: self-canonical per language +
  // reciprocal hreflang, on whichever host serves the page.
  if (seo.alternates) {
    return { ...base, alternates: { canonical: seo.alternates.canonical, languages: seo.alternates.languages } };
  }

  // /t/site/... routes → shared canonical + EN/ES hreflang.
  if (opts.localePathWithoutLocale && opts.locale) {
    const alternates = buildMarketingLocaleAlternates(
      opts.locale,
      opts.localePathWithoutLocale,
    );
    return { ...base, ...alternates };
  }

  // Custom-domain apex → absolute canonical only, no hreflang.
  if (seo.canonical) {
    return { ...base, alternates: { canonical: seo.canonical } };
  }
  return base;
}

/**
 * SEO-2 — the JSON-LD `<script>` for a talent-site page. Returns the structured
 * data as a string (stable JSON) the route paints in a
 * `<script type="application/ld+json">`. Empty string → emit nothing.
 */
export function maxSiteJsonLdString(seo: MaxSiteSeo): string {
  if (!seo.jsonLd) return "";
  try {
    return JSON.stringify(seo.jsonLd);
  } catch {
    return "";
  }
}
