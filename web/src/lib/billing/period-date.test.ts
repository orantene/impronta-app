import assert from "node:assert/strict";
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
