/**
 * Posts v1 builder (TUL-1008): the live "Últimos posts" list, blog_index card
 * resolution (live vs legacy manual vs demo), the post layout model/store, the
 * layout data resolver + fallback, and the page-tree POSTS group model.
 * Run: NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' npx tsx --test src/lib/cms/posts-latest.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { buildPostsTreeModel, postsTreeCopy, type TreePostInput } from "@/components/posts/tree/posts-tree-model";
import { demoBlogCards, effectiveBlogIndexSource, resolveBlogIndexCards, type BlogCard } from "./blog-index-cards";
import type { PostAuthorSource } from "./post-author";
import { loadPostAuthor } from "./post-author";
import { demoPreviewPost, resolvePostLayoutData, resolvePreviewPost } from "./post-layout-data";
import {
  addPostLayoutSection,
  defaultPostLayout,
  movePostLayoutSection,
  parsePostLayout,
  removePostLayoutSection,
  setMorePostsLimit,
  toPostLayoutEnvelope,
  type PostLayoutEnvelope,
} from "./post-layout";
import { ensurePostLayout, loadPostLayout, savePostLayout, type PostLayoutStore } from "./post-layout-store";
import { loadLatestPostCards } from "./posts-latest";
import type { PostScope, PublicPostsDeps, PublicPostsSource } from "./posts-public";
import type { PostRedirectRow, PublicPostCategoryRow, PublicPostRow } from "./posts-public-model";

const NOW = new Date("2026-10-14T12:00:00Z");
const TENANT: PostScope = { kind: "tenant", tenantId: "11111111-1111-4111-8111-111111111111" };
const TALENT: PostScope = { kind: "talent", talentProfileId: "22222222-2222-4222-8222-222222222222" };
const CAT: PublicPostCategoryRow = { id: "33333333-3333-4333-8333-333333333333", slug: "tips", name: "Tips", locale: "es" };

let seq = 0;
function row(over: Partial<PublicPostRow> = {}): PublicPostRow {
  seq += 1;
  return {
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    tenant_id: null,
    talent_profile_id: null,
    locale: "es",
    slug: `post-${seq}`,
    title: `Post ${seq}`,
    excerpt: "Resumen",
    body: "Cuerpo",
    body_blocks: null,
    status: "published",
    published_at: `2026-10-0${Math.min(9, seq)}T10:00:00Z`,
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

class FakeSource implements PublicPostsSource {
  readonly scopes: PostScope[] = [];
  constructor(private readonly rows: PublicPostRow[], private readonly cats: PublicPostCategoryRow[] = []) {}
  async listPublished(scope: PostScope, locale: string): Promise<PublicPostRow[]> {
    this.scopes.push(scope);
    return this.rows.filter((r) => r.locale === locale && r.status === "published" && !r.taken_down_at);
  }
  async findBySlug(): Promise<PublicPostRow | null> {
    return null;
  }
  async listTranslationGroup(): Promise<PublicPostRow[]> {
    return [];
  }
  async findCategory(_s: PostScope, locale: string, slug: string): Promise<PublicPostCategoryRow | null> {
    return this.cats.find((c) => c.locale === locale && c.slug === slug) ?? null;
  }
  async getCategory(_s: PostScope, id: string): Promise<PublicPostCategoryRow | null> {
    return this.cats.find((c) => c.id === id) ?? null;
  }
  async listRedirects(): Promise<PostRedirectRow[]> {
    return [];
  }
}
const deps = (source: PublicPostsSource): PublicPostsDeps => ({ source, now: () => NOW });
const hrefFor = (slug: string) => `/blog/${slug}`;

// ---- 1. blog_index live list -------------------------------------------------------

test("live cards: listable posts only, newest first, limited, with scope passed through", async () => {
  const a = row({ slug: "a", published_at: "2026-10-01T10:00:00Z", category_id: CAT.id, cover_image_url: "https://x/y.jpg" });
  const b = row({ slug: "b", published_at: "2026-10-03T10:00:00Z" });
  const c = row({ slug: "c", published_at: "2026-10-02T10:00:00Z" });
  const hidden = [
    row({ slug: "draft", status: "draft" }),
    row({ slug: "oculto", is_unlisted: true }),
    row({ slug: "vencido", expires_at: "2026-10-01T00:00:00Z" }),
    row({ slug: "retirado", taken_down_at: "2026-10-01T00:00:00Z" }),
  ];
  const source = new FakeSource([a, b, c, ...hidden], [CAT]);
  const cards = await loadLatestPostCards({ scope: TALENT, locale: "es", limit: 2, hrefFor, deps: deps(source) });
  assert.deepEqual(cards.map((x) => x.href), ["/blog/b", "/blog/c"]);
  assert.ok(source.scopes.every((s) => s === TALENT));
  const all = await loadLatestPostCards({ scope: TENANT, locale: "es", limit: 10, hrefFor, deps: deps(source) });
  assert.deepEqual(all.map((x) => x.href), ["/blog/b", "/blog/c", "/blog/a"]);
  const withCover = all.find((x) => x.href === "/blog/a");
  assert.equal(withCover?.category, "Tips");
  assert.equal(withCover?.imageUrl, "https://x/y.jpg");
});

test("live cards: category filter, unknown category is empty, other locale excluded, exclude current post", async () => {
  const inCat = row({ slug: "in", category_id: CAT.id });
  const out = row({ slug: "out" });
  const en = row({ slug: "en", locale: "en", category_id: CAT.id });
  const source = new FakeSource([inCat, out, en], [CAT]);
  const filtered = await loadLatestPostCards({ scope: TENANT, locale: "es", limit: 5, categorySlug: "tips", hrefFor, deps: deps(source) });
  assert.deepEqual(filtered.map((x) => x.href), ["/blog/in"]);
  assert.deepEqual(await loadLatestPostCards({ scope: TENANT, locale: "es", limit: 5, categorySlug: "nope", hrefFor, deps: deps(source) }), []);
  const more = await loadLatestPostCards({ scope: TENANT, locale: "es", limit: 1, excludePostId: inCat.id, hrefFor, deps: deps(source) });
  assert.deepEqual(more.map((x) => x.href), ["/blog/out"]);
});

test("live cards: no deps (service role missing) is an empty list, never a throw", async () => {
  assert.deepEqual(await loadLatestPostCards({ scope: TENANT, locale: "es", limit: 3, hrefFor, deps: null }), []);
});

const manual: BlogCard[] = [{ title: "Manual", href: "/m" }];
const liveCards: BlogCard[] = [{ title: "Real", href: "/blog/real" }];

test("blog_index source: legacy manual props keep working; new sections are live", () => {
  assert.equal(effectiveBlogIndexSource({ posts: manual }), "manual");
  assert.equal(effectiveBlogIndexSource({}), "live");
  assert.equal(effectiveBlogIndexSource({ posts: manual, source: "live" }), "live");
  const legacy = resolveBlogIndexCards({ props: { posts: manual }, live: liveCards, limit: 3, preview: false, locale: "es" });
  assert.deepEqual(legacy, manual);
  const live = resolveBlogIndexCards({ props: { source: "live" }, live: liveCards, limit: 3, preview: false, locale: "es" });
  assert.deepEqual(live, liveCards);
});

test("blog_index empty state: demo cards in the builder, nothing on the public site", () => {
  const builder = resolveBlogIndexCards({ props: { source: "live" }, live: [], limit: 3, preview: true, locale: "es" });
  assert.equal(builder.length, 3);
  assert.ok(builder.every((c) => c.href === "#"));
  assert.deepEqual(resolveBlogIndexCards({ props: { source: "live" }, live: [], limit: 3, preview: false, locale: "es" }), []);
  assert.equal(demoBlogCards("en", 2).length, 2);
  assert.notEqual(demoBlogCards("es", 1)[0]?.title, demoBlogCards("en", 1)[0]?.title);
});

// ---- 4. post layout --------------------------------------------------------------

class FakeLayoutStore implements PostLayoutStore {
  pages = new Map<string, { id: string; blocks: unknown }>();
  talent = new Map<string, unknown>();
  inserts = 0;
  updates = 0;
  /** Simulate losing a create race: insert reports "exists" and the winner appears. */
  raceOnInsert = false;
  async findWorkspaceLayout(tenantId: string, locale: string) {
    return this.pages.get(`${tenantId}:${locale}`) ?? null;
  }
  async insertWorkspaceLayout(tenantId: string, locale: string, envelope: PostLayoutEnvelope) {
    this.inserts += 1;
    const key = `${tenantId}:${locale}`;
    if (this.raceOnInsert || this.pages.has(key)) {
      this.pages.set(key, this.pages.get(key) ?? { id: "winner", blocks: envelope });
      return null;
    }
    const created = { id: `page-${this.inserts}`, blocks: envelope };
    this.pages.set(key, created);
    return created;
  }
  async updateWorkspaceLayout(tenantId: string, id: string, envelope: PostLayoutEnvelope) {
    this.updates += 1;
    for (const [k, v] of this.pages) if (k.startsWith(tenantId) && v.id === id) this.pages.set(k, { id, blocks: envelope });
    return true;
  }
  async readTalentLayout(talentProfileId: string) {
    return this.talent.get(talentProfileId) ?? null;
  }
  async writeTalentLayout(talentProfileId: string, envelope: PostLayoutEnvelope) {
    this.talent.set(talentProfileId, envelope);
    return true;
  }
}

test("default layout: content, author, more posts (localized heading) and it round-trips the parser", () => {
  const es = defaultPostLayout("es");
  assert.deepEqual(es.map((s) => s.type), ["post_content", "post_author", "blog_index"]);
  const more = es[2];
  assert.equal(more?.type === "blog_index" ? more.heading : null, "Más posts");
  assert.deepEqual(parsePostLayout(toPostLayoutEnvelope(es)), es);
  assert.equal(parsePostLayout(null), null);
  assert.equal(parsePostLayout({ kind: "post_layout", v: 1, sections: [{ id: "a", type: "post_author" }] }), null, "no post_content => fallback");
  assert.equal(parsePostLayout({ kind: "post_layout", v: 2, sections: [] }), null);
  assert.equal(
    parsePostLayout({ kind: "post_layout", v: 1, sections: [{ id: "x", type: "post_content" }, { id: "x", type: "post_author" }] }),
    null,
    "duplicate ids rejected",
  );
});

test("post_layout creation is idempotent per tenant + locale (workspace)", async () => {
  const store = new FakeLayoutStore();
  const first = await ensurePostLayout(store, TENANT, "es");
  assert.equal(first?.created, true);
  assert.ok(first?.pageId);
  const again = await ensurePostLayout(store, TENANT, "es");
  assert.equal(again?.created, false);
  assert.equal(again?.pageId, first?.pageId);
  assert.equal(store.inserts, 1, "second call must not insert");
  const other = await ensurePostLayout(store, TENANT, "en");
  assert.equal(other?.created, true, "a different language gets its own layout");
  assert.equal(store.inserts, 2);
});

test("post_layout creation survives a create race and repairs an unreadable row", async () => {
  const racing = new FakeLayoutStore();
  racing.raceOnInsert = true;
  const r = await ensurePostLayout(racing, TENANT, "es");
  assert.equal(r?.pageId, "winner");
  assert.equal(r?.created, false);

  const broken = new FakeLayoutStore();
  broken.pages.set(`${TENANT.kind === "tenant" ? TENANT.tenantId : ""}:es`, { id: "p1", blocks: { nope: true } });
  const repaired = await ensurePostLayout(broken, TENANT, "es");
  assert.equal(repaired?.created, true);
  assert.equal(repaired?.pageId, "p1");
  assert.equal(broken.inserts, 0);
  assert.equal(broken.updates, 1);
});

test("post_layout for a talent site lives in the site snapshot column, created once", async () => {
  const store = new FakeLayoutStore();
  const first = await ensurePostLayout(store, TALENT, "es");
  assert.equal(first?.created, true);
  assert.equal(first?.pageId, null);
  const second = await ensurePostLayout(store, TALENT, "es");
  assert.equal(second?.created, false);
  assert.equal(store.talent.size, 1);
  assert.equal(store.inserts, 0, "talent sites never touch cms_pages");
});

test("layout fallback: no layout (or an unreadable one) loads as null so the page renders directly", async () => {
  const store = new FakeLayoutStore();
  assert.equal(await loadPostLayout(store, TENANT, "es"), null);
  assert.equal(await loadPostLayout(store, TALENT, "es"), null);
  store.talent.set(TALENT.kind === "talent" ? TALENT.talentProfileId : "", { garbage: 1 });
  assert.equal(await loadPostLayout(store, TALENT, "es"), null);
  assert.equal(store.inserts, 0, "the public read never creates");
  await ensurePostLayout(store, TENANT, "es");
  const loaded = await loadPostLayout(store, TENANT, "es");
  assert.equal(loaded?.length, 3);
});

test("editing the layout changes what every post page loads", async () => {
  const store = new FakeLayoutStore();
  await ensurePostLayout(store, TENANT, "es");
  const before = (await loadPostLayout(store, TENANT, "es")) ?? [];
  const edited = movePostLayoutSection(removePostLayoutSection(before, "author"), "more", -1);
  assert.equal(await savePostLayout(store, TENANT, "es", edited), true);
  const after = await loadPostLayout(store, TENANT, "es");
  assert.deepEqual(after?.map((s) => s.type), ["blog_index", "post_content"]);
  assert.equal(await savePostLayout(store, TENANT, "es", [{ id: "a", type: "post_author" }]), false, "invalid layouts are never stored");
});

test("layout ops: content cannot be removed, author is unique, limit is clamped", () => {
  const base = defaultPostLayout("en");
  assert.equal(removePostLayoutSection(base, "content").length, 3);
  assert.equal(addPostLayoutSection(base, "post_author", "en").length, 3);
  const added = addPostLayoutSection(base, "blog_index", "en");
  assert.equal(added.length, 4);
  assert.equal(new Set(added.map((s) => s.id)).size, 4);
  const limited = setMorePostsLimit(base, "more", 99);
  assert.equal(limited[2]?.type === "blog_index" ? limited[2].limit : 0, 12);
  assert.deepEqual(movePostLayoutSection(base, "content", -1).map((s) => s.id), base.map((s) => s.id));
});

// ---- layout data (what each section renders) ----------------------------------------

class FakeAuthorSource implements PostAuthorSource {
  async authorProfileIdOfPost(_s: PostScope, postId: string) {
    return postId === "no-author" ? null : "profile-1";
  }
  async profile() {
    return { displayName: "Ana Lopez", avatarUrl: "https://x/a.png" };
  }
  async talent() {
    return { displayName: "  ", shortBio: "Fotografa de bodas" };
  }
}

test("Autor widget data: name, avatar and short bio; nothing when no name is known", async () => {
  const author = await loadPostAuthor(new FakeAuthorSource(), TALENT, "post-1");
  assert.deepEqual(author, { name: "Ana Lopez", avatarUrl: "https://x/a.png", bio: "Fotografa de bodas" });
  const empty: PostAuthorSource = {
    authorProfileIdOfPost: async () => null,
    profile: async () => null,
    talent: async () => null,
  };
  assert.equal(await loadPostAuthor(empty, TENANT, "post-1"), null);
});

test("layout data: resolves each section for one post and excludes the post from 'más posts'", async () => {
  const current = row({ slug: "actual" });
  const other = row({ slug: "otro" });
  const resolved = await resolvePostLayoutData({
    sections: defaultPostLayout("es"),
    scope: TALENT,
    locale: "es",
    postId: current.id,
    hrefFor,
    authorSource: new FakeAuthorSource(),
    deps: deps(new FakeSource([current, other])),
  });
  assert.deepEqual(resolved.map((s) => s.type), ["post_content", "post_author", "blog_index"]);
  const more = resolved[2];
  assert.deepEqual(more?.type === "blog_index" ? more.cards.map((c) => c.href) : null, ["/blog/otro"]);
  const author = resolved[1];
  assert.equal(author?.type === "post_author" ? author.author?.name : null, "Ana Lopez");
});

test("layout data: a failing source degrades the section, never the page", async () => {
  const boom: PostAuthorSource = {
    authorProfileIdOfPost: async () => {
      throw new Error("db down");
    },
    profile: async () => null,
    talent: async () => null,
  };
  const resolved = await resolvePostLayoutData({
    sections: defaultPostLayout("en"),
    scope: TENANT,
    locale: "en",
    postId: "p",
    hrefFor,
    authorSource: boom,
    deps: null,
  });
  const author = resolved[1];
  assert.equal(author?.type === "post_author" ? author.author : "x", null);
  const more = resolved[2];
  assert.deepEqual(more?.type === "blog_index" ? more.cards : "x", []);
});

// ---- 2. Post content preview in the builder ---------------------------------------

test("builder preview: latest post when one exists, demo text otherwise", async () => {
  const older = row({ slug: "viejo", published_at: "2026-10-01T10:00:00Z" });
  const newer = row({ slug: "nuevo", published_at: "2026-10-05T10:00:00Z" });
  const real = await resolvePreviewPost(TENANT, "es", deps(new FakeSource([older, newer])));
  assert.equal(real.isDemo, false);
  assert.equal(real.post.slug, "nuevo");
  const demo = await resolvePreviewPost(TENANT, "es", deps(new FakeSource([])));
  assert.equal(demo.isDemo, true);
  assert.equal(demo.post.title, demoPreviewPost("es").title);
  assert.notEqual(demoPreviewPost("en").title, demoPreviewPost("es").title);
});

// ---- 5. page tree POSTS group -----------------------------------------------------

test("page tree POSTS group: latest five by last edit, status badges, view-all", () => {
  const copy = postsTreeCopy("es");
  const mk = (i: number, over: Partial<TreePostInput> = {}): TreePostInput => ({
    id: `p${i}`,
    title: `T${i}`,
    status: "published",
    isUnlisted: false,
    scheduledPublishAt: null,
    updatedAt: `2026-10-0${i}T10:00:00Z`,
    ...over,
  });
  const model = buildPostsTreeModel(
    [mk(1), mk(2, { status: "draft" }), mk(3), mk(4, { isUnlisted: true }), mk(5), mk(6), mk(7, { title: "Sin título", status: "draft", scheduledPublishAt: "2026-11-01T00:00:00Z" })],
    copy,
  );
  assert.equal(model.rows.length, 5);
  assert.deepEqual(model.rows.map((r) => r.id), ["p7", "p6", "p5", "p4", "p3"]);
  assert.equal(model.rows[0]?.title, "Sin título");
  assert.equal(model.rows[0]?.badge, "Programado");
  assert.equal(model.rows[3]?.badge, "Oculto");
  assert.equal(model.rows[2]?.badge, null);
  assert.equal(model.showViewAll, true);
  const none = buildPostsTreeModel([], copy);
  assert.deepEqual([none.empty, none.showViewAll, none.rows.length], [true, false, 0]);
  assert.equal(postsTreeCopy("en").design, "Post design");
  assert.equal(copy.design, "Diseño de posts");
});
