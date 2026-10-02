import test from "node:test";
import assert from "node:assert/strict";

import { talentSiteSitemapPaths } from "./talent-site-sitemap";
import { talentProfileSitemapEntries } from "./talent-site-locale-routing";

const page = (slug: string, o: Partial<{ isHome: boolean; status: string; sortOrder: number; noindex: boolean | null }> = {}) => ({
  slug,
  isHome: false,
  status: "published",
  sortOrder: 0,
  noindex: null as boolean | null,
  ...o,
});

test("talent host sitemap: home is '/', inner pages are bare slugs", () => {
  const paths = talentSiteSitemapPaths([
    page("home", { isHome: true }),
    page("gallery", { sortOrder: 2 }),
    page("about", { sortOrder: 1 }),
  ]);
  assert.deepEqual(paths, ["/", "/about", "/gallery"]);
});

test("talent host sitemap: drafts, noindex pages and reserved slugs are omitted", () => {
  const paths = talentSiteSitemapPaths([
    page("home", { isHome: true }),
    page("draft", { status: "draft" }),
    page("hidden", { noindex: true }),
    page("api"), // reserved platform word: the host router 404s it
    page("ok"),
  ]);
  assert.deepEqual(paths, ["/", "/ok"]);
});

test("talent host sitemap: no is_home row -> lowest sort_order is '/'", () => {
  assert.deepEqual(
    talentSiteSitemapPaths([page("b", { sortOrder: 2 }), page("a", { sortOrder: 1 })]),
    ["/", "/b"],
  );
});

test("talent host sitemap: nothing published -> empty", () => {
  assert.deepEqual(talentSiteSitemapPaths([page("x", { status: "draft" })]), []);
});

test("talent host sitemap: entries are on the host's own origin", () => {
  const entries = talentSiteSitemapPaths([page("home", { isHome: true }), page("about")]).flatMap((path) =>
    talentProfileSitemapEntries({
      origin: "https://morena.tulala.digital",
      path,
      urlDefault: "en",
      locales: ["en"],
      lastModified: new Date("2026-01-01T00:00:00Z"),
    }),
  );
  assert.deepEqual(
    entries.map((e) => e.url),
    ["https://morena.tulala.digital/", "https://morena.tulala.digital/about"],
  );
});
