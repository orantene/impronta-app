/**
 * TUL-1298 ratchet: no NEW hard-coded `/ 100` price math outside `orders/price/`.
 *
 * Every divergence the D2 audit found (deposit rounded here, floored there, a balance that subtracts a
 * card fee, a JPY amount shown as 50.00) started as a hand-written `cents / 100` or `pct / 100` in a
 * surface. Price, deposit and fee math now lives in this folder (and the currency exponent in
 * `money-format.ts`). The count per file may only FALL: moving a site onto the module lowers it, adding
 * a new one fails here.
 *
 * Regenerate the baseline after removing sites (never to admit a new one):
 *   REGEN_PRICE_RATCHET=1 NODE_OPTIONS=--require ./scripts/register-server-only-test.cjs npx tsx --test src/lib/orders/price/price-math-ratchet.static.test.ts
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const ROOT = join(process.cwd(), "src");
const BASELINE_PATH = join(process.cwd(), "src/lib/orders/price/price-math-ratchet.baseline.json");
const SKIP_DIR = /(^|\/)(orders\/price)(\/|$)/;
const SKIP_FILE = /(\.test\.tsx?|\.d\.ts)$|(^|\/)orders\/money-format\.ts$/;
/** A division by 100 (not 100.5, not 1000) on a line that talks about money. */
const DIV_100 = /\/\s*100(?![\d.])/;
const MONEY_WORD = /(cents|pct|percent|deposit|amount|price|total|fee|balance|payout|refund)/i;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

export function countPriceMath(src: string): number {
  let n = 0;
  for (const line of src.split("\n")) {
    const t = line.trim();
    if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) continue;
    const code = line.replace(/\/\/.*$/, "");
    if (DIV_100.test(code) && MONEY_WORD.test(code)) n += 1;
  }
  return n;
}

function scan(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of walk(ROOT)) {
    const rel = f.slice(ROOT.length + 1);
    if (SKIP_DIR.test(rel) || SKIP_FILE.test(rel)) continue;
    const n = countPriceMath(readFileSync(f, "utf8"));
    if (n > 0) out[rel] = n;
  }
  return out;
}

test("the counter sees `cents / 100` and `pct / 100` but not prose, percentages of nothing or other divisors", () => {
  assert.equal(countPriceMath("const a = totalCents / 100;"), 1);
  assert.equal(countPriceMath("return Math.round((total * depositPct) / 100);"), 1);
  assert.equal(countPriceMath("// cents / 100 in a comment"), 0);
  assert.equal(countPriceMath("const w = width / 100;"), 0);
  assert.equal(countPriceMath("const a = amount / 1000;"), 0);
  assert.equal(countPriceMath("const a = amount / 100.5;"), 0);
});

test("no file gains hard-coded `/ 100` price math; the count only falls", () => {
  const now = scan();
  if (process.env.REGEN_PRICE_RATCHET === "1") {
    const sorted = Object.fromEntries(Object.entries(now).sort(([a], [b]) => a.localeCompare(b)));
    writeFileSync(BASELINE_PATH, `${JSON.stringify(sorted, null, 2)}\n`);
    return;
  }
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as Record<string, number>;
  const worse = Object.entries(now)
    .filter(([f, n]) => n > (baseline[f] ?? 0))
    .map(([f, n]) => `${f}: ${n} (baseline ${baseline[f] ?? 0})`);
  assert.deepEqual(
    worse,
    [],
    "New `/ 100` price math. Use depositCents / collectNowCents / balanceCents from src/lib/orders/price/rules.ts and minorUnitDivisor from money-format.ts.",
  );
});

test("the baseline total is recorded (shrink-only)", () => {
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as Record<string, number>;
  const total = Object.values(baseline).reduce((s, n) => s + n, 0);
  const now = Object.values(scan()).reduce((s, n) => s + n, 0);
  assert.ok(now <= total, `${now} sites now vs baseline ${total}`);
});
