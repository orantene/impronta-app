import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  FAILED_REFUND_ATTENTION,
  applyFailedRefundSettlement,
  failedRefundAttentionNote,
  flagFailedRefundSettlement,
  isFailedRefundAttention,
} from "./failed-refund-settlement";
import { moneyStore } from "@/lib/talent-agenda/__fixtures__/money-store";

const baseInput = {
  refundId: "re_fail_1",
  status: "failed",
  failureReason: "lost_or_stolen_card",
  amountCents: 30000,
  currency: "mxn",
  nowIso: "2026-10-08T18:00:00.000Z",
};

function refundStore(meta: Record<string, unknown> = {}) {
  return moneyStore({
    booking_transactions: [
      {
        id: "rx1",
        status: "refunded",
        provider_refund_id: "re_fail_1",
        metadata: { prior: true, ...meta },
      },
    ],
  });
}

test("flagFailedRefundSettlement stamps needs_attention=refund_failed with actionable ids", async () => {
  const s = refundStore();
  const result = await flagFailedRefundSettlement(s.admin, {
    ...baseInput,
    transactionId: "rx1",
  });
  assert.equal(result.ok, true);
  const meta = s.tables.booking_transactions[0]!.metadata as Record<string, unknown>;
  assert.equal(meta.needs_attention, FAILED_REFUND_ATTENTION);
  assert.equal(meta.failed_refund_id, "re_fail_1");
  assert.equal(meta.failed_refund_status, "failed");
  assert.equal(meta.failed_refund_reason, "lost_or_stolen_card");
  assert.equal(meta.failed_refund_amount_cents, 30000);
  assert.equal(meta.failed_refund_currency, "MXN");
  assert.equal(meta.needs_attention_at, "2026-10-08T18:00:00.000Z");
  assert.equal(meta.prior, true, "existing metadata is kept");
  assert.match(String(meta.needs_attention_note), /re_fail_1/);
  assert.match(String(meta.needs_attention_note), /300\.00 MXN/);
  assert.match(String(meta.needs_attention_note), /alternative refund/i);
  assert.ok(!String(meta.needs_attention_note).includes("USD"));
});

test("flagging twice is idempotent", async () => {
  const s = refundStore();
  await flagFailedRefundSettlement(s.admin, { ...baseInput, transactionId: "rx1" });
  const writes = s.writes.length;
  await flagFailedRefundSettlement(s.admin, { ...baseInput, transactionId: "rx1" });
  assert.equal(s.writes.length, writes);
});

test("applyFailedRefundSettlement resolves by provider_refund_id and stamps", async () => {
  const s = refundStore();
  const out = await applyFailedRefundSettlement(s.admin, baseInput);
  assert.equal(out.flagged, true);
  assert.equal(out.transactionId, "rx1");
  assert.equal(
    (s.tables.booking_transactions[0]!.metadata as Record<string, unknown>).needs_attention,
    FAILED_REFUND_ATTENTION,
  );
});

test("applyFailedRefundSettlement with no matching row does not invent a stamp", async () => {
  const s = moneyStore({
    booking_transactions: [
      { id: "other", status: "refunded", provider_refund_id: "re_other", metadata: {} },
    ],
  });
  const out = await applyFailedRefundSettlement(s.admin, baseInput);
  assert.equal(out.flagged, false);
  assert.equal(out.transactionId, null);
  assert.equal(s.writes.length, 0);
});

test("isFailedRefundAttention and note helpers", () => {
  assert.equal(isFailedRefundAttention(null), false);
  assert.equal(isFailedRefundAttention({ needs_attention: "paid_after_cancellation" }), false);
  assert.equal(isFailedRefundAttention({ needs_attention: FAILED_REFUND_ATTENTION }), true);
  assert.equal(
    failedRefundAttentionNote({
      needs_attention: FAILED_REFUND_ATTENTION,
      needs_attention_note: "Customer was not paid.",
    }),
    "Customer was not paid.",
  );
  assert.equal(failedRefundAttentionNote({ needs_attention: "other" }), null);
});

test("webhook-handler refund_settlement calls applyFailedRefundSettlement and keeps the loud log", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/stripe/webhook-handler.ts"), "utf8");
  assert.match(src, /applyFailedRefundSettlement/);
  assert.match(src, /from "@\/lib\/payments\/failed-refund-settlement"/);
  const start = src.indexOf('case "refund_settlement"');
  assert.ok(start > 0);
  const body = src.slice(start, src.indexOf("case \"invoice_payment_succeeded\"", start));
  assert.match(body, /logServerError\(\s*"stripe-webhook\.refund\.failed"/);
  assert.match(body, /applyFailedRefundSettlement\(/);
  assert.ok(!/status:\s*["']paid["']/.test(body), "must not auto-revert refunded state");
});

test("admin RefundsTab shows coral failed state for refund_failed attention", () => {
  const tabs = readFileSync(
    join(process.cwd(), "src/app/(workspace)/[tenantSlug]/admin/payments/payments-tabs.tsx"),
    "utf8",
  );
  assert.match(tabs, /isFailedRefundAttention|FAILED_REFUND_ATTENTION|refundFailed/);
  assert.match(tabs, /tone="coral"/);
  const activity = readFileSync(
    join(process.cwd(), "src/app/(workspace)/[tenantSlug]/_data-bridge/payments-activity.ts"),
    "utf8",
  );
  assert.match(activity, /metadata/);
  assert.match(activity, /FAILED_REFUND_ATTENTION|isFailedRefundAttention|failedRefund/);
});
