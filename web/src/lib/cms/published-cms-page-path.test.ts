import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { publishedCmsPagePath } from "./clean-urls";

const none = () => false;

test("item 9: a plain page slug is published at the clean URL, not /p/<slug>", () => {
  assert.equal(publishedCmsPagePath("about", none), "/about");
  assert.equal(publishedCmsPagePath("services/photography", none), "/services/photography");
});

test("item 9: a slug that collides with a platform route, or is not a plain slug, keeps /p/", () => {
  assert.equal(publishedCmsPagePath("directory", (p) => p === "/directory"), "/p/directory");
  assert.equal(publishedCmsPagePath("__site_shell__", none), "/p/__site_shell__");
});

test("item 9: the sitemap and the page canonical both use the clean path", () => {
  const root = join(process.cwd(), "src");
  const sitemap = readFileSync(join(root, "app/sitemap.ts"), "utf8");
  assert.doesNotMatch(sitemap, /pathnameWithoutLocale: `\$\{pathPrefix\}\/\$\{row\.slug\}`/);
  assert.match(sitemap, /publishedCmsPagePath\(row\.slug,/);
  const page = readFileSync(join(root, "app/(public)/p/[[...slug]]/page.tsx"), "utf8");
  assert.doesNotMatch(page, /const pathWithoutLocale = `\/p\/\$\{slugPath\}`/);
  assert.match(page, /publishedCmsPagePath\(slugPath,/);
});
