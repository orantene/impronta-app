import assert from "node:assert/strict";
import { test } from "node:test";

import {
  agendaFinishCardPayKey,
  agendaPayRequestKey,
  messagesShellPaymentRequestKey,
  msgv5PaymentRequestKey,
  newPaymentRequestAttemptId,
} from "./payment-request-attempt";

test("attempt ids differ across calls", () => {
  const a = newPaymentRequestAttemptId();
  const b = newPaymentRequestAttemptId();
  assert.notEqual(a, b);
  assert.ok(a.length >= 8);
});

test("msgv5 key includes attempt so a re-request is a new operation key", () => {
  const base = { inquiryId: "inq", recordId: "ord", amountKind: "deposit" as const };
  const first = msgv5PaymentRequestKey({ ...base, attemptId: "a1" });
  const second = msgv5PaymentRequestKey({ ...base, attemptId: "a2" });
  assert.notEqual(first, second);
  assert.match(first, /^msgv5-pay-inq-ord-deposit-a1$/);
  assert.equal(/msgv5-pay-inq-ord-deposit$/.test(first), false);
});

test("v4 shell, agenda composer, and finish-card keys all carry attempt", () => {
  assert.match(messagesShellPaymentRequestKey({ inquiryId: "i", recordId: "o", attemptId: "x" }), /-x$/);
  assert.match(agendaPayRequestKey({ orderId: "o", amountCents: 100, attemptId: "y" }), /-y$/);
  assert.match(agendaFinishCardPayKey({ bookingId: "b", amountCents: 200, attemptId: "z" }), /-z$/);
});
