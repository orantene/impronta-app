/** Blog index loader: listable posts only, newest first, paged, per request locale. */
import assert from "node:assert/strict";
import { test } from "node:test";

import { loadBlogIndex } from "./blog-index";
import type { PostScope, PublicPostsDeps, PublicPostsSource } from "./posts-public";
import type { PublicPostRow } from "./posts-public-model";

const NOW = new Date("2026-10-14T12:00:00Z");
const TALENT: PostScope = { kind: "talent", talentProfileId: "22222222-2222-4222-8222-222222222222" };
let seq = 0;
function row(over: Partial<PublicPostRow> = {}): PublicPostRow {
  seq += 1;
  return {
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    tenant_id: null, talent_profile_id: "22222222-2222-4222-8222-222222222222",
    locale: "es", slug: `post-${seq}`, title: `Post ${seq}`, excerpt: null, body: null, body_blocks: null,
    status: "published", published_at: "2026-10-01T10:00:00Z", updated_at: null, meta_title: null,
    meta_description: null, og_image_url: null, noindex: false, include_in_sitemap: true, is_unlisted: false,
    is_featured: false, expires_at: null, cover_image_url: null, cover_image_alt: null, category_id: null,
    translation_of: null, related_offering_id: null, taken_down_at: null, ...over,
  };
}
function deps(rows: PublicPostRow[]): PublicPostsDeps {
  const source = {
    listPublished: async (_s: PostScope, locale: string) => rows.filter((r) => r.locale === locale),
  } as unknown as PublicPostsSource;
  return { source, now: () => NOW };
}
const site = { scope: TALENT, supportedLocales: ["es", "en"] as const };

test("lists only listable posts of the request locale, newest first", async () => {
  const rows = [
    row({ slug: "old", published_at: "2026-09-01T00:00:00Z" }),
    row({ slug: "new", published_at: "2026-10-10T00:00:00Z" }),
    row({ slug: "draft", status: "draft" }),
    row({ slug: "down", taken_down_at: "2026-10-02T00:00:00Z" }),
    row({ slug: "expired", expires_at: "2026-10-03T00:00:00Z" }),
    row({ slug: "hidden", is_unlisted: true }),
    row({ slug: "en-one", locale: "en" }),
  ];
  const r = await loadBlogIndex(site, "es", 1, deps(rows));
  assert.deepEqual(r.page.items.map((p) => p.slug), ["new", "old"]);
  assert.deepEqual(r.counts, { es: 2, en: 1 });
});

test("paginates 10 per page across ?page=n and flags a page past the end", async () => {
  const rows = Array.from({ length: 12 }, (_, i) =>
    row({ slug: `s${i}`, published_at: `2026-10-${String(i + 1).padStart(2, "0")}T00:00:00Z` }));
  const p1 = await loadBlogIndex(site, "es", 1, deps(rows));
  const p2 = await loadBlogIndex(site, "es", 2, deps(rows));
  assert.equal(p1.page.items.length, 10);
  assert.deepEqual(p2.page.items.map((p) => p.slug), ["s1", "s0"]);
  assert.equal((await loadBlogIndex(site, "es", 3, deps(rows))).page.outOfRange, true);
});

test("no source (service role missing) degrades to an empty list, not an error", async () => {
  const r = await loadBlogIndex(site, "es", 1, null);
  assert.equal(r.page.items.length, 0);
  assert.equal(r.page.outOfRange, false);
});
