import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = join(process.cwd(), "src/app/%5Ftalent-site");
const page = readFileSync(join(root, "[[...pageSlug]]/page.tsx"), "utf8");

test("TUL-857: the talent host route has no loading.tsx (it locked unknown paths at HTTP 200)", () => {
  assert.equal(existsSync(join(root, "loading.tsx")), false);
});

test("TUL-857: the verdict is taken before the Suspense boundary, via the pure helper", () => {
  const start = page.indexOf("needsRouteLookup(seg, preview)");
  const susp = page.indexOf("<Suspense fallback");
  assert.ok(start > 0 && susp > start, "lookup must sit before the Suspense return");
  const block = page.slice(start, susp);
  assert.match(block, /talentRouteVerdict\(seg,/);
  assert.match(block, /verdict === "privacy-redirect"\) permanentRedirect\(`\/\$\{POLICY_SLUG\.privacy\}`\)/);
  assert.match(block, /verdict === "not-found"\) notFound\(\)/);
});

test("TUL-857: the slow render lives in a Suspense body so the skeleton still paints early", () => {
  assert.match(page, /<Suspense fallback=\{<TalentSitePaintSkeleton locale=\{locale\} \/>\}>/);
  assert.match(page, /async function TalentSiteBody\(/);
  assert.match(page, /await renderTalentMaxSite\(\{\n    talentProfileId,\n    pageSlug: seg,/);
});

test("TUL-1273 #5: a service slug's verdict is taken before the Suspense boundary too", () => {
  const start = page.indexOf("needsServiceLookup(seg, preview)");
  const susp = page.indexOf("<Suspense fallback");
  assert.ok(start > 0 && susp > start, "service lookup must sit before the Suspense return");
  assert.match(page.slice(start, susp), /serviceRouteVerdict\(seg,/);
  assert.match(page.slice(start, susp), /notFound\(\)/);
  assert.match(page.slice(start, susp), /offerings\.length > 0/, "an empty loader result is unknown, not a 404");
});
