import "server-only";

import { buildTalentProfileJsonLd } from "@/lib/seo/talent-json-ld";
import { publicSiteMetadataBase } from "@/lib/seo/locale-alternates";
import {
  resolveMaxSiteTitles,
  type MaxSiteRow,
  type MaxSitePageRow,
} from "@/lib/talent-site/resolve-max-site-core";

import type { TalentSiteIdentity } from "./load-max-site";
import type { MaxSiteSeo } from "./render-max-site";

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
  canonicalOrigin?: string;
  canonicalPath?: string;
}): MaxSiteSeo {
  const { site, page, identity, locale, noindex } = args;

  // SEO-3 — `meta_title` overrides the SERP/tab title. Folded into `title` here
  // rather than added to `MaxSiteSeo`, so the shared `maxSiteSeoToMetadata`
  // mapper needs no change and all three talent-site routes pick it up in
  // lockstep — including og:title, which already falls back to `title`.
  const { pageTitle, seoTitle: title } = resolveMaxSiteTitles(
    page,
    identity?.name || site.siteSlug || "",
  );
  const description = page.metaDescription?.trim() || undefined;

  // Canonical — explicit column wins; else origin + path. Never the profile.
  const origin = (args.canonicalOrigin?.trim() || publicSiteMetadataBase().origin)
    .replace(/\/$/, "");
  const path = args.canonicalPath?.trim() || "/";
  const builtCanonical = `${origin}${path.startsWith("/") ? path : `/${path}`}`;
  const canonical = page.canonicalUrl?.trim() || builtCanonical;

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
          givenName: identity?.firstName ?? null,
          familyName: identity?.lastName ?? null,
          description: description ?? page.ogDescription?.trim() ?? null,
          imageUrl: page.ogImageUrl?.trim() ?? site.logoUrl ?? null,
          inLanguage: locale,
          createdAt: identity?.createdAt ?? null,
          updatedAt: identity?.updatedAt ?? null,
        })
      : null;
  const jsonLd =
    page.jsonLd && typeof page.jsonLd === "object" ? page.jsonLd : sharedJsonLd;

  return {
    title,
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
    ...(page.ogImageUrl?.trim() ? { ogImageUrl: page.ogImageUrl.trim() } : {}),
    ...(canonical ? { canonical } : {}),
    ...(jsonLd ? { jsonLd } : {}),
  };
}
