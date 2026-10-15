/**
 * Posts v1 (PO1) `posts_feed` widget: option defaults + validation, the 8
 * styles' rendered structure, pagination, demo fallback ONLY when empty, and
 * registration in the shared engine (both builders list the one kind).
 * Run: node_modules/.bin/tsx --test src/lib/site-admin/builder-node/posts-feed.test.tsx
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { ADD_GALLERY_ITEMS } from "@/lib/site-admin/add-gallery/registry";
import { filterGalleryItemsForSiteKind } from "@/lib/site-admin/add-gallery/site-kind-visibility";

import { createBuilderNode } from "./create";
import { collectNativeDataBlockNeeds } from "./native-data-block-needs";
import { POSTS_FEED_CSS, postsFeedItemClass } from "./posts-feed-block";
import { postsFeedHref } from "./posts-feed-href";
import {
  POSTS_FEED_DEFAULTS,
  POSTS_FEED_DEMO_TRADES,
  POSTS_FEED_STYLES,
  chunkPostsFeedPages,
  clampPostsFeedLimit,
  demoPostsFeedCards,
  normalizePostsFeedOptions,
  postsFeedDemoTradeForFamily,
  postsFeedFetchLimit,
  resolvePostsFeedCards,
  type PostsFeedCard,
  type PostsFeedNodeData,
  type PostsFeedProps,
  type PostsFeedStyle,
} from "./posts-feed-model";
import { BUILDER_NODE_REGISTRY } from "./registry";
import { renderBuilderNodes, type BuilderNodeRenderDataSources } from "./render";
import type { BuilderNode, BuilderPostsFeedNode } from "./types";
import { validateBuilderNodeTree } from "./validate";

function node(props: PostsFeedProps = {}, id = "pf-1"): BuilderPostsFeedNode {
  return { id, kind: "posts_feed", props };
}

/** Rendered markup with the inline <style> blocks stripped (class names live there too). */
function render(nodes: BuilderNode[], ds: BuilderNodeRenderDataSources = {}, editorPreview = false, locale = "en"): string {
  return renderRaw(nodes, ds, editorPreview, locale).replace(/<style>[\s\S]*?<\/style>/g, "");
}

function renderRaw(nodes: BuilderNode[], ds: BuilderNodeRenderDataSources = {}, editorPreview = false, locale = "en"): string {
  return renderToStaticMarkup(
    renderBuilderNodes(nodes, {
      mode: "freeform",
      includeRendererStyles: false,
      includeFontLinks: false,
      dataSources: ds,
      ...(editorPreview ? { contentLocale: { locale, defaultLocale: "en", chain: [locale, "en"], editorPreview: true } } : {}),
    }) as Parameters<typeof renderToStaticMarkup>[0],
  );
}

function liveCards(n: number): PostsFeedCard[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i + 1}`,
    path: `/blog/post-${i + 1}`,
    title: `Real post ${i + 1}`,
    excerpt: `Excerpt ${i + 1}`,
    date: "Oct 1, 2026",
    category: "Tips",
    imageUrl: `/img/${i + 1}.jpg`,
    imageAlt: `Cover ${i + 1}`,
    readingMinutes: 3,
    author: "Ana",
  }));
}

function ds(nodeId: string, data: PostsFeedNodeData, extra: BuilderNodeRenderDataSources = {}): BuilderNodeRenderDataSources {
  return { postsFeedByNodeId: { [nodeId]: data }, ...extra };
}

const count = (html: string, needle: string) => html.split(needle).length - 1;

// ── options ─────────────────────────────────────────────────────────────────

test("defaults: grid, latest, newest, 6 per page, no pagination, cover/category/date/excerpt/readMore on", () => {
  const o = normalizePostsFeedOptions({});
  assert.deepEqual(o, POSTS_FEED_DEFAULTS);
  assert.equal(o.layout, "grid");
  assert.equal(o.limit, 6);
  assert.equal(o.fields.cover, true);
  assert.equal(o.fields.readingTime, false);
  assert.equal(o.fields.author, false);
  assert.equal(o.fields.readMore, true);
  assert.equal(normalizePostsFeedOptions(null).layout, "grid");
});

test("validation: bad enums fall back, limit clamps 1..24, ids dedupe, stored tags ignored, minimal forces no cover", () => {
  const o = normalizePostsFeedOptions({
    layout: "carousel" as PostsFeedStyle,
    source: "random" as "latest",
    sort: "popular" as "newest",
    pagination: "infinite" as "none",
    limit: 99,
    columns: 7 as 3,
    postIds: ["a", "b", "a", "", "c"],
    tags: [" Care ", "care", "NAILS", ""],
    excludeIds: ["x", "x"],
    categoryId: "  ",
    demoTrade: "space" as "general",
  });
  assert.equal(o.layout, "grid");
  assert.equal(o.source, "latest");
  assert.equal(o.sort, "newest");
  assert.equal(o.pagination, "none");
  assert.equal(o.limit, 24);
  assert.equal(o.columns, 3);
  assert.deepEqual(o.postIds, ["a", "b", "c"]);
  assert.equal("tags" in o, false, "stored tags are ignored (v1.1)");
  assert.deepEqual(o.excludeIds, ["x"]);
  assert.equal(o.categoryId, null);
  assert.equal(o.demoTrade, "general");
  assert.equal(clampPostsFeedLimit(0), 1);
  assert.equal(clampPostsFeedLimit(-5), 1);
  assert.equal(clampPostsFeedLimit(7.9), 7);
  assert.equal(clampPostsFeedLimit(Number.NaN), 6);
  assert.equal(normalizePostsFeedOptions({ layout: "minimal", fields: { cover: true } }).fields.cover, false);
  assert.equal(normalizePostsFeedOptions({ fields: { author: true, date: false } }).fields.author, true);
  assert.equal(normalizePostsFeedOptions({ fields: { author: true, date: false } }).fields.date, false);
});

test("registry schema accepts every style and rejects an unknown one", () => {
  const schema = BUILDER_NODE_REGISTRY.posts_feed.propsSchema;
  for (const layout of POSTS_FEED_STYLES) assert.ok(schema.safeParse({ layout }).success, layout);
  assert.equal(schema.safeParse({ layout: "carousel" }).success, false);
  assert.equal(schema.safeParse({ limit: 25 }).success, false);
  assert.equal(schema.safeParse({ limit: 0 }).success, false);
  assert.ok(schema.safeParse({ source: "hand_picked", postIds: ["a", "b"], tags: ["x"], pagination: "numbered", columns: 4 }).success, "legacy stored data stays valid");
  assert.ok(schema.safeParse({ source: "category", categoryId: "c1" }).success);
});

test("pagination math: chunks, fetch limit", () => {
  assert.deepEqual(chunkPostsFeedPages([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.equal(postsFeedFetchLimit({ limit: 6, pagination: "none" }), 6);
  assert.equal(postsFeedFetchLimit({ limit: 6, pagination: "load_more" }), 24);
  assert.equal(postsFeedFetchLimit({ limit: 24, pagination: "load_more" }), 48, "capped");
});

// ── the 8 styles ────────────────────────────────────────────────────────────

const STYLE_EXPECTATIONS: Record<PostsFeedStyle, (html: string) => void> = {
  grid: (h) => {
    assert.match(h, /sb-pf--grid/);
    assert.match(h, /--pf-cols:3/);
  },
  slider: (h) => {
    assert.match(h, /sb-pf--slider/);
    assert.match(h, /sb-pf-list--slider/);
  },
  magazine: (h) => {
    assert.equal(count(h, "sb-pf-lead"), 1);
    assert.equal(count(h, "sb-pf-rest"), 3);
  },
  list: (h) => assert.match(h, /sb-pf--list/),
  minimal: (h) => {
    assert.doesNotMatch(h, /site-blog__media/, "minimal is text-only");
    assert.match(h, /site-blog__title/);
  },
  bento: (h) => {
    assert.equal(count(h, "sb-pf-big"), 1);
    assert.equal(count(h, "sb-pf-tall"), 1);
  },
  hero: (h) => {
    assert.equal(count(h, "sb-pf-lead"), 1);
    assert.match(h, /site-blog__media/);
  },
};

for (const layout of POSTS_FEED_STYLES) {
  test(`style ${layout}: renders its structure with live posts`, () => {
    const html = render([node({ layout, limit: 4, title: "Latest" })], ds("pf-1", { cards: liveCards(4), total: 4 }));
    assert.match(html, /data-builder-node-kind="posts_feed"/);
    assert.match(html, new RegExp(`data-posts-feed-layout="${layout}"`));
    assert.match(html, /<h2 class="sb-pf-title">Latest<\/h2>/);
    assert.equal(count(html, 'class="site-blog__item'), 4);
    assert.equal(count(html, "Real post"), 4);
    assert.match(html, /href="\/blog\/post-1"/);
    assert.doesNotMatch(html, /data-posts-feed-demo/);
    STYLE_EXPECTATIONS[layout](html);
  });
}

test("slider without a heading is a labelled region", () => {
  const html = render([node({ layout: "slider" })], ds("pf-1", { cards: liveCards(2), total: 2 }));
  assert.match(html, /aria-label="Posts"/);
});

test("item classes: lead for magazine/hero, big/tall slots for bento", () => {
  assert.equal(postsFeedItemClass("magazine", 0), "sb-pf-lead");
  assert.equal(postsFeedItemClass("hero", 2), "sb-pf-rest");
  assert.equal(postsFeedItemClass("bento", 6), "sb-pf-big");
  assert.equal(postsFeedItemClass("grid", 0), undefined);
});

test("CSS is token-only: no hex colours, no hard-coded font stacks, mobile-first media queries", () => {
  assert.doesNotMatch(POSTS_FEED_CSS, /#[0-9a-f]{3,8}\b/i);
  assert.doesNotMatch(POSTS_FEED_CSS, /font-family:[^;}]*(Georgia|Arial|Helvetica|serif\b|sans-serif)/i);
  assert.doesNotMatch(POSTS_FEED_CSS, /max-width:\s*\d+px\)/, "no desktop-first breakpoints");
  assert.match(POSTS_FEED_CSS, /scroll-snap-type:x mandatory/);
});

test("fields: toggles hide/show cover, date, excerpt, reading time, author, read more (stored tags ignored)", () => {
  const on = render(
    [node({ fields: { readingTime: true, author: true, tags: true, readMore: true } })],
    ds("pf-1", { cards: liveCards(1), total: 1 }),
  );
  assert.match(on, /3 min read/);
  assert.match(on, /By Ana/);
  assert.doesNotMatch(on, /site-blog__tag/, "tag chips are v1.1");
  assert.equal((normalizePostsFeedOptions({ fields: { tags: true } }).fields as Record<string, unknown>).tags, undefined);
  assert.match(on, /Read more/);
  const off = render(
    [node({ fields: { cover: false, date: false, excerpt: false, category: false, readMore: false } })],
    ds("pf-1", { cards: liveCards(1), total: 1 }),
  );
  assert.doesNotMatch(off, /site-blog__media/);
  assert.doesNotMatch(off, /Oct 1, 2026/);
  assert.doesNotMatch(off, /Excerpt 1/);
  assert.doesNotMatch(off, /site-blog__meta/);
  assert.doesNotMatch(off, /Read more/);
});

test("limit without pagination shows only one page", () => {
  const html = render([node({ limit: 2 })], ds("pf-1", { cards: liveCards(5), total: 5 }));
  assert.equal(count(html, 'class="site-blog__item'), 2);
  assert.doesNotMatch(html, /sb-pf-pager/);
});

test("load-more pre-renders the next pages hidden and mounts the pager", () => {
  const html = render([node({ limit: 2, pagination: "load_more" })], ds("pf-1", { cards: liveCards(5), total: 5 }));
  assert.equal(count(html, 'class="site-blog__item'), 5);
  assert.equal(count(html, " hidden=\"\""), 3);
  assert.match(html, /Show more posts/);
});

test("stored numbered pagination normalizes to load_more and renders the button", () => {
  assert.equal(normalizePostsFeedOptions({ pagination: "numbered" } as never).pagination, "load_more");
  const html = render([node({ limit: 2, pagination: "numbered" } as never)], ds("pf-1", { cards: liveCards(5), total: 5 }), false);
  assert.doesNotMatch(html, /href="\?page=2"/);
  assert.match(html, /Show more posts/);
});

test("exactly 7 styles; stored masonry normalizes to grid", () => {
  assert.deepEqual([...POSTS_FEED_STYLES], ["grid", "slider", "magazine", "list", "minimal", "bento", "hero"]);
  assert.equal(normalizePostsFeedOptions({ layout: "masonry" } as never).layout, "grid");
  const html = render([node({ layout: "masonry" } as never)], ds("pf-1", { cards: liveCards(2), total: 2 }));
  assert.match(html, /sb-pf--grid/);
  assert.doesNotMatch(html, /masonry/);
});

test("category source: needs carry categoryId only for source=category; stored tags never queried", () => {
  const needs = collectNativeDataBlockNeeds([
    node({ source: "category", categoryId: "c1", tags: ["x"] }, "a"),
    node({ source: "latest", categoryId: "c1" }, "b"),
  ]).postsFeeds;
  assert.equal(needs[0]!.query.categoryId, "c1");
  assert.equal("tags" in needs[0]!.query, false);
  assert.equal(needs[1]!.query.categoryId, null);
  assert.equal(normalizePostsFeedOptions({ source: "category", categoryId: " c1 " }).categoryId, "c1");
});

test("hrefs follow the site grammar: path prefix + non-default locale segment", () => {
  assert.equal(postsFeedHref("/blog/a", { locale: "en", defaultLocale: "en", pathPrefix: "" }), "/blog/a");
  assert.equal(postsFeedHref("/blog/a", { locale: "es", defaultLocale: "en", pathPrefix: "" }), "/es/blog/a");
  assert.equal(postsFeedHref("/blog/a", { locale: "en", defaultLocale: "en", pathPrefix: "/w/acme" }), "/w/acme/blog/a");
  assert.equal(postsFeedHref("#", { locale: "en", defaultLocale: "en", pathPrefix: "" }), "#");
});

// ── demo fallback ───────────────────────────────────────────────────────────

test("demo: 6 tasteful posts per trade, es + en, platform photos, no em dashes", () => {
  for (const trade of POSTS_FEED_DEMO_TRADES) {
    for (const locale of ["es", "en"]) {
      const cards = demoPostsFeedCards(trade, locale, 6);
      assert.equal(cards.length, 6);
      assert.equal(new Set(cards.map((c) => c.title)).size, 6, `${trade}/${locale} titles are distinct`);
      for (const c of cards) {
        assert.equal(c.demo, true);
        assert.equal(c.path, "#");
        assert.match(c.imageUrl ?? "", /^\/marketing\/photos\/[a-z-]+\.jpg$/);
        assert.doesNotMatch(`${c.title} ${c.excerpt} ${c.category}`, /—/);
      }
    }
  }
  assert.notEqual(demoPostsFeedCards("beauty", "es", 1)[0]!.title, demoPostsFeedCards("beauty", "en", 1)[0]!.title);
  assert.equal(postsFeedDemoTradeForFamily("dining"), "food");
  assert.equal(postsFeedDemoTradeForFamily("beauty"), "beauty");
  assert.equal(postsFeedDemoTradeForFamily(null), "general");
});

test("demo fallback only when empty: real posts always win", () => {
  const o = normalizePostsFeedOptions({ limit: 3 });
  const real = resolvePostsFeedCards({ live: { cards: liveCards(2), total: 2 }, options: o, allowDemo: true, locale: "en" });
  assert.equal(real.demo, false);
  assert.equal(real.cards.length, 2);
  const demo = resolvePostsFeedCards({ live: { cards: [], total: 0 }, options: o, allowDemo: true, locale: "en" });
  assert.equal(demo.demo, true);
  assert.equal(demo.cards.length, 3);
  const none = resolvePostsFeedCards({ live: undefined, options: o, allowDemo: false, locale: "en" });
  assert.deepEqual(none, { cards: [], total: 0, demo: false });
});

test("builder canvas with no posts shows example posts (es) labelled as examples", () => {
  const html = render([node({ demoTrade: "beauty", limit: 3 })], ds("pf-1", { cards: [], total: 0 }), true, "es");
  assert.match(html, /data-posts-feed-demo="1"/);
  assert.match(html, /Posts de ejemplo/);
  assert.equal(count(html, 'class="site-blog__item'), 3);
  assert.match(html, /\/marketing\/photos\//);
});

test("demo account (theme preview) with no posts shows example posts on the public render", () => {
  const html = render([node({ limit: 2 })], ds("pf-1", { cards: [], total: 0 }, { postsFeedDemo: true }));
  assert.match(html, /data-posts-feed-demo="1"/);
});

test("real published site with no posts renders nothing visible; empty message when set", () => {
  const hidden = render([node()], ds("pf-1", { cards: [], total: 0 }));
  assert.match(hidden, /hidden=""/);
  assert.doesNotMatch(hidden, /site-blog__item/);
  assert.doesNotMatch(hidden, /data-posts-feed-demo/);
  const msg = render([node({ emptyMessage: "Pronto, nuevos posts." })], ds("pf-1", { cards: [], total: 0 }));
  assert.match(msg, /Pronto, nuevos posts\./);
  assert.doesNotMatch(msg, /hidden=""/);
});

test("demo posts never leak when the site HAS posts, even in the builder", () => {
  const html = render([node()], ds("pf-1", { cards: liveCards(1), total: 1 }), true);
  assert.doesNotMatch(html, /data-posts-feed-demo/);
  assert.match(html, /Real post 1/);
});

// ── engine registration ─────────────────────────────────────────────────────

test("kind is a registered structural leaf, creatable and valid in a tree", () => {
  const entry = BUILDER_NODE_REGISTRY.posts_feed;
  assert.equal(entry.kind, "posts_feed");
  assert.equal(entry.children.type, "none");
  const created = createBuilderNode("posts_feed");
  assert.equal(created.kind, "posts_feed");
  const result = validateBuilderNodeTree([{ id: "root", kind: "container", props: { layout: "stack" }, children: [created] } as BuilderNode]);
  assert.ok(result.ok, JSON.stringify(result));
});

test("one gallery entry, listed by BOTH builders' policies (talent and agency)", () => {
  const entries = ADD_GALLERY_ITEMS.filter((i) => i.nativeKind === "posts_feed");
  assert.equal(entries.length, 1);
  for (const siteKind of ["agency", "talent", "business"] as const) {
    const visible = filterGalleryItemsForSiteKind(ADD_GALLERY_ITEMS, siteKind);
    assert.ok(visible.some((i) => i.nativeKind === "posts_feed"), siteKind);
  }
});

test("data needs: one per node, with its own query and fetch size", () => {
  const needs = collectNativeDataBlockNeeds([
    node({ source: "featured", limit: 3, pagination: "load_more" }, "a"),
    {
      id: "wrap",
      kind: "container",
      props: { layout: "stack" },
      children: [node({ source: "hand_picked", postIds: ["p2", "p1"] }, "b")],
    } as BuilderNode,
  ]).postsFeeds;
  assert.equal(needs.length, 2);
  assert.deepEqual(needs[0], {
    nodeId: "a",
    query: { source: "featured", postIds: [], categoryId: null, excludeIds: [], sort: "newest" },
    fetchLimit: 12,
  });
  assert.deepEqual(needs[1]!.query.postIds, ["p2", "p1"]);
  assert.equal(needs[1]!.fetchLimit, 6);
});
