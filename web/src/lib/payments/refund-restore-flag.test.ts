/**
 * TUL-1310: a refund whose restore did not finish is shown to staff (Issues flag
 * + bell), not only logged.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { flagRestoreFailed } from "./refund-restore-step";
import { openPaymentReviewFlags } from "./payment-review-flags-model";
import { classifyPaymentFlag } from "@/lib/exceptions/model";
import { localizePaymentFlagRows } from "@/lib/exceptions/payment-flag-copy";
import { moneyStore } from "@/lib/talent-agenda/__fixtures__/money-store";

function store() {
  return moneyStore({
    booking_transactions: [
      { id: "x1", status: "refunded", source_tenant_id: "t1", booking_id: "b1", source_inquiry_id: null, updated_at: "2026-10-21T10:00:00.000Z", metadata: {} },
    ],
  });
}

test("a failed restore leaves one open refund_restore_failed flag and rings the bell once", async () => {
  const s = store();
  const rung: Array<{ reason: string; tenantId: string }> = [];
  const deps = { notify: (p: { reason: string; tenantId: string }) => void rung.push(p) };
  await flagRestoreFailed(s.admin as unknown as SupabaseClient, "x1", deps);
  await flagRestoreFailed(s.admin as unknown as SupabaseClient, "x1", deps); // webhook redelivery
  const flags = openPaymentReviewFlags(s.tables.booking_transactions[0]!.metadata);
  assert.deepEqual(flags.map((f) => f.reason), ["refund_restore_failed"]);
  assert.equal(rung.length, 1);
  assert.equal(rung[0]!.reason, "refund_restore_failed");
  assert.equal(s.tables.booking_transactions[0]!.status, "refunded", "no money or status is touched");
});

test("a missing transaction never throws (the webhook must not 500 over a flag)", async () => {
  const s = store();
  await assert.doesNotReject(flagRestoreFailed(s.admin as unknown as SupabaseClient, "nope", { notify: () => undefined }));
});

test("the Issues row says what to do, in the reader's language, with no 'check Stripe' for a restore", () => {
  const flag = openPaymentReviewFlags({
    payment_flags: [{ reason: "refund_restore_failed", payment_intent_id: null, stripe_event_id: "refund-restore:x1", flagged_at: "2026-10-21T10:00:00.000Z" }],
  })[0]!;
  const row = classifyPaymentFlag({ transactionId: "x1", orderId: "o1", flag }, "/acme/admin/orders?q=o1");
  assert.equal(row.nextAction.kind, "inspect");
  assert.match(row.nextAction.kind === "inspect" ? row.nextAction.label : "", /by hand/);
  const [es] = localizePaymentFlagRows([row], "es");
  assert.match(es!.title, /Reembolsado/);
  assert.ok(es!.nextAction.kind === "inspect" && /a mano/.test(es!.nextAction.label));
});

test("wiring: every way a restore can fall short raises the flag", () => {
  const step = readFileSync(join(process.cwd(), "src/lib/payments/refund-restore-step.ts"), "utf8");
  assert.match(step, /r\.admissionsIncomplete \|\| r\.capacityIncomplete \|\| r\.promoIncomplete\) await flagRestoreFailed/);
  assert.match(step, /outcome\.reason === "unavailable"\) await flagRestoreFailed/);
  assert.ok((step.match(/await flagRestoreFailed\(sb, transactionId\)/g) ?? []).length >= 3, "catch, unavailable and incomplete all flag");
});
