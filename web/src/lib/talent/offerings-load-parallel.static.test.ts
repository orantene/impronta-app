import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const src = readFileSync(new URL("./offerings-actions.ts", import.meta.url), "utf8");
const body = src.slice(
  src.indexOf("export async function loadTalentOfferingsForEditor"),
  src.indexOf("type SaveResult"),
);

test("offerings list read overlaps authorizeForTalent", () => {
  assert.match(body, /Promise\.all\(\[\s*authorizeForTalent\(talentProfileId\),\s*offeringsTable\(admin\)/);
  assert.ok(body.indexOf("if (!auth.ok)") < body.indexOf("loadUsdRates()"), "rates start only after auth passes");
});
