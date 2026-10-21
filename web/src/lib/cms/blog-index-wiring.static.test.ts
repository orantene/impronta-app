/** F7 wiring: the index routes exist, the nav + sitemap hooks are in place, the nav lookup is cached. */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const src = (rel: string) => readFileSync(join(process.cwd(), "src", rel), "utf8");

test("both site families have a /blog index route using the shared view", () => {
  for (const rel of ["app/%5Ftalent-site/blog/page.tsx", "app/(public)/p/blog/page.tsx"]) {
    assert.ok(existsSync(join(process.cwd(), "src", rel)), rel);
    const s = src(rel);
    assert.match(s, /BlogIndexView/);
    assert.match(s, /parseBlogIndexPage\(sp\.page\)/);
    assert.match(s, /outOfRange\) notFound\(\)/);
  }
});

test("a CMS page / personal-site page slugged blog still wins over the index", () => {
  assert.match(src("app/(public)/p/blog/page.tsx"), /workspaceHasCmsBlogPage/);
  assert.match(src("app/%5Ftalent-site/blog/page.tsx"), /talentHasBlogPage/);
});

test("nav lookup is cached and tiny (no per-view query)", () => {
  const s = src("lib/cms/blog-nav.ts");
  assert.match(s, /unstable_cache/);
  assert.match(s, /revalidate: 300/);
  assert.match(s, /\.limit\(50\)/);
  assert.match(s, /const \{ data, error \}/);
});

test("talent nav and workspace nav both go through the Blog helpers", () => {
  assert.match(src("lib/talent-site/server/render-max-site.tsx"), /withBlogNavItem\(buildMaxSiteNav\(navSource\), await pBlogNav, hrefMode\)/);
  assert.match(src("lib/talent-site/resolve-max-site-core.ts"), /capNavKeepingReserved\(nav, SITE_HEADER_MAX_NAV_ITEMS\)/);
  assert.match(src("lib/cms/public-navigation.ts"), /withBlogHeaderLink\(links, hasPosts,/);
  assert.match(src("lib/cms/public-navigation.ts"), /href: resolvePublicCmsNavHref\(r\.href, locale, settings\)/);
});

test("sitemap adds the index through the new module (talent host + workspace + Tulala product blog)", () => {
  const s = src("app/sitemap.ts");
  // Three callers: talent host, workspace, and the marketing-host product blog (TUL-1399).
  assert.equal((s.match(/blogIndexSitemapEntries\(/g) ?? []).length, 3);
  assert.match(s, /from "@\/lib\/seo\/blog-index-sitemap-entries"/);
});
