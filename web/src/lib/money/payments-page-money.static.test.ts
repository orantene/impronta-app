import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { formatDashboardMoneyCents } from "./dashboard-money-format";

test("Payments zero reads like the Overview zero (TUL-734)", () => {
  assert.equal(formatDashboardMoneyCents(0, "USD"), "$0 USD");
});

test("workspace Payments pages use the dashboard money format", () => {
  for (const f of ["page.tsx", "payments-tabs.tsx"]) {
    const src = readFileSync(
      new URL(`../../app/(workspace)/[tenantSlug]/admin/payments/${f}`, import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(src, /orders\/money-format/);
  }
});
