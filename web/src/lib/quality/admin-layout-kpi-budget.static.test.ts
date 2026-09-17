import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The admin layout awaits one wave of overview metrics on every admin page,
 * the POS included. The financial KPI read (commission snapshots joined to
 * bookings) hit the statement timeout on production for a week and took the
 * POS down with it ("This page couldn't load", 2026-09-16). It must stay
 * time-boxed: past its budget the identity chip reads unknown and the page
 * paints.
 */
test("the layout's financial KPI read is time-boxed, never awaited to the statement timeout", () => {
  const src = readFileSync(
    join(process.cwd(), "src/app/(workspace)/[tenantSlug]/_data-bridge/overview-metrics.ts"),
    "utf8",
  );
  assert.match(src, /withTimeout\(loadWorkspaceFinancialKpis\(tenantId\), FINANCIAL_KPI_BUDGET_MS, null\)/);
  const budget = Number((src.match(/const FINANCIAL_KPI_BUDGET_MS = ([\d_]+);/) ?? [])[1]?.replace(/_/g, ""));
  assert.ok(Number.isFinite(budget) && budget > 0 && budget <= 2_000, `budget ${budget} ms must stay under 2 s`);
  assert.doesNotMatch(src, /^\s+loadWorkspaceFinancialKpis\(tenantId\),$/m, "a bare call would wait on the statement timeout again");
});
