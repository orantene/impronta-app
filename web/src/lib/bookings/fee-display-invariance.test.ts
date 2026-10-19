/**
 * TUL-1176 A1 invariance: the display label (fee-display.ts, #3986) changes nothing that is
 * charged, split or paid out. Proof in two parts: (1) the fee computation is a pure function of
 * (gross, bps) and is unaffected by the label helper; (2) no file under the money directories
 * imports the display helper, so no charge/commission/payout/refund path can read it.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { calculateTransactionAmountsForBasisPoints } from "./commission";
import { effectiveFeeLabel } from "./fee-display";

test("charged amounts are unchanged by the label: golden values, fee + net = gross", () => {
  const cases: Array<[number, number, number]> = [
    [100_000, 148, 1_480],
    [100_000, 0, 0],
    [10_000, 600, 600],
    [9_999, 600, 599], // floor, never rounds up
  ];
  for (const [gross, bps, fee] of cases) {
    const a = calculateTransactionAmountsForBasisPoints(gross, bps);
    assert.deepEqual(a, { grossCents: gross, feeBasisPoints: bps, feeCents: fee, netCents: gross - fee });
    // Calling the label helper with the same numbers must not alter a second computation.
    effectiveFeeLabel({ platformFeeCents: a.feeCents, grossAmountCents: a.grossCents, storedBasisPoints: 0 });
    assert.deepEqual(calculateTransactionAmountsForBasisPoints(gross, bps), a);
  }
});

test("the label helper does not mutate its input", () => {
  const input = { platformFeeCents: 1480, grossAmountCents: 100_000, storedBasisPoints: 0, snapshot: null };
  const before = JSON.stringify(input);
  effectiveFeeLabel(input);
  assert.equal(JSON.stringify(input), before);
});

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

test("only the work page imports fee-display; no money module does", () => {
  const importers = walk(join(process.cwd(), "src"))
    .filter((f) => /from\s+["']@\/lib\/bookings\/fee-display["']|from\s+["']\.\/fee-display["']/.test(readFileSync(f, "utf8")))
    .map((f) => f.slice(process.cwd().length + 1));
  assert.deepEqual(importers, ["src/app/(workspace)/[tenantSlug]/admin/work/[id]/page.tsx"]);
});
