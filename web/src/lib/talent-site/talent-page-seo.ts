/**
 * Talent-page SEO envelope — PURE CORE (no runtime imports at module load).
 *
 * The SEO-1 migration (`20261100000000_talent_pages_seo_columns.sql`) added
 * `meta_description`, `og_*`, `canonical_url`, `noindex` and `json_ld` to
 * `talent_pages`, and `20261122000000` added `meta_title`. SEO-2/SEO-3 wired
 * the READ path for the Max SITE routes (`/t/site/...`) only — the public
 * freeform talent page at `/t/[profileCode]/[pageSlug]` still emitted nothing
 * but `{ title: page.title }`, so a Portfolio talent's SEO values never reached
 * `<head>`.
 *
 * This module is the shared, testable rule for that route. It produces the SAME
 * structural envelope the site routes use (`MaxSiteSeo`), so the route can feed
 * it straight into the ONE existing mapper — `maxSiteSeoToMetadata` /
 * `maxSiteJsonLdString` in `talent-site/server/site-metadata.ts`. There is
 * deliberately no second metadata stack.
 *
 * GATE: page-level SEO control is a marketed **Portfolio (Max)** benefit. For
 * Free/Pro talents every stored override is ignored and the envelope collapses
 * to exactly the pre-existing behavior (the page title, indexable) — the
 * columns may be populated (a lapsed Max talent keeps their rows) but they do
 * not reach `<head>`.
 */

import { isTalentPortfolioTier } from "@/lib/access/talent-membership";

/** The `talent_pages` SEO column set, camelCased. Every field degrades to null. */
export interface TalentPageSeoColumns {
  title: string;
  metaTitle: string | null;
  metaDescription: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImageUrl: string | null;
  canonicalUrl: string | null;
  noindex: boolean | null;
  jsonLd: unknown;
}

/**
 * Structurally identical to `MaxSiteSeo` (talent-site/server/render-max-site).
 * Declared here rather than imported so this core stays free of the server
 * graph; the shared mapper accepts it by structural typing.
 */
export interface TalentPageSeoEnvelope {
  title: string;
  description?: string;
  noindex: boolean;
  ogTitle?: string;
  ogDescription?: string;
  ogImageUrl?: string;
  canonical?: string;
  jsonLd?: unknown;
}

function trimmed(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Build the `<head>` envelope for a published `talent_pages` row.
 *
 * - `title` — `meta_title || title || fallback` (the platform-wide convention,
 *   mirroring `resolveMaxSiteTitles`).
 * - `canonical` — the page's explicit `canonical_url` wins; else
 *   `canonicalOrigin + canonicalPath` (this page's own URL). Never invented.
 * - `noindex` — `true` only when the stored column is exactly `true`. NULL and
 *   `false` are indexable, matching the column comment.
 * - `jsonLd` — the stored document, only when it is a JSON object.
 */
export function buildTalentPageSeo(args: {
  page: TalentPageSeoColumns;
  /** `talent_profiles.talent_plan_key` — the SEO controls are Portfolio-only. */
  planKey: string | null | undefined;
  /** Display name / profile code, used when the page has no title. */
  fallbackTitle?: string;
  /** Absolute origin this page is served from (no trailing slash required). */
  canonicalOrigin?: string;
  /** Origin-relative path (leading slash) of this page. */
  canonicalPath?: string;
}): TalentPageSeoEnvelope {
  const { page } = args;
  const pageTitle = trimmed(page.title) || trimmed(args.fallbackTitle);

  // Non-Portfolio: no overrides reach <head>. Byte-identical to the behavior
  // this route had before the SEO columns were read at all.
  if (!isTalentPortfolioTier(args.planKey)) {
    return { title: pageTitle, noindex: false };
  }

  const title = trimmed(page.metaTitle) || pageTitle;
  const description = trimmed(page.metaDescription);
  const ogTitle = trimmed(page.ogTitle);
  const ogDescription = trimmed(page.ogDescription);
  const ogImageUrl = trimmed(page.ogImageUrl);

  const origin = trimmed(args.canonicalOrigin).replace(/\/$/, "");
  const rawPath = trimmed(args.canonicalPath);
  const path = rawPath ? (rawPath.startsWith("/") ? rawPath : `/${rawPath}`) : "";
  const builtCanonical = origin && path ? `${origin}${path}` : "";
  const canonical = trimmed(page.canonicalUrl) || builtCanonical;

  const jsonLd =
    page.jsonLd && typeof page.jsonLd === "object" ? page.jsonLd : undefined;

  return {
    title,
    ...(description ? { description } : {}),
    noindex: page.noindex === true,
    ...(ogTitle ? { ogTitle } : {}),
    ...(ogDescription ? { ogDescription } : {}),
    ...(ogImageUrl ? { ogImageUrl } : {}),
    ...(canonical ? { canonical } : {}),
    ...(jsonLd ? { jsonLd } : {}),
  };
}
