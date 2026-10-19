import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

// TUL-750: Terms / Privacy / marketing links in auth and onboarding follow the
// environment's marketing origin (`resolveMarketingOrigin`), never the
// NEXT_PUBLIC_SITE_URL build variable (`getSiteUrl`) and never a hard-coded
// apex. Client components cannot call the server-side resolver, so the server
// page resolves it once and passes it down as the `marketingOrigin` prop.
const root = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");

const NO_SITE_URL = [
  "app/(auth)/auth-shell-chrome.tsx",
  "app/(auth)/layout.tsx",
  "app/onboarding/layout.tsx",
  "app/onboarding/role/page.tsx",
  "app/onboarding/workspace/page.tsx",
  "components/auth/age-terms-checkbox.tsx",
  "components/onboarding/steps/save-step.tsx",
];

for (const p of NO_SITE_URL) {
  test(`${p} does not build marketing links from getSiteUrl`, () => {
    const src = code(p);
    assert.ok(!/getSiteUrl/.test(src), "getSiteUrl still used");
    assert.ok(!/https:\/\/tulala\.digital/.test(src), "hard-coded apex");
  });
}

test("auth footer and onboarding footer build legal links from resolveMarketingOrigin", () => {
  assert.match(code("app/(auth)/auth-shell-chrome.tsx"), /authLegalHref\(resolveMarketingOrigin\(\), "terms"/);
  assert.match(code("app/(auth)/auth-shell-chrome.tsx"), /authLegalHref\(resolveMarketingOrigin\(\), "privacy"/);
  assert.match(code("app/onboarding/layout.tsx"), /resolveMarketingOrigin\(\)\}\/legal\/terms/);
  assert.match(code("app/onboarding/layout.tsx"), /resolveMarketingOrigin\(\)\}\/legal\/privacy/);
  assert.match(code("app/onboarding/layout.tsx"), /resolveMarketingOrigin\(\)\}\/about/);
});

test("client components take marketingOrigin as a prop and never call the resolver", () => {
  for (const p of [
    "components/auth/age-terms-checkbox.tsx",
    "components/auth/email-code-form.tsx",
    "components/onboarding/steps/save-step.tsx",
    "components/onboarding/onboarding-module.tsx",
    "components/onboarding/onboarding-module-host.tsx",
    "components/onboarding/start-flow.tsx",
    "components/marketing/marketing-modal-host.tsx",
    "components/marketing/talent-register-modal.tsx",
    "components/marketing/tenant-register-modal-host.tsx",
    "app/(auth)/register/register-form.tsx",
    "app/(auth)/register/accept-terms/accept-terms-form.tsx",
  ]) {
    const src = code(p);
    assert.match(src, /marketingOrigin/, `${p} lacks the prop`);
    assert.ok(!/resolveMarketingOrigin/.test(src), `${p} calls the server-only resolver`);
  }
  assert.match(code("components/auth/age-terms-checkbox.tsx"), /ageTermsLinks\(marketingOrigin,/);
  assert.match(code("components/onboarding/steps/save-step.tsx"), /ageTermsLinks\(marketingOrigin,/);
});

test("server parents resolve the origin and pass it down", () => {
  const passes = /marketingOrigin=\{resolveMarketingOrigin\(\)\}/;
  for (const p of [
    "app/(auth)/register/page.tsx",
    "app/(auth)/register/accept-terms/page.tsx",
    "app/(auth)/login/page.tsx",
    "app/(public)/me/page.tsx",
    "app/start/page.tsx",
    "components/marketing/shell.tsx",
    "components/marketing/tenant-register-mount.tsx",
  ]) {
    assert.match(code(p), passes, p);
  }
});
