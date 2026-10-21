import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { buildPlatformBlogSite, platformBlogTenantId } from "./platform-blog";

const read = (rel: string) => readFileSync(join(process.cwd(), "src", rel), "utf8");
const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";

test("TUL-1399: the product blog is off unless a valid workspace id is configured", () => {
  assert.equal(platformBlogTenantId({}), null);
  assert.equal(platformBlogTenantId({ PLATFORM_BLOG_TENANT_ID: "  " }), null);
  assert.equal(platformBlogTenantId({ PLATFORM_BLOG_TENANT_ID: "not-a-uuid" }), null);
  assert.equal(platformBlogTenantId({ PLATFORM_BLOG_TENANT_ID: ` ${ID.toUpperCase()} ` }), ID);
});

test("TUL-1399: the site context is the platform workspace, on the marketing origin, EN + ES", () => {
  const site = buildPlatformBlogSite(ID);
  assert.deepEqual(site.scope, { kind: "tenant", tenantId: ID });
  assert.match(site.origin, /^https:\/\/[^/]+$/);
  assert.equal(site.pathPrefix, "");
  assert.equal(site.defaultLocale, "en");
  assert.deepEqual([...site.supportedLocales], ["en", "es"]);
  assert.equal(site.authorKind, "organization");
  assert.ok(site.siteName.length > 0);
});

test("TUL-1399: the post routes fall back to the platform blog and keep the marketing chrome", () => {
  const slug = read("app/(public)/blog/[slug]/page.tsx");
  const cat = read("app/(public)/blog/c/[category]/page.tsx");
  const og = read("app/(public)/blog/[slug]/og/route.tsx");
  for (const src of [slug, cat, og]) {
    assert.match(src, /resolveBlogSite\(\)/);
    assert.doesNotMatch(src, /resolveWorkspacePostSite\(\)/);
  }
  for (const src of [slug, cat]) assert.match(src, /PlatformBlogFrame/);
  const helper = read("lib/cms/platform-blog-site.ts");
  assert.match(helper, /ctx\.kind === "marketing"/);
  assert.match(helper, /\(await resolveWorkspacePostSite\(\)\) \?\? \(await resolvePlatformBlogSite\(\)\)/);
});

test("TUL-1399: the index 404s when the blog is not configured, and is reachable on marketing hosts", () => {
  const index = read("app/(marketing)/blog/page.tsx");
  assert.match(index, /if \(!site\) notFound\(\)/);
  assert.match(index, /resolvePlatformBlogSite\(\)/);
  const groups = read("lib/saas/path-groups.ts");
  const marketing = groups.slice(groups.indexOf("export const MARKETING_PAGE_PREFIXES"));
  assert.match(marketing.slice(0, marketing.indexOf("] as const")), /"\/blog",/);
});

test("TUL-1399: the sitemap lists product posts only when configured", () => {
  const sitemap = read("app/sitemap.ts");
  assert.match(sitemap, /const blogSite = blogTenantId \? buildPlatformBlogSite\(blogTenantId\) : null/);
  assert.match(sitemap, /\.\.\.platformTalentEntries, \.\.\.blogEntries\]/);
});

test("TUL-1399: copy has ES and EN and no em dashes", () => {
  const index = read("app/(marketing)/blog/page.tsx");
  assert.match(index, /Blog de Tulala/);
  assert.match(index, /Tulala blog/);
  for (const rel of ["app/(marketing)/blog/page.tsx", "components/marketing/platform-blog-frame.tsx", "lib/cms/platform-blog.ts"]) {
    assert.ok(!read(rel).includes("—"), rel);
  }
});
