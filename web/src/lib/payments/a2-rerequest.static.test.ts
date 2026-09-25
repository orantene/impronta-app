/**
 * A2 / defect #14 — re-request after expiry must not reuse a dead operation key.
 * Call sites mint with `*PaymentRequestKey` + `newPaymentRequestAttemptId`.
 * Snapshots are written only after a successful mint.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const web = join(process.cwd(), "src");

function read(rel: string): string {
  return readFileSync(join(web, rel), "utf8");
}

test("PaymentRequest sheet keys with attempt helper, not a stable amountKind-only key", () => {
  const src = read("components/messages-v5/screens/sheets/PaymentRequest.tsx");
  assert.match(src, /msgv5PaymentRequestKey/);
  assert.match(src, /newPaymentRequestAttemptId/);
  assert.doesNotMatch(src, /idempotencyKey:\s*`msgv5-pay-\$\{inquiryId\}-\$\{selectedTarget\.recordId\}-\$\{amountKind\}`/);
});

test("MessagesShell v4 keys with attempt helper", () => {
  const src = read("components/admin/pos/messages/MessagesShell.tsx");
  assert.match(src, /messagesShellPaymentRequestKey/);
  assert.match(src, /newPaymentRequestAttemptId/);
  assert.doesNotMatch(src, /idempotencyKey:\s*`pay-\$\{active\.id\}-\$\{chip\.recordId\}`/);
});

test("Agenda pay request and finish-card keys with attempt helper", () => {
  const agenda = read("components/admin/shell/internal/talent/agenda/AgendaPayRequest.tsx");
  assert.match(agenda, /agendaPayRequestKey/);
  assert.match(agenda, /newPaymentRequestAttemptId/);
  const finish = read("lib/talent-agenda/booking-actions.ts");
  assert.match(finish, /agendaFinishCardPayKey/);
  assert.match(finish, /newPaymentRequestAttemptId/);
});

test("createPaymentLink frees expired/cancelled operation keys instead of returning expired", () => {
  const src = read("lib/payments/links.ts");
  assert.match(src, /freeExpiredKey|was:\$\{row\.status\}/);
  assert.doesNotMatch(
    src,
    /if \(row\.status === "expired" \|\| row\.status === "cancelled"\) return \{ ok: false, reason: "expired" \}/,
  );
});

test("messagingRequestPayment writes checkout_snapshots only after a successful mint", () => {
  const src = read("lib/server-actions/messaging-engine.ts");
  const mintIdx = src.indexOf("const minted = await createPaymentLink");
  const snapIdx = src.indexOf('checkout_snapshots", g.tenantId)');
  // Prefer the insert that follows mint in messagingRequestPayment.
  const requestFn = src.indexOf("export async function messagingRequestPayment");
  const nextFn = src.indexOf("export async function messagingCloseLost");
  const body = src.slice(requestFn, nextFn);
  const mintInFn = body.indexOf("const minted = await createPaymentLink");
  const snapInFn = body.indexOf("checkout_snapshots");
  assert.ok(mintInFn >= 0 && snapInFn >= 0);
  assert.ok(mintInFn < snapInFn, "snapshot insert must follow createPaymentLink");
  assert.ok(!body.includes("if (snapshot.error || !snapshot.data) return fail(\"unavailable\")"));
});
