/**
 * Pins the Portfolio-gated `<head>` envelope built from the `talent_pages` SEO
 * columns for the public talent page at `/t/[profileCode]/[pageSlug]`.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTalentPageSeo,
  type TalentPageSeoColumns,
} from "./talent-page-seo";

function page(partial: Partial<TalentPageSeoColumns> = {}): TalentPageSeoColumns {
  return {
    title: "About",
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

const ORIGIN = "https://tulala.digital";
const PATH = "/t/ANA123/about";

test("Portfolio: every stored SEO column reaches the envelope", () => {
  const seo = buildTalentPageSeo({
    page: page({
      metaTitle: "Ana Ruiz | Actor in Madrid",
      metaDescription: "Bilingual actor based in Madrid.",
      ogTitle: "Ana Ruiz OG",
      ogDescription: "OG description",
      ogImageUrl: "https://cdn.example.com/ana.jpg",
      jsonLd: { "@type": "AboutPage" },
    }),
    planKey: "talent_portfolio",
    canonicalOrigin: ORIGIN,
    canonicalPath: PATH,
  });

  assert.equal(seo.title, "Ana Ruiz | Actor in Madrid");
  assert.equal(seo.description, "Bilingual actor based in Madrid.");
  assert.equal(seo.ogTitle, "Ana Ruiz OG");
  assert.equal(seo.ogDescription, "OG description");
  assert.equal(seo.ogImageUrl, "https://cdn.example.com/ana.jpg");
  assert.equal(seo.canonical, `${ORIGIN}${PATH}`);
  assert.deepEqual(seo.jsonLd, { "@type": "AboutPage" });
  assert.equal(seo.noindex, false);
});

test("Portfolio: an explicit canonical_url beats the built one", () => {
  const seo = buildTalentPageSeo({
    page: page({ canonicalUrl: "https://anaruiz.com/about" }),
    planKey: "talent_portfolio",
    canonicalOrigin: ORIGIN,
    canonicalPath: PATH,
  });
  assert.equal(seo.canonical, "https://anaruiz.com/about");
});

test("Portfolio: noindex is honoured, and only when exactly true", () => {
  const on = buildTalentPageSeo({
    page: page({ noindex: true }),
    planKey: "talent_portfolio",
  });
  assert.equal(on.noindex, true);

  for (const value of [false, null] as const) {
    const off = buildTalentPageSeo({
      page: page({ noindex: value }),
      planKey: "talent_portfolio",
    });
    assert.equal(off.noindex, false);
  }
});

test("Portfolio: blank overrides fall back rather than emitting empty strings", () => {
  const seo = buildTalentPageSeo({
    page: page({ metaTitle: "   ", metaDescription: "  ", ogTitle: "" }),
    planKey: "talent_portfolio",
  });
  assert.equal(seo.title, "About");
  assert.equal(seo.description, undefined);
  assert.equal(seo.ogTitle, undefined);
});

test("Portfolio: a non-object json_ld is ignored", () => {
  const seo = buildTalentPageSeo({
    page: page({ jsonLd: "not-json-ld" }),
    planKey: "talent_portfolio",
  });
  assert.equal(seo.jsonLd, undefined);
});

test("Free and Pro: stored overrides never reach <head>", () => {
  for (const planKey of [null, "talent_basic", "talent_pro"]) {
    const seo = buildTalentPageSeo({
      page: page({
        metaTitle: "Should not surface",
        metaDescription: "Should not surface",
        ogTitle: "Should not surface",
        canonicalUrl: "https://elsewhere.example.com/x",
        noindex: true,
        jsonLd: { "@type": "AboutPage" },
      }),
      planKey,
      canonicalOrigin: ORIGIN,
      canonicalPath: PATH,
    });
    assert.deepEqual(
      seo,
      { title: "About", noindex: false },
      `plan ${String(planKey)} must collapse to the pre-SEO behavior`,
    );
  }
});

test("title falls back to the talent display name when the page has none", () => {
  const seo = buildTalentPageSeo({
    page: page({ title: "" }),
    planKey: "talent_portfolio",
    fallbackTitle: "Ana Ruiz",
  });
  assert.equal(seo.title, "Ana Ruiz");
});

test("no canonical is invented when the route supplies no origin/path", () => {
  const seo = buildTalentPageSeo({
    page: page(),
    planKey: "talent_portfolio",
  });
  assert.equal(seo.canonical, undefined);
});
