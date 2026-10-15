import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("src/app/(public)/p/[[...slug]]/page.tsx", "utf8");
const server = readFileSync("src/lib/site-admin/server/public-page-fallback.server.ts", "utf8");

test("TUL-867: freeform reads use the widened lookup locales, not only the design order", () => {
  assert.equal((page.match(/\.in\("locale", lookupLocales\)/g) ?? []).length, 2);
  assert.match(page, /fallbackLookupOrder\(\s*designPlan\.lookupOrder/);
});

test("TUL-867: the redirect builder is locale-first via missingPageRedirectPath", () => {
  assert.match(server, /missingPageRedirectPath\(/);
  assert.doesNotMatch(server, /pathPrefix \?\? ""\}\$\{withLocalePath/);
});

test("TUL-697: metadata resolves with the body's alias/locale logic", () => {
  assert.match(page, /pickMetaRow\(/);
  assert.match(page, /inPlaceSlugs\(slugPath\)\);\n\n  const publishedRows/);
  assert.match(page, /assemblePageMetadata\(/);
});
