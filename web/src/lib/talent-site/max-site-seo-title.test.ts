/**
 * SEO-3 — `resolveMaxSiteTitles`: the `talent_pages.meta_title` override.
 *
 * `meta_title` landed in 20261122000000 to close the last no-op field in the
 * shared Page settings drawer (the SEO-1 column set deliberately omitted it, so
 * even after #1212 wired the other seven columns end to end, "Meta title" stayed
 * a silent no-op on talent pages).
 *
 * The fold lives in the PURE core (`resolve-max-site-core.ts`), not in
 * `render-max-site.tsx`, for two reasons:
 *   1. it stays testable without standing up a React server component, and
 *   2. `MaxSiteSeo` never had to widen — which is what keeps the three
 *      talent-site routes consuming one envelope in lockstep instead of forking.
 *
 * WHY ITS OWN FILE, and not `resolve-max-site-core.test.ts` (the natural home):
 * that file is in NO CI lane, and it currently has a REAL pre-existing failure —
 * `hydrateShellNav` walks for a `kind: "nav"` node, but `buildDefaultShellTree`
 * now emits a `site_header` section carrying `navItems` in its config, so the
 * hydration silently matches nothing. Putting these tests there would mean
 * shipping guards that never run in CI. This file IS added to `test:builder`.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveMaxSiteTitles,
  type MaxSitePageRow,
} from "./resolve-max-site-core";

function page(partial: Partial<MaxSitePageRow> = {}): MaxSitePageRow {
  return {
    id: "id-index",
    slug: "index",
    title: "Ana Ruiz",
    navLabel: null,
    status: "published",
    isHome: true,
    sortOrder: 0,
    blocks: [],
    theme: {},
    metaTitle: null,
    metaDescription: null,
    ogTitle: null,
    ogDescription: null,
    ogImageUrl: null,
    canonicalUrl: null,
    noindex: null,
    jsonLd: null,
    ...partial,
  };
}

test("[SEO-3] meta_title overrides the SERP title but NEVER the page title", () => {
  const { pageTitle, seoTitle } = resolveMaxSiteTitles(
    page({ title: "Ana Ruiz", metaTitle: "Ana Ruiz — Actor in Madrid | Hire" }),
  );
  assert.equal(seoTitle, "Ana Ruiz — Actor in Madrid | Hire");
  // JSON-LD `name` describes a PERSON and falls back to pageTitle; a SERP string
  // like "Actor in Madrid | Hire" must never leak into structured data.
  assert.equal(pageTitle, "Ana Ruiz");
});

test("[SEO-3] a NULL meta_title leaves the rendered title exactly as before", () => {
  // Back-compat guard: every pre-migration row has meta_title NULL, so shipping
  // the column must not change a single existing page's <title>.
  const { pageTitle, seoTitle } = resolveMaxSiteTitles(
    page({ title: "Ana Ruiz", metaTitle: null }),
  );
  assert.equal(seoTitle, "Ana Ruiz");
  assert.equal(pageTitle, "Ana Ruiz");
});

test("[SEO-3] a blank/whitespace meta_title is ignored, not emitted as an empty title", () => {
  // The drawer writes "" → null, but a whitespace-only value could still reach
  // the column; emitting it would blank the <title> of a live page.
  for (const blank of ["", "   ", "\n\t"]) {
    assert.equal(
      resolveMaxSiteTitles(page({ title: "Ana Ruiz", metaTitle: blank })).seoTitle,
      "Ana Ruiz",
      `meta_title ${JSON.stringify(blank)} must fall back to the page title`,
    );
  }
});

test("[SEO-3] both titles fall back when the page title is empty", () => {
  const { pageTitle, seoTitle } = resolveMaxSiteTitles(
    page({ title: "", metaTitle: null }),
    "Sofía Vega",
  );
  assert.equal(pageTitle, "Sofía Vega");
  assert.equal(seoTitle, "Sofía Vega");
});

test("[SEO-3] meta_title still wins over the identity fallback", () => {
  assert.equal(
    resolveMaxSiteTitles(page({ title: "", metaTitle: "Override" }), "Sofía Vega")
      .seoTitle,
    "Override",
  );
});
