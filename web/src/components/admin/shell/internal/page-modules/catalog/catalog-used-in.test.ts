/**
 * TUL-1271 #11: "Used in" reads the row, not a hard-coded 2.
 *
 * Run: node_modules/.bin/tsx --test src/components/admin/shell/internal/page-modules/catalog/catalog-used-in.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { blankOffering, type TalentOffering } from "@/lib/talent/offerings-types";
import { usedInChannels } from "./catalog-used-in";

function item(patch: Partial<TalentOffering> = {}): TalentOffering {
  return { ...blankOffering({ kind: "workspace", tenantId: "t1" }, "USD", 0), id: "o1", title: "Latte", amountCents: 6500, ...patch };
}

test("usedInChannels: a public published item is on the counter and the website", () => {
  assert.deepEqual(usedInChannels(item()), ["pos", "web"]);
});

test("usedInChannels: a staff-only item is on the counter alone, a draft nowhere", () => {
  assert.deepEqual(usedInChannels(item({ visibility: "agency_only" })), ["pos"]);
  assert.deepEqual(usedInChannels(item({ status: "draft" })), []);
});

test("the editor draws no hard-coded Used in count and no dead location filter", () => {
  const editor = readFileSync(new URL("./CatalogItemEditor.tsx", import.meta.url), "utf8");
  const list = readFileSync(new URL("./CatalogList.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(editor, /count=\{2\}/);
  assert.doesNotMatch(list, /dashboard\.catalog\.filter\.location/);
});
