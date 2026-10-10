import "server-only";

import { isOwnCanonical } from "@/lib/talent-site/canonical-own-host";
import { seoTitleFallback } from "@/lib/talent-site/seo-title-fallback";
import { buildLocaleAlternates } from "@/i18n/alternates";
import { buildTalentProfileJsonLd, type TalentJsonLdService } from "@/lib/seo/talent-json-ld";
import { publicSiteMetadataBase } from "@/lib/seo/locale-alternates";
import {
  resolveMaxSiteDescription,
  resolveMaxSiteTitles,
  type MaxSiteRow,
  type MaxSitePageRow,
} from "@/lib/talent-site/resolve-max-site-core";

import { buildTalentLocalBusinessJsonLd, withLocalBusiness } from "@/lib/talent-site/talent-local-business-json-ld";

import { siteFaviconFor } from "@/lib/talent-site/site-favicon";
import type { TalentSiteIdentity } from "./load-max-site";

/**
 * SEO-1 — the talent-site SEO envelope, widened to the SAME field set the
 * cms_pages-backed metadata carries (title/description/OG/canonical/noindex +
 * JSON-LD). This is the shared contract the 3 talent-site routes destructure;
 * SEO-2 populates these from the SEO-1 `talent_pages` columns (meta_description,
 * og_*, canonical_url, noindex, json_ld). Every added field is OPTIONAL so a
 * not-yet-migrated read degrades to undefined and never throws.
 *
 * Lives here (not in `render-max-site.tsx`) so the render file stays under the
 * 800-line max-lines budget — same split pattern as `render-max-site-shell`.
 */
export interface MaxSiteSeo {
  title: string;
  description?: string;
  /** True on the draft preview (never indexed) or when the page's own
   *  `talent_pages.noindex` column is set. */
  noindex: boolean;
  /** og:title — falls back to `title` when absent. */
  ogTitle?: string;
  /** og:description — falls back to `description` when absent. */
  ogDescription?: string;
  /** Absolute og:image URL for the page. */
  ogImageUrl?: string;
  /** Absolute canonical URL for THIS site page (never the /t/[code] profile). */
  canonical?: string;
  /** Structured-data (JSON-LD) document emitted in a `<script type="application/ld+json">`. */
  jsonLd?: unknown;
  /** PR 5 — canonical + hreflang (two or more talent languages only). */
  alternates?: { canonical: string; languages: Record<string, string> };
  /** DS-18: the business's own tab icon (logo, avatar or generated initials). */
  faviconUrl?: string;
}

/**
 * SEO-2 — populate the widened `MaxSiteSeo` from the selected page's SEO-1
 * columns, the site row, and the talent identity.
 *
 * Canonical: prefer the page's explicit `canonical_url`; else build
 * `canonicalOrigin + canonicalPath` (the talent's OWN site/domain URL — NEVER
 * the /t/[code] discovery profile). JSON-LD: reuse the SHARED
 * `buildTalentProfileJsonLd`, passing THIS canonical so the site's structured
 * data does not conflate with the profile's. If the page stored an explicit
 * `json_ld` document, that wins (operator override). Every field degrades to
 * undefined when absent so a not-yet-populated page still renders.
 */
export function buildMaxSiteSeo(args: {
  site: MaxSiteRow;
  page: MaxSitePageRow;
  identity: TalentSiteIdentity | null;
  locale: string;
  noindex: boolean;
  /** Published catalog services for the Person's `makesOffer` (real data only). */
  services?: TalentJsonLdService[];
  /** TUL-74: the talent's city and published links; both optional, never invented. */
  addressLocality?: string | null;
  sameAs?: readonly string[];
  canonicalOrigin?: string;
  canonicalPath?: string;
  /**
   * #201 — the site's other own hosts (custom domains, platform subdomain). An
   * explicit `canonical_url` is honoured only on these or the `canonicalOrigin`
   * host; absent, only the origin host counts.
   */
  ownHosts?: readonly string[];
  /**
   * Platform pages (`/politicas`, `/privacidad`) render inside the HOME page's row, so the home's
   * explicit `canonical_url` must never apply to them: each is self-canonical with its own hreflang pair.
   */
  ignoreExplicitCanonical?: boolean;
  /**
   * PR 5 — the talent's languages. With two or more, every language version
   * is self-canonical (primary unprefixed, each secondary prefixed) with
   * reciprocal hreflang + x-default on the unprefixed URL. One language: no
   * hreflang at all (`buildLocaleAlternates` rule 2).
   */
  locales?: { primary: string; urlDefault: string; supported: readonly string[] };
}): MaxSiteSeo {
  const { site, page, identity, locale, noindex } = args;

  // SEO-3 — `meta_title` overrides the SERP/tab title. Folded into `title` here
  // rather than added to `MaxSiteSeo`, so the shared `maxSiteSeoToMetadata`
  // mapper needs no change and all three talent-site routes pick it up in
  // lockstep — including og:title, which already falls back to `title`.
  const { pageTitle, seoTitle: storedTitle } = resolveMaxSiteTitles(page, identity?.name || site.siteSlug || "", locale);
  // A language she has not written a title for gets a neutral generated one, not the primary-language text.
  const title =
    seoTitleFallback({
      locale,
      primaryLocale: args.locales?.primary,
      metaTitleI18n: page.metaTitleI18n,
      titleI18n: page.titleI18n,
      name: identity?.name,
      city: args.addressLocality,
    }) ?? storedTitle;
  const description = resolveMaxSiteDescription(page, locale);

  // Canonical — explicit column wins; else origin + path. Never the profile.
  const origin = (args.canonicalOrigin?.trim() || publicSiteMetadataBase().origin)
    .replace(/\/$/, "");
  const path = args.canonicalPath?.trim() || "/";
  const alt = args.locales
    ? buildLocaleAlternates({
        origin,
        pathnameWithoutLocale: path.startsWith("/") ? path : `/${path}`,
        currentLocale: locale,
        defaultLocale: args.locales.urlDefault,
        supportedLocales: args.locales.supported,
      })
    : null;
  const builtCanonical = alt?.canonical ?? `${origin}${path.startsWith("/") ? path : `/${path}`}`;
  // An operator's explicit canonical_url describes the primary-language page;
  // a translated version stays self-canonical so its hreflang is honoured.
  const isPrimary = !args.locales || locale === args.locales.primary;
  const explicit = isPrimary && !args.ignoreExplicitCanonical ? page.canonicalUrl?.trim() : "";
  const explicitIsOwn = explicit ? isOwnCanonical(explicit, { origin, hosts: args.ownHosts ?? [] }) : false;
  if (explicit && !explicitIsOwn && process.env.NODE_ENV !== "production") {
    // Silent-failure signal (AGENTS.md): name the row and the host, never throw.
    // eslint-disable-next-line no-console
    console.warn(
      `[talent-site/seo] ignored explicit canonical_url on page ${page.id} (site ${site.siteSlug ?? "?"}): host is not this site's own (${origin})`,
    );
  }
  const canonical = (explicitIsOwn ? explicit : "") || builtCanonical;

  // JSON-LD — operator override wins; else the SHARED profile builder, keyed to
  // the SITE canonical. `name` falls back through identity → title.
  // JSON-LD `name` is the PERSON, so it falls back to the page title, never to
  // the SEO override (a SERP string like "Actor in Madrid | Hire" is not a name).
  const name = identity?.name?.trim() || pageTitle;
  const sharedJsonLd =
    name && canonical
      ? buildTalentProfileJsonLd({
          canonicalUrl: canonical,
          name,
          description: description ?? page.ogDescription?.trim() ?? null,
          imageUrl: page.ogImageUrl?.trim() ?? site.logoUrl ?? null,
          inLanguage: locale,
          createdAt: identity?.createdAt ?? null,
          updatedAt: identity?.updatedAt ?? null,
          services: args.services ?? null,
          addressLocality: args.addressLocality ?? null,
          sameAs: args.sameAs ? [...args.sameAs] : null,
        })
      : null;
  const businessLd = buildTalentLocalBusinessJsonLd({
    canonicalUrl: canonical,
    name,
    description: description ?? page.ogDescription?.trim() ?? null,
    imageUrl: page.ogImageUrl?.trim() ?? site.logoUrl ?? null,
    addressLocality: args.addressLocality,
    sameAs: args.sameAs,
    inLanguage: locale,
    services: args.services,
  });
  const jsonLd =
    page.jsonLd && typeof page.jsonLd === "object" ? page.jsonLd : withLocalBusiness(sharedJsonLd, businessLd);

  const faviconUrl = siteFaviconFor({ logoUrl: site.logoUrl, displayName: identity?.name || pageTitle });

  // TUL-534 / GRK-091: always emit og:image. Page column → logo → generated card
  // on the platform `/t/site/<slug>/opengraph-image` (fetchable; vanity
  // `/opengraph-image` is wired separately). Without this, demos ship no picture.
  const ogImageUrl =
    page.ogImageUrl?.trim() ||
    site.logoUrl?.trim() ||
    (site.siteSlug
      ? `${publicSiteMetadataBase().origin.replace(/\/$/, "")}/t/site/${encodeURIComponent(site.siteSlug)}/opengraph-image`
      : origin
        ? `${origin}/opengraph-image`
        : null);

  return {
    title,
    ...(faviconUrl ? { faviconUrl } : {}),
    ...(description ? { description } : {}),
    // The draft preview is ALWAYS noindex; on top of that the page's own
    // `noindex` column is honoured (it was loaded but never read before). NULL
    // and `false` stay indexable, matching the column comment. The whole site
    // is already Max-gated, so no extra tier check belongs here.
    noindex: noindex || page.noindex === true,
    ...(page.ogTitle?.trim() ? { ogTitle: page.ogTitle.trim() } : {}),
    ...(page.ogDescription?.trim()
      ? { ogDescription: page.ogDescription.trim() }
      : {}),
    ...(ogImageUrl ? { ogImageUrl } : {}),
    ...(canonical ? { canonical } : {}),
    ...(alt?.languages ? { alternates: { canonical, languages: alt.languages } } : {}),
    ...(jsonLd ? { jsonLd } : {}),
  };
}
