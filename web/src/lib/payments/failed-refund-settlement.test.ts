import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  FAILED_REFUND_ATTENTION,
  applyFailedRefundSettlement,
  emitFailedRefundBells,
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

test("needs_attention_note is zero-decimal aware (TUL-375)", async () => {
  const s = refundStore();
  await flagFailedRefundSettlement(s.admin, {
    ...baseInput,
    transactionId: "rx1",
    amountCents: 4500,
    currency: "jpy",
  });
  const note = String(
    (s.tables.booking_transactions[0]!.metadata as Record<string, unknown>).needs_attention_note,
  );
  assert.match(note, /4,500 JPY/);
  assert.doesNotMatch(note, /45\.00/);
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
  assert.equal(out.transaction?.id, "rx1");
  assert.equal(out.transaction?.matchPath, "provider_refund_id");
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
  assert.equal(out.transaction, null);
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

test("webhook-handler refund_settlement delegates to handleFailedRefundWebhookAction (no auto-revert)", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/stripe/webhook-handler.ts"), "utf8");
  assert.match(src, /handleFailedRefundWebhookAction/);
  assert.match(src, /from "@\/lib\/payments\/failed-refund-settlement"/);
  const start = src.indexOf('case "refund_settlement"');
  assert.ok(start > 0);
  const body = src.slice(start, src.indexOf("case \"invoice_payment_succeeded\"", start));
  assert.match(body, /handleFailedRefundWebhookAction\(/);
  assert.ok(!/status:\s*["']paid["']/.test(body), "must not auto-revert refunded state");

  const settlement = readFileSync(
    join(process.cwd(), "src/lib/payments/failed-refund-settlement.ts"),
    "utf8",
  );
  assert.match(settlement, /logServerError\(\s*"stripe-webhook\.refund\.failed"/);
  assert.match(settlement, /applyFailedRefundSettlement\(/);
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

test("a DIFFERENT needs_attention is kept: only the failed_refund_* keys are written (talent_residual, order_lines_mismatch)", async () => {
  for (const other of ["talent_residual", "order_lines_mismatch"]) {
    const s = refundStore({ needs_attention: other, needs_attention_note: "keep me", needs_attention_at: "2026-10-01T00:00:00.000Z", talent_residual_cents: 30000 });
    const result = await flagFailedRefundSettlement(s.admin, { ...baseInput, transactionId: "rx1" });
    assert.deepEqual(result, { ok: true, newlyFlagged: true });
    const meta = s.tables.booking_transactions[0]!.metadata as Record<string, unknown>;
    assert.equal(meta.needs_attention, other, `${other} survives`);
    assert.equal(meta.needs_attention_note, "keep me");
    assert.equal(meta.needs_attention_at, "2026-10-01T00:00:00.000Z");
    assert.equal(meta.talent_residual_cents, 30000);
    assert.equal(meta.failed_refund_id, "re_fail_1");
    assert.equal(meta.failed_refund_status, "failed");
    assert.equal(meta.failed_refund_amount_cents, 30000);
  }
});

test("the same failed refund delivered under a different flag is still idempotent (keyed on failed_refund_id)", async () => {
  const s = refundStore({ needs_attention: "talent_residual" });
  await flagFailedRefundSettlement(s.admin, { ...baseInput, transactionId: "rx1" });
  const writes = s.writes.length;
  const again = await flagFailedRefundSettlement(s.admin, { ...baseInput, transactionId: "rx1" });
  assert.equal(again.newlyFlagged, false);
  assert.equal(s.writes.length, writes);
});

test("bells fire once per distinct failed refund: delivering the same event twice rings one bell pair", async () => {
  const s = refundStore();
  const calls: string[] = [];
  const deps = {
    notifyRefundFailed: () => { calls.push("refund.failed"); },
    notifyPaymentNeedsAttention: () => { calls.push("payment.needs_attention"); },
  };
  const evt = { refundId: "re_fail_1", status: "failed", failureReason: "lost_or_stolen_card", amount: 30000, currency: "mxn" };
  for (let i = 0; i < 2; i += 1) {
    const r = await applyFailedRefundSettlement(s.admin, { ...baseInput });
    const tx = r.transaction ? { ...r.transaction, sourceTenantId: "tenant-1" } : null;
    emitFailedRefundBells({ newlyFlagged: r.newlyFlagged, transaction: tx }, evt, deps as never);
  }
  assert.deepEqual(calls, ["refund.failed", "payment.needs_attention"]);
});

test("no bell without a newly flagged stamp or without a tenant", () => {
  const calls: string[] = [];
  const deps = { notifyRefundFailed: () => { calls.push("a"); }, notifyPaymentNeedsAttention: () => { calls.push("b"); } };
  const tx = { id: "rx1", sourceTenantId: "t1", bookingId: null, inquiryId: null, matchPath: "provider_refund_id" as const };
  const evt = { refundId: "re_x", status: "failed", failureReason: null, amount: 100, currency: "mxn" };
  emitFailedRefundBells({ newlyFlagged: false, transaction: tx }, evt, deps as never);
  emitFailedRefundBells({ newlyFlagged: true, transaction: { ...tx, sourceTenantId: null } }, evt, deps as never);
  assert.deepEqual(calls, []);
});
