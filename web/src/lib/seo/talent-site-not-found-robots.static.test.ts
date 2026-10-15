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

test("TUL-857: /privacy is a real 308 before the Suspense boundary, only when no page owns the slug", () => {
  const block = page.slice(page.indexOf("TUL-857: an unknown first segment"), page.indexOf("<Suspense fallback"));
  assert.match(block, /seg === LEGACY_PRIVACY_SLUG \|\|/);
  assert.match(block, /if \(seg === LEGACY_PRIVACY_SLUG\) permanentRedirect\(`\/\$\{POLICY_SLUG\.privacy\}`\)/);
  assert.match(block, /pages\.some\(\(p\) => p\.slug === seg\)/);
});
