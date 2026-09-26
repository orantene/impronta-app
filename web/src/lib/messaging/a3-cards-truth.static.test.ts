/**
 * A3 / audit §0.5 — cards tell the truth.
 * Per-request sync, expired/cancelled/refunded states, currency + paid payload,
 * payment_paid with no sender still a card for the guest.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const web = join(process.cwd(), "src");

function read(rel: string): string {
  return readFileSync(join(web, rel), "utf8");
}

test("payment-card-sync maps expired/refunded/partially_refunded (not only paid)", () => {
  const src = read("lib/messaging/payment-card-sync.ts");
  assert.match(src, /expired:\s*"expired"/);
  assert.match(src, /refunded:\s*"refunded"/);
  assert.match(src, /partially_refunded:\s*"partially_refunded"/);
  assert.match(src, /cardsMatchingRequest/);
  assert.match(src, /paymentLinkCode/);
});

test("messagingRequestPayment stamps currency on the payment_request card", () => {
  const src = read("lib/server-actions/messaging-engine.ts");
  const fn = src.slice(src.indexOf("export async function messagingRequestPayment"), src.indexOf("export async function messagingCloseLost"));
  assert.match(fn, /currency/);
  assert.match(fn, /paymentLinkCode:\s*minted\.code/);
});

test("guest dock does not force payment_paid into a system note", () => {
  const src = read("app/t/[profileCode]/_actions/guest-chat-actions.ts");
  assert.match(src, /isClientCardKind/);
  assert.doesNotMatch(src, /!row\.sender_user_id \|\| row\.message_kind === "payment_paid"/);
});
