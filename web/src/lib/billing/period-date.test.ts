import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { formatPeriodDate } from "./period-date";

test("prints the UTC calendar day whatever the process zone is (P3)", () => {
  // 2026-11-05 02:00 UTC is still Nov 4 in Cancun (UTC-5): must read Nov 5.
  assert.equal(formatPeriodDate("2026-11-05T02:00:00.000Z", "en"), "November 5, 2026");
  assert.equal(formatPeriodDate("2026-11-05T02:00:00.000Z", "es"), "5 de noviembre de 2026");
  // 23:30 UTC stays on its own day too.
  assert.equal(formatPeriodDate("2026-11-05T23:30:00.000Z", "en"), "November 5, 2026");
});

test("accepts unix seconds and rejects junk without throwing", () => {
  assert.equal(formatPeriodDate(Date.UTC(2026, 10, 5, 2) / 1000, "en"), "November 5, 2026");
  assert.equal(formatPeriodDate(null, "en"), null);
  assert.equal(formatPeriodDate("", "en"), null);
  assert.equal(formatPeriodDate("not a date", "en"), null);
});

test("TUL-1914: a late-UTC instant keeps its UTC day (Stripe shows Nov 22 for 04:59 UTC; Cancun clocks read Nov 21)", () => {
  assert.equal(formatPeriodDate("2026-11-22T04:59:00.000Z", "en"), "November 22, 2026");
  assert.equal(formatPeriodDate("2026-11-22T04:59:00.000Z", "es"), "22 de noviembre de 2026");
  assert.equal(formatPeriodDate("2026-11-22T00:00:00.000Z", "es"), "22 de noviembre de 2026");
});

test("TUL-1914: every surface that prints a period end goes through formatPeriodDate, never the viewer's zone", () => {
  const files = [
    "src/app/(workspace)/[tenantSlug]/talent/settings/TalentPlanCard.tsx",
    "src/app/(workspace)/[tenantSlug]/talent/settings/TalentBillingCard.tsx",
    "src/app/(workspace)/[tenantSlug]/client/subscription/page.tsx",
    "src/components/admin/site-control-center/global-upgrade-modal.tsx",
  ];
  for (const f of files) {
    const src = readFileSync(join(process.cwd(), f), "utf8");
    assert.match(src, /formatPeriodDate/, f);
    assert.doesNotMatch(src, /toLocaleDateString/, f);
  }
});
