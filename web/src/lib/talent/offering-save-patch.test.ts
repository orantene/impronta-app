import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { blankOffering, offeringToRowPatch } from "./offerings-types";
import { patchForSave } from "./offering-save-patch";

test("item 4: a talent edit keeps an agency-tenant row on its tenant; insert still stamps it", () => {
  const offering = { ...blankOffering("tal1", "MXN", 0), title: "Cut", tenantId: "agency-tenant" };
  // what the action builds: the talent's OWN workspace overrides the row's tenant
  const patch = offeringToRowPatch({ ...offering, ownerKind: "talent", tenantId: "talent-own-workspace" });
  assert.equal(patch.tenant_id, "talent-own-workspace");
  assert.ok(!("tenant_id" in (patchForSave(patch, true) as object)), "update must not write tenant_id");
  assert.equal((patchForSave(patch, false) as typeof patch).tenant_id, "talent-own-workspace");
});

test("item 4: the update branch of upsertTalentOffering uses the tenant-free patch", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/talent/offerings-actions.ts"), "utf8");
  const upsert = src.slice(src.indexOf("export async function upsertTalentOffering"), src.indexOf("export async function deleteTalentOffering"));
  assert.match(upsert, /\.update\(patchForSave\(patch, true\)\)/);
  assert.match(upsert, /\.insert\(patchForSave\(patch, false\)\)/);
});
