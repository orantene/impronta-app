import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { blankComments } from "@/lib/quality/supabase-unchecked-read";
import { formatOrderMoney, minorUnitDivisor } from "./money-format";

test("ARS renders as pesos with its code, never as dollars", () => {
  // The failure this exists for: 4500 pesos shown as "$4,500.00" is wrong by
  // about a thousand times, and wrong SILENTLY — no null, no throw, just a
  // plausible number a customer might pay.
  assert.equal(formatOrderMoney(450000, "ARS"), "4,500.00 ARS");
  assert.doesNotMatch(formatOrderMoney(450000, "ARS"), /\$/);
});

test("USD keeps the bare dollar sign", () => {
  // What the platform bills in and what every existing screen and test shows.
  assert.equal(formatOrderMoney(450000, "USD"), "$4,500.00");
});

test("every non-USD currency carries its code", () => {
  for (const c of ["ARS", "MXN", "EUR", "GBP", "BRL"]) {
    assert.match(formatOrderMoney(12345, c), new RegExp(`${c}$`), `${c} must name itself`);
  }
});

test("the desk and the card agree, which is the whole point", () => {
  // They disagreed: the card said "4,500.00 ARS" and the desk said
  // "ARS 4,500.00" — and "MX$4,500.00" for MXN, via Intl. Same order, two
  // screens, two answers. One formatter is the fix; whose format won matters
  // less than that one did.
  const dir = join(process.cwd(), "src");
  const offenders: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name === ".next") continue;
      const p = join(d, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!/\.tsx?$/.test(e.name) || /\.test\.tsx?$/.test(e.name)) continue;
      if (!/[\\/](orders|cart)[\\/]|admin[\\/]orders/.test(p)) continue;
      const body = blankComments(readFileSync(p, "utf8"));
      // `style: "currency"` is the specific hazard: it renders MX$ / US$ / bare
      // codes differently across runtimes and locales.
      if (/style:\s*["']currency["']/.test(body)) offenders.push(p.split("/web/")[1] ?? p);
    }
  };
  walk(dir);
  assert.deepEqual(offenders, [], "these format money a second way; use formatOrderMoney");
});

test("a zero-decimal currency shows no cents", () => {
  // Printing ".00" on a yen invents a precision the currency does not have.
  assert.equal(minorUnitDivisor("JPY"), 1);
  assert.equal(formatOrderMoney(4500, "JPY"), "4,500 JPY");
  assert.equal(minorUnitDivisor("ARS"), 100, "ARS is two-decimal despite the magnitudes");
});

test("negatives keep the sign in front", () => {
  assert.equal(formatOrderMoney(-2550, "USD"), "-$25.50");
  assert.equal(formatOrderMoney(-2550, "ARS"), "-25.50 ARS");
});

test("an empty or lowercase currency does not produce a bare number", () => {
  // A number with no currency beside it is the ambiguity this whole module
  // exists to remove.
  assert.equal(formatOrderMoney(100, ""), "$1.00", "empty falls back to the billing currency");
  assert.equal(formatOrderMoney(100, "ars"), "1.00 ARS", "case is normalised, not trusted");
});
