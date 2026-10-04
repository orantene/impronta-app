import assert from "node:assert/strict";
import test from "node:test";

import type { ThreadMessage } from "@/lib/messaging/types";

import { clientThreadNeedsPaidRefresh } from "./client-thread-paid-refresh";

function msg(
  partial: Partial<ThreadMessage> & Pick<ThreadMessage, "id" | "kind">,
): ThreadMessage {
  return {
    inquiryId: "inq",
    body: "",
    payload: null,
    senderUserId: "staff",
    guestSessionId: null,
    createdAt: "2026-10-04T00:00:00.000Z",
    editedAt: null,
    deletedAt: null,
    thread: "private",
    internal: false,
    delivery: null,
    ...partial,
  };
}

test("no payment cards → no refresh loop", () => {
  assert.equal(clientThreadNeedsPaidRefresh([msg({ id: "1", kind: "text", body: "hi", senderUserId: null })]), false);
});

test("open payment_request needs refresh for the PAID flip", () => {
  assert.equal(
    clientThreadNeedsPaidRefresh([
      msg({ id: "p1", kind: "payment_request", payload: { amountCents: 5000, paymentLinkCode: "abc" } }),
    ]),
    true,
  );
  assert.equal(
    clientThreadNeedsPaidRefresh([
      msg({ id: "p1", kind: "payment_request", payload: { state: "sent", amountCents: 5000 } }),
    ]),
    true,
  );
});

test("settled payment_request stops the refresh loop", () => {
  for (const state of ["paid", "partially_refunded", "refunded", "cancelled", "expired"]) {
    assert.equal(
      clientThreadNeedsPaidRefresh([
        msg({ id: "p1", kind: "payment_request", payload: { state, amountCents: 5000 } }),
      ]),
      false,
      state,
    );
  }
});
