import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// live2b-02: Admin painted "Pagado este mes €6,800" (the EARNINGS_ROWS demo
// fixture) while Hoy showed $0, because legacy Today fell back to the fixture
// whenever talent earnings had not loaded.
test("legacy Today never falls back to the EARNINGS_ROWS demo fixture", () => {
  const src = readFileSync(new URL("./TodayPage.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(src, /import[^;]*\bEARNINGS_ROWS\b[^;]*from/);
  assert.doesNotMatch(src, /EARNINGS_ROWS\.filter/);
  assert.match(src, /bridgeTalentEarnings \?\? EMPTY_TALENT_EARNINGS/);
  assert.match(src, /earnings=\{todayEarnings\}/);
});

test("Admin shell loads the hybrid talent's real earnings so Pagado este mes matches Hoy", () => {
  const layout = readFileSync(
    new URL("../../../../../../app/(workspace)/[tenantSlug]/admin/layout.tsx", import.meta.url),
    "utf8",
  );
  assert.match(layout, /loadTalentEarningsByCurrency\(talentSelfProfile!\.id\)/);
  assert.match(layout, /applyOperatingCurrencyToEarnings\(talentEarningsRaw, operatingCurrency\)/);
  assert.match(layout, /talentInquiries,\s+talentEarnings,/);
});
