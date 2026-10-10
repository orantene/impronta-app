/**
 * Dashboard price surfaces format money through formatDashboardMoney(Cents),
 * never the public formatOfferingPrice. Public surfaces (/t, public-booking)
 * keep theirs.
 * Run: node_modules/.bin/tsx --test src/lib/money/dashboard-prices-use-dashboard-format.static.test.ts
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { formatDashboardMoneyCents } from "./dashboard-money-format";

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(n) && !/\.test\./.test(n)) out.push(p);
  }
  return out;
}

describe("dashboard price formatting", () => {
  it("no dashboard component calls formatOfferingPrice", () => {
    const hits = [...walk("src/components/admin"), ...walk("src/components/talent")].filter((f) =>
      /formatOfferingPrice\(/.test(readFileSync(f, "utf8")),
    );
    assert.deepEqual(hits, []);
  });
  it("ExtraScreen has no hard-coded dollar sign", () => {
    assert.doesNotMatch(readFileSync("src/components/talent/services/ExtraScreen.tsx", "utf8"), /\$\{Math\.round\(totalCents/);
  });
  it("cents format with the code, zero-decimal currencies are not divided by 100", () => {
    assert.equal(formatDashboardMoneyCents(10150, "USD"), "$101.50 USD");
    assert.equal(formatDashboardMoneyCents(70000, "MXN"), "$700 MXN");
    assert.match(formatDashboardMoneyCents(5000, "JPY"), /5,000 JPY/);
  });
});
