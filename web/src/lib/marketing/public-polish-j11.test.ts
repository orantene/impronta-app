import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { formatLegalDate } from "./legal-date";
import { pricingTierName } from "./pricing-ladders-copy";

const read = (p: string) => readFileSync(join(process.cwd(), "src", p), "utf8");

test("TUL-1799: Spanish legal dates are written out, English keeps ISO", () => {
  assert.equal(formatLegalDate("2026-10-01", "es"), "1 de octubre de 2026");
  assert.equal(formatLegalDate("2026-12-31", "es-MX"), "31 de diciembre de 2026");
  assert.equal(formatLegalDate("2026-10-01", "en"), "2026-10-01");
  assert.equal(formatLegalDate("not a date", "es"), "not a date");
});

test("TUL-1799: every Spanish legal page passes locale es to LegalPage", () => {
  for (const f of ["privacy/privacy-es", "terms/terms-es", "refunds/refunds-es", "cookies/cookies-es"]) {
    assert.match(read(`app/(marketing)/legal/${f}.tsx`), /locale="es"/, f);
  }
});

test("TUL-1799: the changelog title carries one brand suffix, not two", () => {
  const src = read("components/marketing/changelog/changelog-views.tsx");
  assert.doesNotMatch(src, /· Tulala`/);
  assert.match(src, /title: \{ absolute: c\.title \}/);
});

test("TUL-1799: compare table headers use the same names as the plan cards", () => {
  assert.equal(pricingTierName("workspace", "studio", "Team (Plan 02)", "es"), "Studio");
  assert.equal(pricingTierName("workspace", "agency", "Business", "es"), "Agencia");
  const src = read("components/marketing/plan-feature-compare-table.tsx");
  assert.match(src, /pricingTierName\(/);
  assert.doesNotMatch(src, /localizeTierName/);
});
