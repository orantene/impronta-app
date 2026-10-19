import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { guardPaidAfterCancellation, PAID_AFTER_CANCEL_ATTENTION } from "./paid-after-cancel";
import { moneyStore } from "@/lib/talent-agenda/__fixtures__/money-store";

function store(bookingStatus: string, orderStatus: string) {
  return moneyStore({
    agency_bookings: [{ id: "b1", status: bookingStatus }],
    orders: [{ id: "o1", status: orderStatus }],
    booking_transactions: [{ id: "x1", order_id: "o1", status: "paid", metadata: { payment_link: "l1" } }],
  });
}

test("a payment landing after the booking was cancelled is flagged for a manual refund", async () => {
  const s = store("cancelled", "cancelled");
  const late = await guardPaidAfterCancellation(s.admin, { transactionId: "x1", bookingId: "b1" });
  assert.equal(late, true);
  const meta = s.tables.booking_transactions[0]!.metadata as Record<string, unknown>;
  assert.equal(meta.needs_attention, PAID_AFTER_CANCEL_ATTENTION);
  assert.match(String(meta.needs_attention_note), /refund manually/i);
  assert.equal(meta.payment_link, "l1", "existing metadata is kept");
  assert.equal(s.tables.agency_bookings[0]!.status, "cancelled", "the booking is never re-confirmed");
});

test("the order alone being cancelled is enough (booking id unknown to the money row)", async () => {
  const s = store("confirmed", "cancelled");
  assert.equal(await guardPaidAfterCancellation(s.admin, { transactionId: "x1", bookingId: null }), true);
});

test("a normal payment is not flagged", async () => {
  const s = store("confirmed", "pending_payment");
  assert.equal(await guardPaidAfterCancellation(s.admin, { transactionId: "x1", bookingId: "b1" }), false);
  const meta = s.tables.booking_transactions[0]!.metadata as Record<string, unknown>;
  assert.equal(meta.needs_attention, undefined);
});

test("flagging twice is idempotent", async () => {
  const s = store("cancelled", "cancelled");
  await guardPaidAfterCancellation(s.admin, { transactionId: "x1", bookingId: "b1" });
  const writes = s.writes.length;
  await guardPaidAfterCancellation(s.admin, { transactionId: "x1", bookingId: "b1" });
  assert.equal(s.writes.length, writes);
});

test("markPaid gates confirm, booking sync, payout and order completion on the guard", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/bookings/transactions.ts"), "utf8");
  const body = src.slice(src.indexOf("export async function markPaid("), src.indexOf("export async function initiatePayout("));
  assert.match(body, /guardPaidAfterCancellation\(/);
  for (const gate of [
    /sourceInquiryId && !paidAfterCancel/,
    /bookingId && !paidAfterCancel/,
    /!isDeposit && !paidAfterCancel\) \{\s*notifyBookingConfirmed|sourceInquiryId && !isDeposit && !paidAfterCancel/,
    /paidAfterCancel\s*\?\s*\(\{ ok: false, reason: "no_order" \}/,
  ]) {
    assert.match(body, gate);
  }
  // The payout fan-out must run ONLY inside an `if (!isDeposit && !paidAfterCancel) { ... }` block.
  // Asserted structurally (brace-matched), not by layout, so steps added before the transfer call
  // (e.g. the order-backed attribution heal) cannot silently break the check or hide a lost gate.
  let transfersGated = false;
  for (const m of body.matchAll(/if \(!isDeposit && !paidAfterCancel\) \{/g)) {
    const open = (m.index ?? 0) + m[0].length - 1;
    let depth = 0;
    let end = -1;
    for (let i = open; i < body.length; i++) {
      if (body[i] === "{") depth++;
      else if (body[i] === "}" && --depth === 0) { end = i; break; }
    }
    if (end > open && body.slice(open, end).includes("await executeBookingTransfers(")) transfersGated = true;
  }
  assert.ok(transfersGated, "executeBookingTransfers must be inside an `if (!isDeposit && !paidAfterCancel)` block");
  // And it must not be called anywhere else in markPaid.
  assert.equal(body.split("await executeBookingTransfers(").length - 1, 1, "markPaid has exactly one transfer call");
});

test("link checkout refuses a cancelled order and the pay page shows it as no longer available", () => {
  const checkout = readFileSync(join(process.cwd(), "src/lib/payments/link-checkout.ts"), "utf8");
  assert.match(checkout, /status === "cancelled"\) return \{ ok: false, reason: "not_open" \}/);
  const page = readFileSync(join(process.cwd(), "src/app/(public)/pay/[code]/pay-page.tsx"), "utf8");
  assert.match(page, /orderCancelled/);
  const en = JSON.parse(readFileSync(join(process.cwd(), "messages/en.json"), "utf8"));
  const es = JSON.parse(readFileSync(join(process.cwd(), "messages/es.json"), "utf8"));
  assert.match(en.public.thread.cancelled, /no longer available/);
  assert.match(es.public.thread.cancelled, /ya no está disponible/);
});
