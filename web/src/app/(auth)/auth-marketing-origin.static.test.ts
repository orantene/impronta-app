import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

// TUL-750: the auth shell links to marketing pages; those links must follow
// the environment's marketing origin, never a hard-coded apex or the
// NEXT_PUBLIC_SITE_URL build variable.
const dir = __dirname;
const files = ["auth-shell-chrome.tsx", "layout.tsx"];

for (const f of files) {
  test(`${f} uses resolveMarketingOrigin, not a hard-coded apex`, () => {
    const src = readFileSync(join(dir, f), "utf8");
    assert.ok(!/https:\/\/tulala\.digital/.test(src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")));
    assert.ok(!/TULALA_APEX_HOST/.test(src));
    assert.ok(!/getSiteUrl\(\)/.test(src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")));
  });
}
test("auth shell footer builds legal links from resolveMarketingOrigin", () => {
  const src = readFileSync(join(dir, "auth-shell-chrome.tsx"), "utf8");
  assert.match(src, /resolveMarketingOrigin\(\)\}\/legal\/terms/);
  assert.match(src, /resolveMarketingOrigin\(\)\}\/legal\/privacy/);
});
