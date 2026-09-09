import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { addonCentsOnLine } from "./addons";
import { lineTotalCents, cartTotals } from "@/lib/cart/totals";
import { blankComments } from "@/lib/quality/supabase-unchecked-read";

/**
 * The register used to store which extras a customer chose and charge for none
 * of them. These pin the arithmetic that closed it, plus the two structural
 * properties that keep it closed: the register prices extras the same way the
 * website does, and no command may rebuild the order's totals in a way that
 * drops the extras on lines it is not touching.
 */

test("an extra is added to the line total once, not once per unit", () => {
  // Three burgers with bacon bills three burgers and ONE bacon. That is
  // `purchase-pricing.ts`'s rule, argued there: the catalog has no column
  // saying which extras scale with quantity, and overcharging is the worse way
  // to be wrong. The register must obey the SAME rule — the whole defect was
  // the two pipelines disagreeing about one basket.
  assert.equal(lineTotalCents({ unitCents: 900, units: 3, addonCents: 150 }), 2850);
});

test("no extras is the old arithmetic, unchanged", () => {
  assert.equal(lineTotalCents({ unitCents: 900, units: 3 }), 2700);
  assert.equal(lineTotalCents({ unitCents: 900, units: 3, addonCents: 0 }), 2700);
});

test("a free base item with a paid extra is still a paid line", () => {
  // The early return used to be `unit === 0 -> 0`, which would have zeroed a
  // free coffee with a paid shot of syrup: a real basket, and one where the
  // only money on the line lives in the extra.
  assert.equal(lineTotalCents({ unitCents: 0, units: 1, addonCents: 75 }), 75);
});

test("zero units is zero money however many extras were chosen", () => {
  assert.equal(lineTotalCents({ unitCents: 900, units: 0, addonCents: 150 }), 0);
});

test("the order subtotal carries the extras", () => {
  const totals = cartTotals([
    { unitCents: 900, units: 3, addonCents: 150 },
    { unitCents: 250, units: 2 },
  ]);
  assert.equal(totals.subtotalCents, 2850 + 500);
  assert.equal(totals.totalCents, 3350);
});

test("the extra charge is recoverable from a stored line without another read", () => {
  // Every command that rebuilds totals — change a quantity, remove a different
  // line — has to keep the extras on the lines it is not touching. Re-reading
  // the catalog would silently reprice them; the residue does not.
  assert.equal(addonCentsOnLine({ unitCents: 900, units: 3, totalCents: 2850 }), 150);
  assert.equal(addonCentsOnLine({ unitCents: 900, units: 3, totalCents: 2700 }), 0);
});

test("a line written by the web pipeline degrades to zero, never to a negative", () => {
  // Online lines store an EFFECTIVE unit price, `round(total / units)`, which
  // can round the base above the true total. A negative residue would subtract
  // money from the order.
  assert.equal(addonCentsOnLine({ unitCents: 950, units: 3, totalCents: 2849 }), 0);
});

const DRAFT = blankComments(readFileSync(join(process.cwd(), "src/lib/pos/draft.ts"), "utf8"));

test("no POS command rebuilds totals from unit x units alone", () => {
  // This is the shape of the defect, and it recurred in three commands at once:
  // `addLine`, `updateLine` and `removeLine` each mapped stored lines to
  // `{unitCents, units}` and handed that to `cartTotals`. Every one of them
  // silently deleted the extras from every OTHER line on the sale.
  assert.doesNotMatch(
    DRAFT,
    /\{\s*unitCents:\s*num\(l\.unit_cents\),\s*units:\s*num\(l\.units\)\s*\}/,
    "rebuild through totalsInput, which carries the extras",
  );
  assert.match(DRAFT, /loaded\.lines\.map\(totalsInput\)/, "one reconstruction, used everywhere");
});

test("adding a line prices its extras before the line is written", () => {
  // A refused extra must leave the sale untouched. Pricing after the insert
  // would put a mispriced item on the operator's screen and then report an
  // error about it.
  const priced = DRAFT.indexOf("await priceAddons(admin");
  const written = DRAFT.indexOf("await mutateDraftLine(admin");
  assert.ok(priced > -1 && written > -1, "both steps must exist");
  assert.ok(priced < written, "price first, write second");
});

test("reprice re-reads the extras too", () => {
  // Reprice's whole job is to answer what the sale costs NOW. An extra left at
  // its stored price would be the only stale number on a receipt claiming to
  // be current.
  const repriceAt = DRAFT.indexOf("export async function repriceAndValidate");
  assert.ok(repriceAt > -1);
  assert.match(DRAFT.slice(repriceAt), /priceAddons\(admin/, "extras are catalog-priced here");
});
