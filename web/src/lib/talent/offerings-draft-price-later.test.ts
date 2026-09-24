/** A draft can be saved before its price so photos come first (2026-09-23). */
import { test } from "node:test";
import assert from "node:assert/strict";

import { blankOffering, validateOffering, type TalentOffering } from "./offerings-types";

function draft(p: Partial<TalentOffering>): TalentOffering {
  return { ...blankOffering("tp-1", "MXN", 0), title: "Gel semipermanente · pies", ...p };
}

test("a request draft with no price saves", () => {
  assert.deepEqual(validateOffering(draft({ status: "draft", bookingMode: "request", amountCents: null })), []);
});

test("publishing still needs the price", () => {
  const errs = validateOffering(draft({ status: "published", bookingMode: "request", amountCents: null }));
  assert.ok(errs.some((e) => e.includes("needs a price")));
});

test("an instant draft still needs its exact price (the database refuses it otherwise)", () => {
  const errs = validateOffering(draft({ status: "draft", bookingMode: "instant", amountCents: null }));
  assert.ok(errs.some((e) => e.includes("Direct booking needs one exact price")));
});

test("a negative price is refused even on a draft", () => {
  const errs = validateOffering(draft({ status: "draft", bookingMode: "request", amountCents: -100 }));
  assert.ok(errs.length > 0);
});
