import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Every application insert into `booking_transactions` must name BOTH fee
 * columns. They are NOT NULL on production. The isolated QA branch carried a
 * hand-added default that let a writer omit one and pass every proof; the
 * production push was the first thing to refuse it. This guard fails on the
 * next writer that forgets, before production has to.
 */
function walk(dir: string, out: string[]): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".ts") && !p.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

test("every insert into booking_transactions names both platform fee columns", () => {
  const files = walk(join(process.cwd(), "src/lib"), []);
  const offenders: string[] = [];
  const re = /\.from\("booking_transactions"\)\s*\.insert\(\s*(\{[\s\S]*?\}|\[[\s\S]*?\])\s*\)/g;
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(re)) {
      const body = m[1];
      if (!body.includes("platform_fee_basis_points") || !body.includes("platform_fee_cents")) {
        offenders.push(f.slice(process.cwd().length + 1));
      }
    }
  }
  assert.deepEqual(offenders, [], `inserts missing a fee column: ${offenders.join(", ")}`);
});
