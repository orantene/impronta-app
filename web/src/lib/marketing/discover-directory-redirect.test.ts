/**
 * TUL-518 S2: /discover → /directory keeps the request locale (en + es).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { discoverDirectoryRedirectPath } from "./discover-directory-redirect";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

test("discover redirects to /directory for English and /es/directory for Spanish", () => {
  assert.equal(discoverDirectoryRedirectPath("en"), "/directory");
  assert.equal(discoverDirectoryRedirectPath("es"), "/es/directory");
  assert.equal(discoverDirectoryRedirectPath("es-MX"), "/es/directory");
});

test("the marketing discover page permanentRedirects through the helper", () => {
  const page = read("src/app/(marketing)/discover/page.tsx");
  assert.match(page, /permanentRedirect/);
  assert.match(page, /discoverDirectoryRedirectPath\(locale\)/);
  assert.match(page, /getRequestLocale/);
});

test("marketing hosts allow /discover so the redirect page is reachable", () => {
  const groups = read("src/lib/saas/path-groups.ts");
  assert.match(groups, /"\/discover"/);
  const reserved = read("src/lib/saas/reserved-slugs.ts");
  assert.match(reserved, /"discover"/);
});
