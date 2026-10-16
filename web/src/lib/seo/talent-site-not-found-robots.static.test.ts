import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const src = readFileSync(join(process.cwd(), "src/app/%5Ftalent-site/not-found.tsx"), "utf8");
const page = readFileSync(join(process.cwd(), "src/app/%5Ftalent-site/[[...pageSlug]]/page.tsx"), "utf8");

test("TUL-857: talent-site 404 has the branded document title and no second robots tag", () => {
  assert.match(src, /export async function generateMetadata\(\): Promise<Metadata>/);
  assert.match(src, /title: \{ absolute: copy\.documentTitle \}/);
  assert.doesNotMatch(src, /robots:/);
});

test("TUL-857: /privacy is a real 308 before the Suspense boundary (verdict helper)", () => {
  const block = page.slice(page.indexOf("needsRouteLookup(seg, preview)"), page.indexOf("<Suspense fallback"));
  assert.match(block, /verdict === "privacy-redirect"\) permanentRedirect/);
  assert.match(block, /loadMaxSitePages\(talentProfileId\)/);
});
