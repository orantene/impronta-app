import test from "node:test";
import assert from "node:assert/strict";

import {
  TALENT_SITE_SEO_BASIC_KEYS,
  TALENT_SITE_SEO_PATCH_KEYS,
  scrubTalentSiteSeo,
  stripTalentSiteSeoPatch,
  type TalentSiteSeoFields,
} from "./free-site-seo";

/** PHASE 1 — SEO is Web Office: stripped on save, ignored on render. */

function fullPatch(): Record<string, unknown> {
  return {
    blocks: [{ id: "n1" }],
    theme: {},
    updated_at: "2026-09-23T00:00:00Z",
    title: "Home",
    meta_title: "Actor in Madrid | Hire",
    meta_description: "desc",
    og_title: "og",
    og_description: "ogd",
    og_image_url: "https://example.test/og.png",
    canonical_url: "https://example.test/",
    noindex: true,
    json_ld: { "@type": "Person" },
  };
}

test("strip: without personalSiteSeo every SEO column leaves the patch", () => {
  const out = stripTalentSiteSeoPatch(fullPatch(), false);
  for (const key of TALENT_SITE_SEO_PATCH_KEYS) {
    assert.equal(key in out, false, `${key} must be stripped`);
  }
});

test("strip: the rest of the patch survives untouched, so the SAVE SUCCEEDS", () => {
  const out = stripTalentSiteSeoPatch(fullPatch(), false);
  assert.deepEqual(out.blocks, [{ id: "n1" }]);
  assert.equal(out.title, "Home");
  assert.equal(out.updated_at, "2026-09-23T00:00:00Z");
  assert.deepEqual(out.theme, {});
});

test("strip: with personalSiteSeo the patch is passed through whole", () => {
  const input = fullPatch();
  const out = stripTalentSiteSeoPatch(input, true);
  assert.deepEqual(out, input);
});

test("strip never mutates the caller's object", () => {
  const input = fullPatch();
  stripTalentSiteSeoPatch(input, false);
  assert.equal(input.meta_description, "desc");
});

test("strip: a tree-only autosave (no SEO keys) is unaffected either way", () => {
  const patch = { blocks: [], updated_at: "t" };
  assert.deepEqual(stripTalentSiteSeoPatch(patch, false), patch);
  assert.deepEqual(stripTalentSiteSeoPatch(patch, true), patch);
});

// ── render-time ──────────────────────────────────────────────────────────────

function storedSeo(): TalentSiteSeoFields & { slug: string } {
  return {
    slug: "home",
    metaTitle: "Actor in Madrid | Hire",
    metaDescription: "desc",
    ogTitle: "og",
    ogDescription: "ogd",
    ogImageUrl: "https://example.test/og.png",
    canonicalUrl: "https://example.test/custom",
    noindex: true,
    jsonLd: { "@type": "Person" },
  };
}

test("scrub: a lapsed talent's stored SEO stops rendering, and is NOT deleted", () => {
  const stored = storedSeo();
  const scrubbed = scrubTalentSiteSeo(stored, false);
  assert.equal(scrubbed.metaTitle, null);
  assert.equal(scrubbed.metaDescription, null);
  assert.equal(scrubbed.ogTitle, null);
  assert.equal(scrubbed.ogDescription, null);
  assert.equal(scrubbed.ogImageUrl, null);
  assert.equal(scrubbed.canonicalUrl, null);
  assert.equal(scrubbed.noindex, null);
  assert.equal(scrubbed.jsonLd, null);
  // The row the caller holds is untouched: restoring the plan restores the SEO.
  assert.deepEqual(stored, storedSeo());
});

test("scrub: non-SEO fields ride through, so the page still renders", () => {
  assert.equal(scrubTalentSiteSeo(storedSeo(), false).slug, "home");
});

test("scrub: with the capability the row is returned as-is", () => {
  const stored = storedSeo();
  assert.equal(scrubTalentSiteSeo(stored, true), stored);
});

test("scrub: a stale noindex cannot keep a free site out of search", () => {
  // The free UI has no way to clear a `noindex` a lapsed Web Office plan left
  // behind, so ignoring it is the only outcome that keeps the free site findable.
  assert.equal(scrubTalentSiteSeo({ ...storedSeo(), noindex: true }, false).noindex, null);
});

// ── TUL-587: basic SEO (title + description) on every plan ───────────────────

test("strip: basic SEO keeps title + description and still drops every other SEO column", () => {
  const out = stripTalentSiteSeoPatch(fullPatch(), false, true);
  for (const key of TALENT_SITE_SEO_BASIC_KEYS) assert.equal(key in out, true, `${key} must survive`);
  assert.equal(out.meta_title, "Actor in Madrid | Hire");
  assert.equal(out.meta_description, "desc");
  for (const key of TALENT_SITE_SEO_PATCH_KEYS) {
    if ((TALENT_SITE_SEO_BASIC_KEYS as readonly string[]).includes(key)) continue;
    assert.equal(key in out, false, `${key} must still be stripped`);
  }
  // The non-SEO half of the patch is untouched, so the save still succeeds.
  assert.equal(out.title, "Home");
});

test("strip: basic SEO is opt-in, the two-argument call keeps its old behaviour", () => {
  const out = stripTalentSiteSeoPatch(fullPatch(), false);
  assert.equal("meta_title" in out, false);
  assert.equal("meta_description" in out, false);
});

test("scrub: basic SEO renders title + description, blanks the advanced fields", () => {
  const stored = storedSeo();
  const scrubbed = scrubTalentSiteSeo(stored, false, true);
  assert.equal(scrubbed.metaTitle, "Actor in Madrid | Hire");
  assert.equal(scrubbed.metaDescription, "desc");
  assert.equal(scrubbed.ogTitle, null);
  assert.equal(scrubbed.ogImageUrl, null);
  assert.equal(scrubbed.canonicalUrl, null);
  assert.equal(scrubbed.jsonLd, null);
  // noindex is still ignored: a free site stays findable.
  assert.equal(scrubbed.noindex, null);
  assert.deepEqual(stored, storedSeo());
});

test("scrub: full SEO wins over basic (the row comes back whole)", () => {
  const stored = storedSeo();
  assert.equal(scrubTalentSiteSeo(stored, true, true), stored);
});
