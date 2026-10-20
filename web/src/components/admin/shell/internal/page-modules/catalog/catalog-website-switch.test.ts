import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import { offeringPriceLabel, type TalentOffering } from "@/lib/talent/offerings-types";
import { websiteSwitchPatch } from "./catalog-website-switch";

type Item = Pick<TalentOffering, "visibility" | "priceDisplay" | "priceType" | "amountCents" | "currency">;
const onRequest: Item = { visibility: "on_request", priceDisplay: "exact", priceType: "flat_package", amountCents: 45000, currency: "USD" };

function apply(item: Item, patch: Partial<Item>): Item {
  return { ...item, ...patch };
}
const label = (i: Item) => offeringPriceLabel(i, "en");

describe("Catalog Website switch keeps price-on-request items on request (TUL-1329)", () => {
  test("on_request item: switch off, switch on, the public price line never shows the price", () => {
    const off = apply(onRequest, websiteSwitchPatch(onRequest, false));
    assert.equal(off.visibility, "agency_only");
    const back = apply(off, websiteSwitchPatch(off, true));
    assert.notEqual(back.visibility, "public");
    assert.doesNotMatch(label(back), /450|\$/);
    assert.match(label(back), /request/i);
  });

  test("a quote-priced item re-enabled goes back on request, not public", () => {
    const quote: Item = { ...onRequest, visibility: "agency_only", priceDisplay: "quote", amountCents: null };
    assert.equal(websiteSwitchPatch(quote, true).visibility, "on_request");
  });

  test("an ordinary priced item still goes public and keeps its price", () => {
    const plain: Item = { ...onRequest, visibility: "agency_only" };
    assert.equal(websiteSwitchPatch(plain, true).visibility, "public");
    assert.equal("priceDisplay" in websiteSwitchPatch(plain, true), false);
    assert.equal(websiteSwitchPatch({ ...plain, visibility: "public" }, false).visibility, "agency_only");
  });

  test("the Channels tab routes the Website switch through the helper", () => {
    const src = readFileSync(new URL("./item-tab-channels.tsx", import.meta.url), "utf8");
    assert.match(src, /patch\(websiteSwitchPatch\(item, next\)\)/);
  });
});
