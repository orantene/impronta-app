/**
 * Posts v1 public read model + SEO (TUL-1009 / TUL-1010).
 * Run: NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' npx tsx --test src/lib/cms/posts-public.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  getPublicPostBySlug,
  listPublicPosts,
  listPublishedPostRows,
  resolvePostServices,
  resolvePostSlugRedirect,
  type PostScope,
  type PublicPostsDeps,
  type PublicPostsSource,
  type ScopedOfferingLoader,
} from "./posts-public";
import {
  AI_CRAWLER_USER_AGENTS,
  applyAiCrawlerToggle,
  blogCategoryPath,
  blogPostPath,
  buildLlmsTxt,
  buildPostJsonLd,
  legacyPostsPathToBlog,
  pickPostSlugRedirect,
  postSitemapEntries,
  postTranslationAlternates,
  toPublicPost,
  type BlogPostingJsonLd,
  type BreadcrumbListJsonLd,
  type PostRedirectRow,
  type PublicPostCategoryRow,
  type PublicPostRow,
} from "./posts-public-model";
import type { FaqPageJsonLd } from "./post-faq-jsonld";
import { buildRobots } from "@/lib/seo/robots-rules";

const NOW = new Date("2026-10-14T12:00:00Z");
const PAST = "2026-10-01T10:00:00Z";
const FUTURE = "2026-12-01T10:00:00Z";
const TENANT: PostScope = { kind: "tenant", tenantId: "11111111-1111-4111-8111-111111111111" };
const TALENT: PostScope = { kind: "talent", talentProfileId: "22222222-2222-4222-8222-222222222222" };

let seq = 0;
function row(over: Partial<PublicPostRow> = {}): PublicPostRow {
  seq += 1;
  const id = `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`;
  return {
    id,
    tenant_id: null,
    talent_profile_id: TALENT.kind === "talent" ? TALENT.talentProfileId : null,
    locale: "es",
    slug: `post-${seq}`,
    title: `Post ${seq}`,
    excerpt: "Resumen",
    body: "Cuerpo",
    body_blocks: null,
    status: "published",
    published_at: PAST,
    updated_at: PAST,
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

/** Typed in-memory source; scope is recorded so tests can assert it was passed through. */
class FakeSource implements PublicPostsSource {
  readonly seenScopes: PostScope[] = [];
  constructor(
    private readonly rows: PublicPostRow[],
    private readonly categories: PublicPostCategoryRow[] = [],
    private readonly redirects: PostRedirectRow[] = [],
  ) {}
  async listPublished(scope: PostScope, locale: string): Promise<PublicPostRow[]> {
    this.seenScopes.push(scope);
    // Mirrors the SQL: published + not taken down; the pure filter does the rest.
    return this.rows.filter((r) => r.locale === locale && r.status === "published" && !r.taken_down_at);
  }
  async findBySlug(scope: PostScope, locale: string, slug: string): Promise<PublicPostRow | null> {
    this.seenScopes.push(scope);
    return this.rows.find((r) => r.locale === locale && r.slug === slug) ?? null;
  }
  async listTranslationGroup(_scope: PostScope, rootId: string): Promise<PublicPostRow[]> {
    return this.rows.filter((r) => r.id === rootId || r.translation_of === rootId);
  }
  async findCategory(_scope: PostScope, locale: string, slug: string): Promise<PublicPostCategoryRow | null> {
    return this.categories.find((c) => c.locale === locale && c.slug === slug) ?? null;
  }
  async getCategory(_scope: PostScope, id: string): Promise<PublicPostCategoryRow | null> {
    return this.categories.find((c) => c.id === id) ?? null;
  }
  async listRedirects(_scope: PostScope, oldPaths: readonly string[]): Promise<PostRedirectRow[]> {
    return this.redirects.filter((r) => oldPaths.includes(r.old_path));
  }
}

function deps(source: PublicPostsSource): PublicPostsDeps {
  return { source, now: () => NOW };
}

// Fixture set: one of each visibility case.
const visible = row({ slug: "visible" });
const draft = row({ slug: "draft", status: "draft", published_at: null });
const unlisted = row({ slug: "oculto", is_unlisted: true });
const expired = row({ slug: "vencido", expires_at: PAST });
const takenDown = row({ slug: "retirado", taken_down_at: PAST });
const unpublished = row({ slug: "despublicado", status: "draft", published_at: PAST });
const futureDated = row({ slug: "futuro", published_at: FUTURE });
const noindexed = row({ slug: "sin-indice", noindex: true });
const ALL = [visible, draft, unlisted, expired, takenDown, unpublished, futureDated, noindexed];
const HIDDEN_SLUGS = ["draft", "oculto", "vencido", "retirado", "despublicado", "futuro"];

const urlFor = (path: string, locale: string) => `https://jor.example${locale === "es" ? "" : `/${locale}`}${path}`;

// ---- list ---------------------------------------------------------------------

test("listPublicPosts excludes drafts, unlisted, expired, taken-down, unpublished and future posts", async () => {
  const src = new FakeSource(ALL);
  const slugs = (await listPublicPosts(TALENT, "es", {}, deps(src))).map((p) => p.slug);
  assert.deepEqual(slugs.sort(), ["sin-indice", "visible"]);
  for (const hidden of HIDDEN_SLUGS) assert.ok(!slugs.includes(hidden), hidden);
  assert.deepEqual(src.seenScopes[0], TALENT);
});

test("listPublicPosts filters by category slug and honours limit", async () => {
  const cat: PublicPostCategoryRow = { id: "33333333-3333-4333-8333-333333333333", slug: "tips", name: "Tips", locale: "es" };
  const a = row({ slug: "a", category_id: cat.id, published_at: "2026-10-02T00:00:00Z" });
  const b = row({ slug: "b", category_id: cat.id, published_at: "2026-10-03T00:00:00Z" });
  const c = row({ slug: "c" });
  const hiddenInCat = row({ slug: "h", category_id: cat.id, is_unlisted: true });
  const src = new FakeSource([a, b, c, hiddenInCat], [cat]);
  const inCat = await listPublicPosts(TENANT, "es", { categorySlug: "tips" }, deps(src));
  assert.deepEqual(inCat.map((p) => p.slug), ["b", "a"]);
  assert.deepEqual((await listPublicPosts(TENANT, "es", { categorySlug: "tips", limit: 1 }, deps(src))).map((p) => p.slug), ["b"]);
  assert.deepEqual(await listPublicPosts(TENANT, "es", { categorySlug: "nope" }, deps(src)), []);
});

// ---- by slug --------------------------------------------------------------------

test("getPublicPostBySlug returns the state for every case", async () => {
  const src = new FakeSource(ALL);
  const d = deps(src);
  const state = async (slug: string) => (await getPublicPostBySlug(TALENT, "es", slug, d)).state;
  assert.equal(await state("visible"), "ok");
  assert.equal(await state("vencido"), "expired");
  assert.equal(await state("retirado"), "unavailable");
  assert.equal(await state("despublicado"), "unavailable");
  assert.equal(await state("draft"), "not_found");
  assert.equal(await state("futuro"), "not_found");
  assert.equal(await state("missing"), "not_found");

  const okUnlisted = await getPublicPostBySlug(TALENT, "es", "oculto", d);
  assert.equal(okUnlisted.state, "ok");
  assert.ok(okUnlisted.state === "ok" && okUnlisted.noindex, "unlisted resolves by link but is noindex");
  const okVisible = await getPublicPostBySlug(TALENT, "es", "VISIBLE ", d);
  assert.ok(okVisible.state === "ok" && !okVisible.noindex);
  const exp = await getPublicPostBySlug(TALENT, "es", "vencido", d);
  assert.ok(exp.state === "expired" && exp.noindex && exp.post.slug === "vencido");
});

// ---- sitemap + llms.txt ---------------------------------------------------------

test("sitemap lists only indexable posts (no hidden, expired, taken-down or noindex)", async () => {
  const src = new FakeSource(ALL);
  const rows = await listPublishedPostRows(TALENT, ["es"], deps(src));
  const urls = postSitemapEntries(rows, urlFor, NOW).map((e) => e.url);
  assert.deepEqual(urls, ["https://jor.example/blog/visible"]);
  // Even if a source leaked every row, the pure filter still drops them.
  const leaked = postSitemapEntries(ALL, urlFor, NOW).map((e) => e.url);
  assert.deepEqual(leaked, ["https://jor.example/blog/visible"]);
});

test("llms.txt lists only indexable posts", () => {
  const txt = buildLlmsTxt({ siteName: "Jor Beauty", summary: "Uñas en Cancún", homeUrl: "https://jor.example/", posts: ALL, urlFor, now: NOW });
  assert.match(txt, /^# Jor Beauty/);
  assert.match(txt, /\(https:\/\/jor\.example\/blog\/visible\)/);
  for (const hidden of [...HIDDEN_SLUGS, "sin-indice"]) assert.ok(!txt.includes(`/blog/${hidden}`), hidden);
});

test("sitemap names translations (translation_of) as hreflang alternates", () => {
  const es = row({ slug: "hola", locale: "es" });
  const en = row({ slug: "hello", locale: "en", translation_of: es.id });
  const entries = postSitemapEntries([es, en], urlFor, NOW);
  const esEntry = entries.find((e) => e.url.endsWith("/blog/hola"));
  assert.deepEqual(esEntry?.alternates?.languages, {
    es: "https://jor.example/blog/hola",
    en: "https://jor.example/en/blog/hello",
  });
  const alts = postTranslationAlternates(toPublicPost(en), [es, en], NOW);
  assert.deepEqual(alts.map((a) => a.locale).sort(), ["en", "es"]);
});

// ---- JSON-LD --------------------------------------------------------------------

test("JSON-LD: BlogPosting + BreadcrumbList carry the required schema.org fields; FAQPage from FAQ blocks", () => {
  const post = toPublicPost(
    row({
      slug: "faq-post",
      title: "Cuidado de uñas",
      body_blocks: [
        { id: "b1", type: "paragraph", text: "Hola" },
        { id: "b2", type: "faq", question: "¿Cuánto dura?", answer: "Tres semanas." },
        { id: "b3", type: "faq", question: "  ", answer: "" },
      ],
    }),
  );
  const url = "https://jor.example/blog/faq-post";
  const out = buildPostJsonLd({
    post,
    url,
    imageUrl: "https://jor.example/blog/faq-post/og",
    author: { name: "Jor", kind: "person" },
    siteName: "Jor Beauty",
    homeUrl: "https://jor.example/",
    blogLabel: "Blog",
    category: { name: "Tips", url: "https://jor.example/blog/c/tips" },
  });
  const blog = out.find((o): o is BlogPostingJsonLd => o["@type"] === "BlogPosting");
  const crumbs = out.find((o): o is BreadcrumbListJsonLd => o["@type"] === "BreadcrumbList");
  const faq = out.find((o): o is FaqPageJsonLd => o["@type"] === "FAQPage");
  assert.ok(blog && crumbs && faq);
  assert.equal(blog["@context"], "https://schema.org");
  assert.equal(blog.headline, "Cuidado de uñas");
  assert.ok(!Number.isNaN(Date.parse(blog.datePublished)));
  assert.ok(blog.author.name && blog.author["@type"] === "Person");
  assert.ok(blog.image.length > 0 && blog.image[0].startsWith("https://"));
  assert.deepEqual(blog.mainEntityOfPage, { "@type": "WebPage", "@id": url });
  assert.deepEqual(crumbs.itemListElement.map((i) => i.position), [1, 2, 3]);
  assert.equal(crumbs.itemListElement[2].item, url);
  for (const item of crumbs.itemListElement) assert.equal(item["@type"], "ListItem");
  assert.equal(faq.mainEntity.length, 1, "empty FAQ block outputs nothing");
  assert.equal(faq.mainEntity[0].acceptedAnswer.text, "Tres semanas.");

  const noFaq = buildPostJsonLd({
    post: toPublicPost(row()),
    url,
    imageUrl: "https://x/og",
    author: { name: "Agencia", kind: "organization" },
    siteName: "Agencia",
    homeUrl: "https://x/",
    blogLabel: "Blog",
  });
  assert.equal(noFaq.length, 2);
});

// ---- 301 mapping ------------------------------------------------------------------

test("/posts/* → /blog/* mapping keeps the locale prefix", () => {
  assert.equal(legacyPostsPathToBlog("/posts/hola"), "/blog/hola");
  assert.equal(legacyPostsPathToBlog("/en/posts/hello"), "/en/blog/hello");
  assert.equal(legacyPostsPathToBlog("/posts/hola/"), "/blog/hola");
  assert.equal(legacyPostsPathToBlog("/posts"), null);
  assert.equal(legacyPostsPathToBlog("/posts/a/b"), null);
  assert.equal(legacyPostsPathToBlog("/blog/hola"), null);
  assert.equal(blogPostPath("hola"), "/blog/hola");
  assert.equal(blogCategoryPath("tips"), "/blog/c/tips");
});

test("slug-change redirect: honours an active scoped cms_redirects row, ignores loops and inactive rows", async () => {
  const rows: PostRedirectRow[] = [
    { old_path: "/blog/viejo", new_path: "/blog/nuevo", status_code: 301, active: true },
    { old_path: "/blog/loop", new_path: "/blog/loop", status_code: 301, active: true },
    { old_path: "/blog/off", new_path: "/blog/x", status_code: 301, active: false },
  ];
  assert.equal(pickPostSlugRedirect(rows, "viejo"), "/blog/nuevo");
  assert.equal(pickPostSlugRedirect(rows, "loop"), null);
  assert.equal(pickPostSlugRedirect(rows, "off"), null);
  const src = new FakeSource([], [], rows);
  assert.equal(await resolvePostSlugRedirect(TENANT, "Viejo", deps(src)), "/blog/nuevo");
  assert.equal(await resolvePostSlugRedirect(TENANT, "otro", deps(src)), null);
});

// ---- Servicio prices ------------------------------------------------------------------

test("Servicio blocks resolve through the price source; a deleted/unpublished offering hides the block", async () => {
  const live = "44444444-4444-4444-8444-444444444444";
  const gone = "55555555-5555-4555-8555-555555555555";
  const loader: ScopedOfferingLoader = async (id) =>
    id === live ? { name: "Manicure", rows: [{ amountCents: 50000, currency: "MXN", priceType: "fixed", isFeatured: false }] } : null;
  const map = await resolvePostServices(
    [
      { id: "s1", type: "service", offering_id: live },
      { id: "s2", type: "service", offering_id: gone },
    ],
    "es",
    loader,
  );
  assert.equal(map[live]?.name, "Manicure");
  assert.ok((map[live]?.label ?? "").length > 0);
  assert.equal(map[gone], undefined);
});

// ---- robots AI toggle -------------------------------------------------------------------

test("robots: AI toggle OFF disallows the AI crawlers; ON leaves the policy untouched", () => {
  const base = new URL("https://jor.example");
  const on = applyAiCrawlerToggle(buildRobots("talent_site", base), true);
  assert.deepEqual(on, buildRobots("talent_site", base));
  const off = applyAiCrawlerToggle(buildRobots("talent_site", base), false);
  const rules = Array.isArray(off.rules) ? off.rules : [off.rules];
  const block = rules.find((r) => r.disallow === "/");
  assert.ok(block);
  assert.deepEqual(block.userAgent, [...AI_CRAWLER_USER_AGENTS]);
  for (const r of rules) {
    if (r === block) continue;
    const agents = Array.isArray(r.userAgent) ? r.userAgent : [r.userAgent ?? ""];
    for (const a of AI_CRAWLER_USER_AGENTS) assert.ok(!agents.includes(a), `${a} still allowed`);
  }
});
