/**
 * Posts v1 (PO1) `posts_feed` query layer: listability (no drafts, unlisted,
 * expired or taken-down), tags any-of, category, exclude, featured,
 * hand-pick order, sort, limit and page offsets; the per-node server resolver
 * and its scope rule. Typed fakes only.
 * Run: NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' node_modules/.bin/tsx --test src/lib/cms/posts-widget-query.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { postsFeedScopeFor, resolvePostsFeedNeeds } from "@/lib/site-admin/builder-node/posts-feed-sources";
import { collectNativeDataBlockNeeds } from "@/lib/site-admin/builder-node/native-data-block-needs";
import { postsFeedPageOffset } from "@/lib/site-admin/builder-node/posts-feed-model";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

import type { PublicPostCategoryRow } from "./posts-public-model";
import type { PostScope } from "./posts-writer";
import {
  collectPostsWidgetTags,
  loadPostsWidgetCards,
  postsWidgetReadingMinutes,
  selectPostsWidgetRows,
  type PostsWidgetQuery,
  type PostsWidgetRow,
  type PostsWidgetSource,
} from "./posts-widget-query";

const NOW = new Date("2026-10-14T12:00:00Z");
const TALENT: PostScope = { kind: "talent", talentProfileId: "22222222-2222-4222-8222-222222222222" };
const CAT_TIPS = "33333333-3333-4333-8333-333333333333";
const CAT_NEWS = "44444444-4444-4444-8444-444444444444";

let seq = 0;
function row(over: Partial<PostsWidgetRow> = {}): PostsWidgetRow {
  seq += 1;
  return {
    id: `p${seq}`,
    tenant_id: null,
    talent_profile_id: TALENT.kind === "talent" ? TALENT.talentProfileId : null,
    locale: "es",
    slug: `post-${seq}`,
    title: `Post ${seq}`,
    excerpt: "Resumen",
    body: "uno dos tres",
    body_blocks: null,
    status: "published",
    published_at: `2026-10-${String(seq).padStart(2, "0")}T10:00:00Z`,
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
    tags: [],
    ...over,
  };
}

class FakeSource implements PostsWidgetSource {
  readonly calls: PostScope[] = [];
  constructor(
    private readonly rows: PostsWidgetRow[],
    private readonly cats: PublicPostCategoryRow[] = [],
  ) {}
  async listPublished(scope: PostScope, locale: string): Promise<PostsWidgetRow[]> {
    this.calls.push(scope);
    return this.rows.filter((r) => r.locale === locale);
  }
  async listCategories(): Promise<PublicPostCategoryRow[]> {
    return this.cats;
  }
}

function fixture() {
  seq = 0;
  return [
    row({ tags: ["Care", "nails"], category_id: CAT_TIPS }), // p1
    row({ tags: ["color"], is_featured: true, category_id: CAT_NEWS }), // p2
    row({ tags: ["care"], category_id: CAT_TIPS }), // p3
    row({ status: "draft", tags: ["care"] }), // p4 draft
    row({ is_unlisted: true, tags: ["care"] }), // p5 unlisted
    row({ expires_at: "2026-10-01T00:00:00Z", tags: ["care"] }), // p6 expired
    row({ taken_down_at: "2026-10-10T00:00:00Z", tags: ["care"] }), // p7 taken down
    row({ is_featured: true }), // p8
    row({ published_at: "2027-01-01T00:00:00Z" }), // p9 scheduled (future)
    row({}), // p10
  ];
}

const q = (over: Partial<PostsWidgetQuery> = {}): PostsWidgetQuery => ({ source: "latest", sort: "newest", limit: 24, ...over });
const ids = (rows: readonly PostsWidgetRow[]) => rows.map((r) => r.id);

test("listability: drafts, unlisted, expired, taken-down and future posts never show", () => {
  const { rows, total } = selectPostsWidgetRows(fixture(), q(), NOW);
  assert.deepEqual(ids(rows), ["p10", "p8", "p3", "p2", "p1"]);
  assert.equal(total, 5);
});

test("tags: any-of, case-insensitive", () => {
  assert.deepEqual(ids(selectPostsWidgetRows(fixture(), q({ tags: ["CARE"] }), NOW).rows), ["p3", "p1"]);
  assert.deepEqual(ids(selectPostsWidgetRows(fixture(), q({ tags: ["nails", "color"] }), NOW).rows), ["p2", "p1"]);
  assert.deepEqual(ids(selectPostsWidgetRows(fixture(), q({ tags: ["nope"] }), NOW).rows), []);
});

test("category filter", () => {
  assert.deepEqual(ids(selectPostsWidgetRows(fixture(), q({ categoryId: CAT_TIPS }), NOW).rows), ["p3", "p1"]);
  assert.deepEqual(ids(selectPostsWidgetRows(fixture(), q({ categoryId: CAT_TIPS, tags: ["nails"] }), NOW).rows), ["p1"]);
});

test("exclude ids", () => {
  assert.deepEqual(ids(selectPostsWidgetRows(fixture(), q({ excludeIds: ["p10", "p3"] }), NOW).rows), ["p8", "p2", "p1"]);
});

test("featured source and sorts", () => {
  assert.deepEqual(ids(selectPostsWidgetRows(fixture(), q({ source: "featured" }), NOW).rows), ["p8", "p2"]);
  assert.deepEqual(ids(selectPostsWidgetRows(fixture(), q({ sort: "oldest" }), NOW).rows), ["p1", "p2", "p3", "p8", "p10"]);
  assert.deepEqual(ids(selectPostsWidgetRows(fixture(), q({ sort: "featured_first" }), NOW).rows), ["p8", "p2", "p10", "p3", "p1"]);
});

test("hand-pick keeps the chosen order, skips unlistable and excluded ids, ignores filters", () => {
  const picked = selectPostsWidgetRows(
    fixture(),
    q({ source: "hand_picked", postIds: ["p3", "p4", "p1", "p10", "p3", "missing"], tags: ["color"], categoryId: CAT_NEWS, sort: "oldest" }),
    NOW,
  );
  assert.deepEqual(ids(picked.rows), ["p3", "p1", "p10"]);
  assert.equal(picked.total, 3);
  assert.deepEqual(ids(selectPostsWidgetRows(fixture(), q({ source: "hand_picked", postIds: ["p3", "p1"], excludeIds: ["p1"] }), NOW).rows), ["p3"]);
  assert.deepEqual(ids(selectPostsWidgetRows(fixture(), q({ source: "hand_picked" }), NOW).rows), []);
});

test("limit and page offsets", () => {
  const all = fixture();
  assert.deepEqual(ids(selectPostsWidgetRows(all, q({ limit: 2 }), NOW).rows), ["p10", "p8"]);
  const total = selectPostsWidgetRows(all, q(), NOW).total;
  const page2 = selectPostsWidgetRows(all, q({ limit: 2, offset: postsFeedPageOffset(2, 2, total) }), NOW);
  assert.deepEqual(ids(page2.rows), ["p3", "p2"]);
  const page3 = selectPostsWidgetRows(all, q({ limit: 2, offset: postsFeedPageOffset(3, 2, total) }), NOW);
  assert.deepEqual(ids(page3.rows), ["p1"]);
  assert.equal(page3.total, 5);
  const beyond = selectPostsWidgetRows(all, q({ limit: 2, offset: postsFeedPageOffset(99, 2, total) }), NOW);
  assert.deepEqual(ids(beyond.rows), ["p1"], "a page past the end clamps to the last page");
});

test("cards: blog path, category name, reading time, tags, featured flag", async () => {
  const source = new FakeSource(fixture(), [{ id: CAT_TIPS, slug: "tips", name: "Consejos", locale: "es" }]);
  const data = await loadPostsWidgetCards({ scope: TALENT, locale: "es", query: q({ tags: ["nails"] }), deps: { source, now: () => NOW }, author: "Ana" });
  assert.equal(data.total, 1);
  const card = data.cards[0]!;
  assert.equal(card.path, "/blog/post-1");
  assert.equal(card.category, "Consejos");
  assert.equal(card.readingMinutes, 1);
  assert.equal(card.author, "Ana");
  assert.deepEqual(card.tags, ["Care", "nails"]);
  assert.equal(card.featured, undefined);
  assert.deepEqual(source.calls, [TALENT]);
});

test("reading minutes: blocks first, then the legacy body at 200 wpm", () => {
  assert.equal(postsWidgetReadingMinutes({ body: "", body_blocks: null }), 0);
  assert.equal(postsWidgetReadingMinutes({ body: Array.from({ length: 401 }, () => "w").join(" "), body_blocks: null }), 3);
  assert.equal(postsWidgetReadingMinutes({ body: "ignored", body_blocks: [{ id: "b1", type: "paragraph", text: "hola mundo" }] }), 1);
});

test("tag list for the inspector picker: distinct, normalised, listable posts only", () => {
  assert.deepEqual(collectPostsWidgetTags(fixture(), NOW), ["care", "color", "nails"]);
});

test("resolver: each node gets its own cards; scope is the rendering site", async () => {
  const tree: BuilderNode[] = [
    { id: "a", kind: "posts_feed", props: { tags: ["color"] } },
    { id: "b", kind: "posts_feed", props: { source: "hand_picked", postIds: ["p1", "p3"] } },
    { id: "c", kind: "posts_feed", props: { limit: 2, pagination: "load_more" } },
  ];
  const needs = collectNativeDataBlockNeeds(tree).postsFeeds;
  const source = new FakeSource(fixture());
  const out = await resolvePostsFeedNeeds({ needs, scope: TALENT, locale: "es", deps: { source, now: () => NOW } });
  assert.deepEqual(out.a!.cards.map((c) => c.id), ["p2"]);
  assert.deepEqual(out.b!.cards.map((c) => c.id), ["p1", "p3"]);
  assert.equal(out.c!.cards.length, 5, "load-more pre-fetches up to 4 pages of 2");
  assert.equal(out.c!.total, 5);

  assert.deepEqual(postsFeedScopeFor({ talentProfileId: "t1", tenantId: "w1" }), { kind: "talent", talentProfileId: "t1" });
  assert.deepEqual(postsFeedScopeFor({ tenantId: "w1" }), { kind: "tenant", tenantId: "w1" });
  assert.equal(postsFeedScopeFor({}), null);
});

test("resolver: a failing source yields an empty node, never a throw", async () => {
  const broken: PostsWidgetSource = {
    async listPublished() {
      throw new Error("db down");
    },
    async listCategories() {
      return [];
    },
  };
  const needs = collectNativeDataBlockNeeds([{ id: "a", kind: "posts_feed", props: {} }]).postsFeeds;
  const out = await resolvePostsFeedNeeds({ needs, scope: TALENT, locale: "es", deps: { source: broken } });
  assert.deepEqual(out.a, { cards: [], total: 0 });
});
