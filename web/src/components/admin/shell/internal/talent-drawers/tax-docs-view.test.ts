import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { EMPTY_TALENT_EARNINGS } from "@/lib/talent/earnings-types";
import { taxDocsView } from "./tax-docs-view";

const src = readFileSync(join(__dirname, "monetization.tsx"), "utf8");
const taxDrawer = src.slice(src.indexOf("export function TalentTaxDocsDrawer"));

test("TUL-727: tax drawer never uses fixture earnings or a hardcoded euro", () => {
  const body = taxDrawer.slice(0, taxDrawer.indexOf("export function TalentConflictResolveDrawer"));
  assert.ok(!body.includes("EARNINGS_ROWS"), "fixture rows");
  assert.ok(!body.includes("€"), "hardcoded euro");
  assert.ok(body.includes("taxDocsView"), "uses the ledger view");
});

test("TUL-727: W-8BEN only on USD accounts", () => {
  const mxn = { ...EMPTY_TALENT_EARNINGS, totals: { ...EMPTY_TALENT_EARNINGS.totals, currency: "mxn", ytdNetCents: 5000 } };
  assert.equal(taxDocsView(mxn).showW8, false);
  assert.equal(taxDocsView(mxn).currency, "MXN");
  assert.equal(taxDocsView(EMPTY_TALENT_EARNINGS).showW8, true);
  assert.equal(taxDocsView(EMPTY_TALENT_EARNINGS).empty, true);
});
