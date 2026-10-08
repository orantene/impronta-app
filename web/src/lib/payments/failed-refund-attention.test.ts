import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  FAILED_REFUND_ATTENTION,
  flagFailedRefundAttention,
  findTransactionForFailedRefund,
} from "./failed-refund-attention";
import { moneyStore } from "@/lib/talent-agenda/__fixtures__/money-store";

test("flagFailedRefundAttention stamps needs_attention=refund_failed once", async () => {
  const s = moneyStore({
    booking_transactions: [
      {
        id: "tx-1",
        provider_refund_id: "re_1",
        source_tenant_id: "t1",
        booking_id: "b1",
        source_inquiry_id: "i1",
        currency: "mxn",
        metadata: { keep: true },
      },
    ],
  });
  const first = await flagFailedRefundAttention(s.admin, {
    transactionId: "tx-1",
    refundId: "re_1",
    status: "failed",
    failureReason: "lost_or_stolen_card",
    amountCents: 50000,
    currency: "mxn",
  });
  assert.equal(first.ok, true);
  assert.equal(first.newlyFlagged, true);
  const meta = s.tables.booking_transactions[0]!.metadata as Record<string, unknown>;
  assert.equal(meta.needs_attention, FAILED_REFUND_ATTENTION);
  assert.equal(meta.keep, true);
  assert.equal(meta.failed_refund_id, "re_1");
  assert.match(String(meta.needs_attention_note), /not paid/i);

  const second = await flagFailedRefundAttention(s.admin, {
    transactionId: "tx-1",
    refundId: "re_1",
    status: "failed",
    failureReason: "lost_or_stolen_card",
    amountCents: 50000,
    currency: "mxn",
  });
  assert.equal(second.newlyFlagged, false);
  assert.equal(s.writes.length, 1);
});

test("findTransactionForFailedRefund resolves by provider_refund_id", async () => {
  const withRefund = moneyStore({
    booking_transactions: [
      {
        id: "tx-re",
        provider_refund_id: "re_9",
        source_tenant_id: "t1",
        booking_id: "b1",
        source_inquiry_id: "i1",
        currency: "usd",
      },
    ],
  });
  const hit = await findTransactionForFailedRefund(withRefund.admin, {
    refundId: "re_9",
    paymentIntentId: "pi_9",
  });
  assert.equal(hit?.id, "tx-re");
  assert.equal(hit?.sourceTenantId, "t1");
  assert.equal(hit?.inquiryId, "i1");
});

test("webhook refund_settlement stamps attention and emits TUL-391 producers", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/stripe/webhook-handler.ts"), "utf8");
  const start = src.indexOf('case "refund_settlement"');
  assert.ok(start > 0);
  const body = src.slice(start, src.indexOf('case "invoice_payment_succeeded"'));
  assert.match(body, /applyFailedRefundAttention\(/);
  assert.match(body, /notifyRefundFailed\(/);
  assert.match(body, /notifyPaymentNeedsAttention\(/);
  assert.match(body, /newlyFlagged/);
});

test("paid-after-cancel flag emits payment.needs_attention on first stamp", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/payments/paid-after-cancel.ts"), "utf8");
  assert.match(src, /notifyPaymentNeedsAttention\(/);
  assert.match(src, /PAID_AFTER_CANCEL_ATTENTION/);
});
