/**
 * PKG-2 (signup, login, code entry, account entry) regression pins.
 * Static source checks: these surfaces are client components / server pages.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("TUL-772: /account for a no-role user keeps a client next, so it never hops to the marketing /start", () => {
  const src = read("src/app/account/page.tsx");
  assert.doesNotMatch(src, /redirect\("\/onboarding\/role"\)/);
  assert.match(src, /redirect\("\/onboarding\/role\?next=%2Faccount"\)/);
});

test("TUL-759: the marketing login modal carries a secondary client sign-up link (ES + EN)", () => {
  const src = read("src/components/marketing/login-modal.tsx");
  assert.match(src, /\/register\?as=client/);
  assert.match(src, /Create a client account/);
  assert.match(src, /Crea una cuenta de cliente/);
});

test("TUL-777: the /account header wears the same avatar + quick-links menu as the site headers", () => {
  const src = read("src/components/client-account/ClientAccountArea.tsx");
  assert.match(src, /<ClientAccountButton variant="header"/);
});

test("TUL-776: the tenant account area names the brand from the tenant, else the neutral platform name, never a slug", () => {
  const src = read("src/lib/client-account/render-tenant-area.tsx");
  assert.match(src, /identity\?\.public_name\?\.trim\(\) \|\| PLATFORM_BRAND\.name/);
  assert.doesNotMatch(src, /tenant\.slug : PLATFORM_BRAND/);
});
