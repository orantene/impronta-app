import assert from "node:assert/strict";
import { test } from "node:test";

import { clientFeeLines } from "@/lib/billing/processing-fee-payer";

import { validClientFeeLines } from "./fee-lines-payload";

const snap = {
  gross_cents: 10000,
  gross_charged_cents: 10150,
  client_surcharge_cents: 150,
  talent_net_cents: 10000,
  workspace_fee_cents: 0,
  channel_referral_cents: 0,
  seller_of_record: "talent" as const,
};

test("engine lines that sum to the charge pass through", () => {
  const lines = clientFeeLines(snap);
  assert.deepEqual(validClientFeeLines(lines, 10150), lines);
});

test("client-paid processing line is kept and still sums", () => {
  const lines = clientFeeLines({ ...snap, gross_charged_cents: 10480, client_processing_fee_cents: 330 });
  assert.equal(validClientFeeLines(lines, 10480).length, 4);
});

test("a deposit (charge differs from total) yields no breakdown", () => {
  assert.deepEqual(validClientFeeLines(clientFeeLines(snap), 5000), []);
});

test("lines that do not add up, junk, or missing data yield []", () => {
  assert.deepEqual(
    validClientFeeLines(
      [
        { code: "service_subtotal", cents: 10000 },
        { code: "total_charged", cents: 10150 },
      ],
      10150,
    ),
    [],
  );
  assert.deepEqual(validClientFeeLines([{ code: "net_payout", cents: 1 }, { code: "total_charged", cents: 1 }], 1), []);
  assert.deepEqual(validClientFeeLines("x", 1), []);
  assert.deepEqual(validClientFeeLines(undefined, 1), []);
  assert.deepEqual(validClientFeeLines(clientFeeLines(snap), null), []);
});
