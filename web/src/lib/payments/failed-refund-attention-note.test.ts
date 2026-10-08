import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildFailedRefundAttentionNote,
  formatFailedRefundMoney,
} from "./failed-refund-attention-note";

test("two-decimal MXN note keeps cents and currency code", () => {
  const note = buildFailedRefundAttentionNote({
    refundId: "re_fail_1",
    status: "failed",
    failureReason: "lost_or_stolen_card",
    amountCents: 30000,
    currency: "mxn",
  });
  assert.match(note, /re_fail_1/);
  assert.match(note, /300\.00 MXN/);
  assert.match(note, /alternative refund/i);
  assert.ok(!note.includes("USD"));
  assert.equal(formatFailedRefundMoney(30000, "mxn"), "300.00 MXN");
});

test("zero-decimal JPY is not divided by 100", () => {
  // 4500 yen as minor units is 4500, not 45.00.
  assert.equal(formatFailedRefundMoney(4500, "JPY"), "4,500 JPY");
  const note = buildFailedRefundAttentionNote({
    refundId: "re_jpy",
    status: "failed",
    failureReason: "generic_decline",
    amountCents: 4500,
    currency: "jpy",
  });
  assert.match(note, /4,500 JPY/);
  assert.doesNotMatch(note, /45\.00/);
});

test("zero-decimal CLP is not divided by 100", () => {
  assert.equal(formatFailedRefundMoney(12500, "CLP"), "12,500 CLP");
  const note = buildFailedRefundAttentionNote({
    refundId: "re_clp",
    status: "canceled",
    failureReason: null,
    amountCents: 12500,
    currency: "clp",
  });
  assert.match(note, /12,500 CLP/);
  assert.match(note, /reason=unspecified/);
  assert.doesNotMatch(note, /125\.00/);
});

test("webhook refund_settlement log does not hard-code amount/100", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/stripe/webhook-handler.ts"), "utf8");
  const start = src.indexOf('case "refund_settlement"');
  assert.ok(start > 0);
  const nextCase = src.indexOf('case "', start + 1);
  const body = src.slice(start, nextCase > 0 ? nextCase : undefined);
  assert.match(body, /formatFailedRefundMoney|handleFailedRefundWebhookAction/);
  assert.doesNotMatch(body, /amount\s*\/\s*100\s*\)\s*\.toFixed/);
});
