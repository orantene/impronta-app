/**
 * TUL-1271 #3: turning POS off keeps the item on the website, /book and QR menu.
 *
 * Run: node_modules/.bin/tsx --test src/components/admin/shell/internal/page-modules/catalog/catalog-pos-switch.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { blankOffering, type TalentOffering } from "@/lib/talent/offerings-types";
import { itemChannels } from "./catalog-model";
import { posSwitchPatch } from "./catalog-pos-switch";

function item(patch: Partial<TalentOffering> = {}): TalentOffering {
  return { ...blankOffering({ kind: "workspace", tenantId: "t1" }, "USD", 0), id: "o1", title: "Latte", amountCents: 500, ...patch };
}

test("itemChannels: POS off removes the counter and leaves the website", () => {
  assert.deepEqual(itemChannels(item({ posEnabled: false })), ["website"]);
  assert.deepEqual(itemChannels(item({ posEnabled: true })), ["website", "pos"]);
  assert.deepEqual(itemChannels(item()), ["website", "pos"]);
});

test("posSwitchPatch: with the column it writes the flag only, never status; without it, the old status behaviour", () => {
  assert.deepEqual(posSwitchPatch(item({ posEnabled: true }), false), { posEnabled: false });
  assert.deepEqual(posSwitchPatch(item({ posEnabled: false, status: "published" }), true), { posEnabled: true });
  assert.deepEqual(posSwitchPatch(item(), false), { status: "draft" });
  assert.deepEqual(posSwitchPatch(item({ status: "draft" }), true), { status: "published" });
});

test("the Channels tab writes the POS switch through posSwitchPatch", () => {
  const src = readFileSync(new URL("./item-tab-channels.tsx", import.meta.url), "utf8");
  assert.match(src, /posSwitchPatch\(item, next\)/);
  assert.doesNotMatch(src, /patch\(\{ status: next \? "published" : "draft" \}\)/);
});
