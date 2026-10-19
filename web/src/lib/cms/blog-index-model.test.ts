/**
 * Blog index (/blog) pure model: pagination, SEO rules, sitemap entries, nav gating.
 * Run: npm run test:wt src/lib/cms/blog-index-model.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BLOG_INDEX_PAGE_SIZE,
  blogIndexCopy,
  blogIndexHref,
  buildBlogIndexSeo,
  hasListablePost,
  paginateBlogIndex,
  parseBlogIndexPage,
} from "./blog-index-model";
import { blogIndexSitemapEntries } from "@/lib/seo/blog-index-sitemap-entries";
import { withBlogHeaderLink } from "./blog-nav-link";
import type { PublicPostRow } from "./posts-public-model";

const NOW = new Date("2026-10-14T12:00:00Z");
const urlFor = (path: string, locale: string) => `https://x.test${locale === "es" ? "" : "/en"}${path}`;

function row(over: Partial<PublicPostRow> = {}): PublicPostRow {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    tenant_id: null,
    talent_profile_id: "p",
    locale: "es",
    slug: "a",
    title: "A",
    excerpt: null,
    body: null,
    body_blocks: null,
    status: "published",
    published_at: "2026-10-01T10:00:00Z",
    updated_at: null,
    meta_title: null,
    meta_description: null,
    og_image_url: null,
    noindex: false,
    include_in_sitemap: true,
    is_unlisted: false,
    is_featured: false,
    expires_at: null,
    cover_image_url: null,
    cover_image_alt: null,
    category_id: null,
    translation_of: null,
    related_offering_id: null,
    taken_down_at: null,
    ...over,
  };
}

test("page param: junk, zero, negative, fractional and arrays fall back to 1", () => {
  for (const raw of [undefined, "", "0", "-2", "abc", "1.5", ["x"], "99999999"]) {
    assert.equal(parseBlogIndexPage(raw as string | string[] | undefined), 1, String(raw));
  }
  assert.equal(parseBlogIndexPage("3"), 3);
  assert.equal(parseBlogIndexPage(["2", "5"]), 2);
});

test("pagination: 10 per page, last page partial, out of range flagged, page 1 of empty is valid", () => {
  const items = Array.from({ length: 23 }, (_, i) => i);
  assert.equal(BLOG_INDEX_PAGE_SIZE, 10);
  const p1 = paginateBlogIndex(items, 1);
  assert.deepEqual([p1.items.length, p1.totalPages, p1.hasPrev, p1.hasNext, p1.outOfRange], [10, 3, false, true, false]);
  const p3 = paginateBlogIndex(items, 3);
  assert.deepEqual([p3.items, p3.hasPrev, p3.hasNext], [[20, 21, 22], true, false]);
  assert.equal(paginateBlogIndex(items, 4).outOfRange, true);
  const empty = paginateBlogIndex([], 1);
  assert.deepEqual([empty.items.length, empty.totalPages, empty.outOfRange], [0, 1, false]);
  assert.equal(paginateBlogIndex([], 2).outOfRange, true);
});

test("hrefs: page 1 is the clean /blog, later pages carry ?page=n", () => {
  assert.equal(blogIndexHref(1), "/blog");
  assert.equal(blogIndexHref(2), "/blog?page=2");
});

test("copy is Spanish for es and English otherwise, no em dashes", () => {
  assert.equal(blogIndexCopy("es").empty, "Todavía no hay entradas publicadas.");
  assert.equal(blogIndexCopy("en").empty, "No posts have been published yet.");
  assert.equal(blogIndexCopy("fr").title, "Blog");
  for (const l of ["es", "en"]) assert.ok(!JSON.stringify(blogIndexCopy(l)).includes("—"));
});

test("SEO: page 1 canonical is the clean URL, page n is self-canonical", () => {
  const base = { urlFor, locale: "es", siteLocales: ["es"], counts: { es: 25 } };
  assert.equal(buildBlogIndexSeo({ ...base, page: 1 }).canonical, "https://x.test/blog");
  assert.equal(buildBlogIndexSeo({ ...base, page: 2 }).canonical, "https://x.test/blog?page=2");
  assert.equal(buildBlogIndexSeo({ ...base, locale: "en", page: 2, siteLocales: ["es", "en"], counts: { es: 25, en: 25 } }).canonical, "https://x.test/en/blog?page=2");
});

test("SEO: hreflang only when both locales have posts, and only for pages both have", () => {
  const both = buildBlogIndexSeo({ urlFor, locale: "es", page: 1, siteLocales: ["es", "en"], counts: { es: 3, en: 2 } });
  assert.deepEqual(both.languages, { es: "https://x.test/blog", en: "https://x.test/en/blog" });
  const oneSided = buildBlogIndexSeo({ urlFor, locale: "es", page: 1, siteLocales: ["es", "en"], counts: { es: 3, en: 0 } });
  assert.equal(oneSided.languages, undefined);
  const single = buildBlogIndexSeo({ urlFor, locale: "es", page: 1, siteLocales: ["es"], counts: { es: 3 } });
  assert.equal(single.languages, undefined);
  const page2 = buildBlogIndexSeo({ urlFor, locale: "es", page: 2, siteLocales: ["es", "en"], counts: { es: 15, en: 4 } });
  assert.equal(page2.languages, undefined, "en has no page 2, so no pair");
  const page2both = buildBlogIndexSeo({ urlFor, locale: "es", page: 2, siteLocales: ["es", "en"], counts: { es: 15, en: 14 } });
  assert.deepEqual(page2both.languages, { es: "https://x.test/blog?page=2", en: "https://x.test/en/blog?page=2" });
});

test("SEO: empty list is noindex, a list with posts is indexable", () => {
  assert.equal(buildBlogIndexSeo({ urlFor, locale: "es", page: 1, siteLocales: ["es"], counts: { es: 0 } }).noindex, true);
  assert.equal(buildBlogIndexSeo({ urlFor, locale: "es", page: 1, siteLocales: ["es"], counts: { es: 1 } }).noindex, false);
});

test("hasListablePost: draft, taken down, expired, unlisted and future rows do not count", () => {
  const bad = [
    row({ status: "draft" }),
    row({ taken_down_at: "2026-10-02T00:00:00Z" }),
    row({ expires_at: "2026-10-03T00:00:00Z" }),
    row({ is_unlisted: true }),
    row({ published_at: "2026-12-01T00:00:00Z" }),
  ];
  assert.equal(hasListablePost(bad, NOW), false);
  assert.equal(hasListablePost([...bad, row()], NOW), true);
  assert.equal(hasListablePost([], NOW), false);
});

test("sitemap: one /blog entry per locale with indexable posts, hreflang when two", () => {
  const rows = [
    row({ id: "1", slug: "a", locale: "es", updated_at: "2026-10-05T00:00:00Z" }),
    row({ id: "2", slug: "b", locale: "es", updated_at: "2026-10-09T00:00:00Z" }),
    row({ id: "3", slug: "c", locale: "en" }),
    row({ id: "4", slug: "d", locale: "es", noindex: true, updated_at: "2026-10-12T00:00:00Z" }),
  ];
  const out = blogIndexSitemapEntries(rows, urlFor, NOW);
  assert.deepEqual(out.map((e) => e.url), ["https://x.test/blog", "https://x.test/en/blog"]);
  assert.equal(out[0].lastModified?.toString(), new Date("2026-10-09T00:00:00Z").toString());
  assert.deepEqual(out[0].alternates?.languages, { es: "https://x.test/blog", en: "https://x.test/en/blog" });
  assert.deepEqual(blogIndexSitemapEntries([row({ status: "draft" })], urlFor, NOW), []);
  const single = blogIndexSitemapEntries([row()], urlFor, NOW);
  assert.equal(single.length, 1);
  assert.equal(single[0].alternates, undefined);
});

test("workspace nav: Blog appended only when posts exist, never duplicated", () => {
  const links = [{ label: "Inicio", href: "/", sort_order: 0 }];
  assert.deepEqual(withBlogHeaderLink(links, false, "/blog"), links);
  const out = withBlogHeaderLink(links, true, "/blog");
  assert.deepEqual(out.map((l) => [l.label, l.href]), [["Inicio", "/"], ["Blog", "/blog"]]);
  assert.equal(withBlogHeaderLink(out, true, "/blog").length, 2);
  const withExisting = [{ label: "Notas", href: "/es/blog", sort_order: 1 }];
  assert.equal(withBlogHeaderLink(withExisting, true, "/es/blog").length, 1);
});
