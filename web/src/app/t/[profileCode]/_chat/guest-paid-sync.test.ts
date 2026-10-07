import assert from "node:assert/strict";
import test from "node:test";

import { isServerPaid, pollNeedsFullReload } from "./guest-paid-sync";

test("paid only when the server wrote a payment_paid row", () => {
  assert.equal(isServerPaid([{ kind: "payment_request" }, { kind: "text" }]), false);
  assert.equal(isServerPaid([]), false);
  assert.equal(isServerPaid([{ kind: "payment_request" }, { kind: "payment_paid" }]), true);
});

test("poll reloads the thread on settled-money rows only", () => {
  assert.equal(pollNeedsFullReload([{ kind: "text" }]), false);
  assert.equal(pollNeedsFullReload([{ kind: "payment_request", payload: { state: "open" } }]), false);
  assert.equal(pollNeedsFullReload([{ kind: "payment_paid" }]), true);
  assert.equal(pollNeedsFullReload([{ kind: "payment_request", payload: { state: "paid" } }]), true);
});
