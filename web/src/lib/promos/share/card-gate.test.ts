import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { printableCardAllowed } from "./card-gate";

test("printable card: only the paid talent plan passes", () => {
  assert.equal(printableCardAllowed("talent_portfolio"), true);
  assert.equal(printableCardAllowed("talent_basic"), false);
  assert.equal(printableCardAllowed(null), false);
  assert.equal(printableCardAllowed(undefined), false);
});

test("the card route refuses 403 before building the PDF", () => {
  const src = readFileSync(join(process.cwd(), "src/app/api/promos/share/[promoId]/[asset]/route.tsx"), "utf8");
  const gate = src.indexOf("printableCardAllowed(data.talentPlanKey)");
  assert.ok(gate > 0, "gate present");
  assert.ok(src.slice(gate, gate + 120).includes("status: 403"));
  assert.ok(gate < src.indexOf("buildPromoCardPdf({"), "gate runs before the PDF build");
});
