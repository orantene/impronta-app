/**
 * TUL-1332 PR 1 [MONEY]: the online menu order carries the chosen option and
 * extras into the purchase (the server prices them from the catalog rows).
 *
 * Run: node_modules/.bin/tsx --test src/lib/orders/menu-order-lines.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { toPurchaseLines } from "./menu-order-lines";
import {
  choiceFor,
  lineChoiceMissing,
  optionPriceLabel,
  type MenuChoiceOffering,
} from "../site-admin/builder-node/menu-board-choices";

const V1 = "11111111-1111-4111-8111-111111111111";
const A1 = "22222222-2222-4222-8222-222222222222";
const A2 = "33333333-3333-4333-8333-333333333333";
const OFF = "44444444-4444-4444-8444-444444444444";

test("toPurchaseLines: option and extras ride along, ids validated, extras deduped and capped", () => {
  const out = toPurchaseLines([{ offeringId: OFF, quantity: 2, variantId: V1, addonIds: [A1, A2, A1] }]);
  assert.deepEqual(out, [{ offeringId: OFF, units: 2, variantId: V1, addonIds: [A1, A2] }]);
  assert.equal(toPurchaseLines([{ offeringId: OFF, quantity: 1, addonIds: Array.from({ length: 40 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`) }])[0]!.addonIds!.length, 20);
});

test("toPurchaseLines: a line with no choice is the plain line; junk ids are dropped, never sent as prices", () => {
  assert.deepEqual(toPurchaseLines([{ offeringId: OFF, quantity: 1 }]), [{ offeringId: OFF, units: 1 }]);
  const junk = toPurchaseLines([{ offeringId: OFF, quantity: 1, variantId: "not-a-uuid", addonIds: ["x", A1] }]);
  assert.equal(junk[0]!.variantId, undefined);
  assert.deepEqual(junk[0]!.addonIds, [A1]);
});

const dish: MenuChoiceOffering = {
  id: OFF,
  amountCents: null,
  currency: "MXN",
  options: [
    { id: V1, label: "Small", amountCents: 9000 },
    { id: "v2", label: "Large", amountCents: 14000 },
  ],
  extras: [{ id: A1, label: "Cheese", amountCents: 1500 }],
};

test("lineChoiceMissing: an offering with options needs one chosen; without options it never blocks", () => {
  assert.equal(lineChoiceMissing(dish, undefined), true);
  assert.equal(lineChoiceMissing(dish, { variantId: null, addonIds: [] }), true);
  assert.equal(lineChoiceMissing(dish, { variantId: V1, addonIds: [] }), false);
  assert.equal(lineChoiceMissing({ ...dish, options: [] }, undefined), false);
  assert.equal(lineChoiceMissing({ ...dish, options: undefined }, undefined), false);
});

test("choiceFor: only options and extras that still exist survive a refresh", () => {
  assert.deepEqual(choiceFor(dish, { variantId: V1, addonIds: [A1, "gone"] }), { variantId: V1, addonIds: [A1] });
  assert.deepEqual(choiceFor(dish, { variantId: "gone", addonIds: [] }), { variantId: null, addonIds: [] });
});

test("optionPriceLabel: the option's own price; no price shows nothing (never a $0)", () => {
  assert.equal(optionPriceLabel({ id: "x", label: "Small", amountCents: 9000 }, "MXN", (c, cur) => `${cur} ${c / 100}`), "Small · MXN 90");
  assert.equal(optionPriceLabel({ id: "x", label: "Small", amountCents: null }, "MXN", (c, cur) => `${cur} ${c / 100}`), "Small");
});

const src = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

test("wiring: the action uses the mapper, passes the new refusals through; the island sends the choice", () => {
  const action = src("../../app/(public)/_menu/menu-order-actions.ts");
  assert.match(action, /toPurchaseLines\(input\.lines\)/);
  assert.match(action, /variant_required/);
  const island = src("../site-admin/builder-node/menu-board-island.tsx");
  assert.match(island, /variantId:/);
  assert.match(island, /addonIds:/);
  assert.match(island, /lineChoiceMissing\(/);
  const data = src("../site-admin/server/native-data-block-sources.ts");
  assert.match(data, /options/);
  assert.match(data, /extras/);
});

test("ES and EN strings exist for the picker", () => {
  for (const l of ["en", "es"]) {
    const m = JSON.parse(readFileSync(new URL(`../../../messages/${l}.json`, import.meta.url), "utf8")).public.menuBoard;
    assert.ok(m.chooseOption && m.extrasLabel, l);
  }
  const es = JSON.parse(readFileSync(new URL("../../../messages/es.json", import.meta.url), "utf8")).public.menuBoard;
  assert.equal(es.chooseOption, "Elige una opción");
});
