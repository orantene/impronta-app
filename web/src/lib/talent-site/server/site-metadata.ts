import "server-only";

import type { Metadata } from "next";

import type { Locale } from "@/i18n/config";
import { buildMarketingLocaleAlternates } from "@/lib/seo/locale-alternates";

import type { MaxSiteSeo } from "./render-max-site";

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
  } = {},
): Metadata {
  const ogImages = seo.ogImageUrl ? [{ url: seo.ogImageUrl }] : undefined;

  const base: Metadata = {
    title: seo.title,
    ...(seo.description ? { description: seo.description } : {}),
    ...(seo.noindex ? { robots: { index: false, follow: false } } : {}),
    openGraph: {
      type: "website",
      title: seo.ogTitle ?? seo.title,
      ...(seo.ogDescription ?? seo.description
        ? { description: seo.ogDescription ?? seo.description }
        : {}),
      ...(seo.canonical ? { url: seo.canonical } : {}),
      ...(ogImages ? { images: ogImages } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: seo.ogTitle ?? seo.title,
      ...(seo.ogDescription ?? seo.description
        ? { description: seo.ogDescription ?? seo.description }
        : {}),
      ...(ogImages ? { images: ogImages } : {}),
    },
  };

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
