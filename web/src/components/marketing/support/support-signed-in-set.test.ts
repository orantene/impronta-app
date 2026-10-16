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

// TUL-922 (PM decision): page context decides, never screen size or sign-in.
for (const locale of ["en", "es"] as const) {
  const copy = getMarketingSupportCopy(locale);
  test(`dashboard surface gets the support set (${locale})`, () => {
    const s = supportStarters("dashboard", copy);
    assert.deepEqual(s.slice(0, 3), [copy.starterBroken, copy.starterBilling, copy.starterAccount]);
    assert.ok(!s.includes(copy.starterPricing));
    assert.equal(supportComposerPlaceholder("dashboard", copy), copy.composerPlaceholderSignedIn);
  });
  test(`public surface gets the sales set (${locale})`, () => {
    const s = supportStarters("public", copy);
    assert.deepEqual(s.slice(0, 3), [copy.starterPricing, copy.starterDomain, copy.starterPayments]);
    assert.equal(supportComposerPlaceholder("public", copy), copy.composerPlaceholder);
  });
}

test("the public marketing panel always uses the public set, whoever is signed in", () => {
  const p = read("MarketingSupportPanel.tsx");
  assert.match(p, /const MARKETING_SURFACE = "public" as const;/);
  assert.ok(p.includes("supportStarters(MARKETING_SURFACE, copy)"));
  assert.ok(p.includes("supportComposerPlaceholder(MARKETING_SURFACE, copy)"));
  assert.ok(!/supportStarters\(signedIn/.test(p));
});

test("no support copy selection keys on screen size", () => {
  const files = ["MarketingSupportPanel.tsx", "MarketingSupportLauncher.tsx", "MarketingSupportLauncherMount.tsx"];
  for (const f of files) assert.ok(!/matchMedia|innerWidth|useMediaQuery/.test(read(f)), f);
  assert.ok(!/matchMedia|innerWidth|useMediaQuery/.test(readFileSync(join(here, "../../../lib/marketing/support-copy.ts"), "utf8")));
});
