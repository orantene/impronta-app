import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  getMarketingSupportCopy,
  supportComposerPlaceholder,
  supportStarters,
} from "@/lib/marketing/support-copy";

const here = dirname(fileURLToPath(import.meta.url));
const read = (f: string) => readFileSync(join(here, f), "utf8");

for (const locale of ["en", "es"] as const) {
  const copy = getMarketingSupportCopy(locale);
  test(`signed-in gets the support set (${locale})`, () => {
    const s = supportStarters(true, copy);
    assert.deepEqual(s.slice(0, 3), [copy.starterBroken, copy.starterBilling, copy.starterAccount]);
    assert.ok(!s.includes(copy.starterPricing));
    assert.equal(supportComposerPlaceholder(true, copy), copy.composerPlaceholderSignedIn);
  });
  test(`signed-out gets the sales set (${locale})`, () => {
    const s = supportStarters(false, copy);
    assert.deepEqual(s.slice(0, 3), [copy.starterPricing, copy.starterDomain, copy.starterPayments]);
    assert.equal(supportComposerPlaceholder(false, copy), copy.composerPlaceholder);
  });
}

test("panel selects starters and placeholder through the shared helpers", () => {
  const p = read("MarketingSupportPanel.tsx");
  assert.ok(p.includes("supportStarters(signedIn, copy)"));
  assert.ok(p.includes("supportComposerPlaceholder(signedIn, copy)"));
  assert.ok(!p.includes("copy.composerPlaceholder}"));
});

test("every mount passes the real signed-in state, never a literal", () => {
  assert.ok(read("MarketingSupportLauncherMount.tsx").includes("signedIn={Boolean(actor.user)}"));
  assert.ok(read("MarketingContactPage.tsx").includes("signedIn={Boolean(actor?.user)}"));
  assert.ok(read("MarketingContactResume.tsx").includes("signedIn={signedIn}"));
  assert.ok(read("MarketingSupportLauncher.tsx").includes("signedIn={signedIn}"));
  for (const f of ["MarketingSupportLauncherMount.tsx", "MarketingContactPage.tsx", "MarketingContactResume.tsx", "MarketingSupportLauncher.tsx"]) {
    assert.ok(!/signedIn=\{(false|true)\}/.test(read(f)), f);
  }
});
