/**
 * A1 static guard: Agenda money readers convert total_client_revenue via the
 * shared helper — never treat the major-unit column as cents.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(process.cwd(), "src/lib/talent-agenda");

describe("A1 money unit helper wiring", () => {
  it("load.ts imports totalClientRevenueToCents / majorMoneyToCents", () => {
    const src = readFileSync(join(root, "load.ts"), "utf8");
    assert.match(src, /from "@\/lib\/money\/total-client-revenue"/);
    assert.match(src, /totalClientRevenueToCents/);
    assert.match(src, /majorMoneyToCents/);
    assert.doesNotMatch(
      src,
      /if \(agency\?\.payment_status === "paid"\) return agency\.total_client_revenue;/,
    );
  });

  it("load-map.ts converts total_client_revenue before totalCents", () => {
    const src = readFileSync(join(root, "load-map.ts"), "utf8");
    assert.match(src, /totalClientRevenueToCents\(input\.agency\?\.total_client_revenue\)/);
  });

  it("booking-actions.ts converts before cash collect and pay-link amount", () => {
    const src = readFileSync(join(root, "booking-actions.ts"), "utf8");
    assert.match(src, /from "@\/lib\/money\/total-client-revenue"/);
    assert.match(src, /totalClientRevenueToCents\(row\.total_client_revenue\)/);
    assert.doesNotMatch(
      src,
      /const total = Math\.max\(0, Number\(row\.total_client_revenue\) \|\| 0\);/,
    );
  });

  it("QA agenda seed writes major units, not cent-scaled revenue", () => {
    const seed = readFileSync(
      join(process.cwd(), "scripts/seed-talent-agenda-qa.mjs"),
      "utf8",
    );
    assert.match(seed, /total_client_revenue:\s*850\b/);
    assert.match(seed, /client_charge_total:\s*850\b/);
    assert.doesNotMatch(seed, /total_client_revenue:\s*85000\b/);
    assert.doesNotMatch(seed, /\/\/ Cents — Finish→Card/);
  });
});
