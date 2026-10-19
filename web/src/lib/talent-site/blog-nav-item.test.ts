/** Talent-site nav: the Blog item appears only with posts, survives the header cap. */
import assert from "node:assert/strict";
import { test } from "node:test";

import { BLOG_NAV_SLUG, capNavKeepingReserved, withBlogNavItem } from "./blog-nav-item";
import { maxSitePageHref, type MaxSiteNavItem } from "./resolve-max-site-core";

const nav = (n: number): MaxSiteNavItem[] =>
  Array.from({ length: n }, (_, i) => ({ slug: `p${i}`, label: `P${i}`, isHome: i === 0 }));

test("no posts: nav unchanged; posts: Blog appended last; host-root href is /blog", () => {
  assert.deepEqual(withBlogNavItem(nav(2), false, "host-root"), nav(2));
  const out = withBlogNavItem(nav(2), true, "host-root");
  assert.equal(out.length, 3);
  const blog = out[2];
  assert.deepEqual([blog.slug, blog.label, blog.isHome], [BLOG_NAV_SLUG, "Blog", false]);
  assert.equal(maxSitePageHref("s", blog, "", "host-root"), "/blog");
});

test("path mode (platform /t/site routes) never gets the item: that route has no /blog", () => {
  assert.deepEqual(withBlogNavItem(nav(2), true, "path"), nav(2));
});

test("a talent page already called blog keeps its own item (no duplicate)", () => {
  const withPage = [...nav(2), { slug: "blog", label: "Mi blog", isHome: false }];
  assert.deepEqual(withBlogNavItem(withPage, true, "host-root"), withPage);
});

test("header cap keeps the reserved Blog item instead of cutting it", () => {
  const out = withBlogNavItem(nav(10), true, "host-root");
  const capped = capNavKeepingReserved(out, 8);
  assert.equal(capped.length, 8);
  assert.equal(capped[7].slug, "blog");
  assert.equal(capped[0].slug, "p0");
  assert.deepEqual(capNavKeepingReserved(nav(10), 8).map((i) => i.slug), nav(8).map((i) => i.slug));
});
