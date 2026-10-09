/**
 * TUL-391 / #2959 — ONE stamper is failed-refund-settlement (post-#2909).
 * This file keeps the orphan-lane enrollment name while asserting settlement
 * behavior the money pre-review asked for (PI fallback + refund-id stamp key).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  FAILED_REFUND_ATTENTION,
  applyFailedRefundSettlement,
  findRefundTransactionForFailedSettlement,
  flagFailedRefundSettlement,
} from "./failed-refund-settlement";
import { moneyStore } from "@/lib/talent-agenda/__fixtures__/money-store";

test("flagFailedRefundSettlement stamps needs_attention=refund_failed once per refund id", async () => {
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
  const first = await flagFailedRefundSettlement(s.admin, {
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

  const second = await flagFailedRefundSettlement(s.admin, {
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

test("PI fallback: second distinct refund on same payment row re-stamps + newlyFlagged", async () => {
  const s = moneyStore({
    booking_transactions: [
      {
        id: "tx-pay",
        source_tenant_id: "t1",
        booking_id: "b1",
        source_inquiry_id: "i1",
        currency: "mxn",
        provider_metadata: { payment_intent_id: "pi_shared" },
        metadata: {
          needs_attention: FAILED_REFUND_ATTENTION,
          failed_refund_id: "re_first",
        },
      },
    ],
  });
  const hit = await findRefundTransactionForFailedSettlement(s.admin, {
    refundId: "re_second",
    paymentIntentId: "pi_shared",
  });
  assert.equal(hit?.id, "tx-pay");
  assert.equal(hit?.matchPath, "payment_intent_id");

  const out = await applyFailedRefundSettlement(s.admin, {
    refundId: "re_second",
    status: "failed",
    failureReason: "expired_or_canceled_card",
    amountCents: 10000,
    currency: "mxn",
    paymentIntentId: "pi_shared",
  });
  assert.equal(out.newlyFlagged, true);
  assert.equal(out.transaction?.matchPath, "payment_intent_id");
  const meta = s.tables.booking_transactions[0]!.metadata as Record<string, unknown>;
  assert.equal(meta.failed_refund_id, "re_second");
});

test("PI fallback: ambiguous multi-row match does not stamp", async () => {
  const s = moneyStore({
    booking_transactions: [
      {
        id: "tx-a",
        provider_metadata: { payment_intent_id: "pi_dup" },
        metadata: {},
      },
      {
        id: "tx-b",
        provider_metadata: { payment_intent_id: "pi_dup" },
        metadata: {},
      },
    ],
  });
  const hit = await findRefundTransactionForFailedSettlement(s.admin, {
    refundId: "re_x",
    paymentIntentId: "pi_dup",
  });
  assert.equal(hit, null);
  const out = await applyFailedRefundSettlement(s.admin, {
    refundId: "re_x",
    status: "failed",
    failureReason: null,
    amountCents: 100,
    currency: "usd",
    paymentIntentId: "pi_dup",
  });
  assert.equal(out.flagged, false);
  assert.equal(s.writes.length, 0);
});

test("findRefundTransactionForFailedSettlement resolves by provider_refund_id first", async () => {
  const withRefund = moneyStore({
    booking_transactions: [
      {
        id: "tx-re",
        provider_refund_id: "re_9",
        source_tenant_id: "t1",
        booking_id: "b1",
        source_inquiry_id: "i1",
        currency: "usd",
        provider_metadata: { payment_intent_id: "pi_9" },
      },
    ],
  });
  const hit = await findRefundTransactionForFailedSettlement(withRefund.admin, {
    refundId: "re_9",
    paymentIntentId: "pi_9",
  });
  assert.equal(hit?.id, "tx-re");
  assert.equal(hit?.matchPath, "provider_refund_id");
  assert.equal(hit?.sourceTenantId, "t1");
  assert.equal(hit?.inquiryId, "i1");
});

test("webhook refund_settlement uses ONE stamper + TUL-391 producers", () => {
  const handler = readFileSync(join(process.cwd(), "src/lib/stripe/webhook-handler.ts"), "utf8");
  const start = handler.indexOf('case "refund_settlement"');
  assert.ok(start > 0);
  const dispatch = handler.slice(start, handler.indexOf('case "invoice_payment_succeeded"'));
  assert.match(dispatch, /handleFailedRefundWebhookAction\(/);
  assert.match(handler, /from ["']@\/lib\/payments\/failed-refund-settlement["']/);

  const settlement = readFileSync(
    join(process.cwd(), "src/lib/payments/failed-refund-settlement.ts"),
    "utf8",
  );
  assert.match(settlement, /applyFailedRefundSettlement\(/);
  assert.match(settlement, /notifyRefundFailed\(/);
  assert.match(settlement, /notifyPaymentNeedsAttention\(/);
  assert.match(settlement, /newlyFlagged/);
  assert.match(settlement, /matchPath/);
  assert.match(settlement, /failed_refund_id === input\.refundId/);
  // Dead dual-stamper must not remain.
  assert.equal(existsSync(join(process.cwd(), "src/lib/payments/failed-refund-attention.ts")), false);
});

test("paid-after-cancel flag emits payment.needs_attention on first stamp", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/payments/paid-after-cancel.ts"), "utf8");
  assert.match(src, /notifyPaymentNeedsAttention\(/);
  assert.match(src, /PAID_AFTER_CANCEL_ATTENTION/);
});
