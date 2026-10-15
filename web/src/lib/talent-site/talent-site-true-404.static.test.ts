import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = join(process.cwd(), "src/app/%5Ftalent-site");
const page = readFileSync(join(root, "[[...pageSlug]]/page.tsx"), "utf8");

test("TUL-857: the talent host route has no loading.tsx (it locked unknown paths at HTTP 200)", () => {
  assert.equal(existsSync(join(root, "loading.tsx")), false);
});

test("TUL-857: unknown first segments 404 before the Suspense boundary, only when no page/policy/service can match", () => {
  const pre = page.indexOf("notFound();\n  }\n  return (\n    <Suspense");
  assert.ok(pre > 0, "pre-check must sit right before the Suspense return");
  const block = page.slice(page.indexOf("TUL-857: an unknown first segment"), pre);
  assert.match(block, /seg &&/);
  assert.match(block, /preview !== "draft"/);
  assert.match(block, /seg !== LEGACY_PRIVACY_SLUG/);
  assert.match(block, /!policyDocForSlug\(seg\)/);
  assert.match(block, /parseServiceSlug\(seg\) === null/);
  assert.match(block, /pages\.some\(\(p\) => p\.slug === seg\)/);
});

test("TUL-857: the slow render lives in a Suspense body so the skeleton still paints early", () => {
  assert.match(page, /<Suspense fallback=\{<TalentSitePaintSkeleton locale=\{locale\} \/>\}>/);
  assert.match(page, /async function TalentSiteBody\(/);
  assert.match(page, /await renderTalentMaxSite\(\{\n    talentProfileId,\n    pageSlug: seg,/);
});
