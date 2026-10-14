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

// TUL-750 follow-up: the signup checkbox is a client component, so the server
// pages resolve the origin and pass it down as `marketingOrigin`.
test("age-terms checkbox takes the origin as a prop and the pages pass it", () => {
  const root = join(dir, "..", "..");
  const cb = readFileSync(join(root, "components/auth/age-terms-checkbox.tsx"), "utf8");
  assert.match(cb, /marketingOrigin/);
  for (const p of ["(auth)/register/page.tsx", "(auth)/register/accept-terms/page.tsx", "(public)/me/page.tsx"]) {
    const src = readFileSync(join(root, "app", p), "utf8");
    assert.match(src, /marketingOrigin=\{resolveMarketingOrigin\(\)\}/, p);
  }
});
