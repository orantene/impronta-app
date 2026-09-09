import { test } from "node:test";
import assert from "node:assert/strict";
import { STATE_AXES, pairedStateLabel, outcomeCta, errorCopy } from "./vocabulary";

test("six axes", () => {
  assert.equal(STATE_AXES.length, 6);
});

test("paired labels skip null axes", () => {
  assert.equal(
    pairedStateLabel({
      publication: "Published",
      commitment: "Confirmed",
      payment: "Deposit paid",
      fulfillment: null,
      attendance: null,
      delivery: null,
    }),
    "Published · Confirmed · Deposit paid",
  );
});

test("generic Continue is refused for money and capacity paths", () => {
  const r = outcomeCta("generic_continue");
  assert.equal(r.ok, false);
  assert.equal(outcomeCta("collect_deposit").ok, true);
});

test("error vocabulary is locale-paired", () => {
  assert.match(errorCopy("slot_taken", "es"), /horario/);
});
