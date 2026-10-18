import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const dir = join(process.cwd(), "src/app/(workspace)/talent/page-builder");

test("TUL-748: the builder route has its own loading skeleton, in the request locale", () => {
  const loading = readFileSync(join(dir, "loading.tsx"), "utf8");
  assert.match(loading, /data-testid="page-builder-route-loading"/);
  assert.match(loading, /getRequestLocale/);
  assert.match(loading, /editorT\("Loading your page…", locale\)/);
});

test("TUL-748: pages / editor row / revision reads start before the site probe resolves", () => {
  const src = readFileSync(join(dir, "page.tsx"), "utf8");
  const specStart = src.indexOf("const specPromise = admin");
  const batch1 = src.indexOf("const [locale, talentLocale, tenantId, siteExists, siteUrl]");
  const join_ = src.indexOf("await specPromise");
  assert.ok(specStart > 0 && specStart < batch1 && batch1 < join_);
});
