import assert from "node:assert/strict";
import { test } from "node:test";

import { deriveTasks, type DeriveTasksInput } from "./tasks";

const NOW = "2026-09-17T12:00:00Z";

function base(overrides: Partial<DeriveTasksInput> = {}): DeriveTasksInput {
  return {
    conversationState: "awaiting_customer",
    opportunityState: null,
    recordChips: [],
    identityLevel: "confirmed",
    unanswered: false,
    talentConfirmationsPending: 0,
    balanceDueAt: null,
    reminderDueAt: null,
    holdExpiresAt: null,
    paymentIssue: null,
    now: NOW,
    ...overrides,
  };
}

function primaryKeys(input: DeriveTasksInput) {
  const tasks = deriveTasks(input);
  assert.equal(tasks.filter((t) => t.primary).length, 1, "exactly one primary task");
  return tasks.map((t) => t.key);
}

test("needs reply + offer awaiting: reply is primary, following up on the offer is secondary", () => {
  const keys = primaryKeys(
    base({ conversationState: "needs_reply", opportunityState: "awaiting_acceptance", unanswered: true }),
  );
  assert.deepEqual(keys, ["reply", "await_offer"]);
});

test("identity missing before hold: confirm identity is the (only) primary task", () => {
  const keys = primaryKeys(
    base({
      recordChips: [{ kind: "appointment", paymentState: null, fulfilmentState: "hold" }],
      identityLevel: "none",
    }),
  );
  assert.deepEqual(keys, ["confirm_identity"]);
});

test("a hold with a CONFIRMED identity does not ask to confirm identity again", () => {
  const keys = primaryKeys(
    base({
      recordChips: [{ kind: "appointment", paymentState: null, fulfilmentState: "hold" }],
      identityLevel: "confirmed",
    }),
  );
  assert.ok(!keys.includes("confirm_identity"));
});

test("accepted offer, no deposit: collect the deposit is primary", () => {
  const keys = primaryKeys(base({ opportunityState: "accepted_awaiting_deposit" }));
  assert.deepEqual(keys, ["collect_deposit"]);
});

test("paid order preparing: prepare the order is primary", () => {
  const keys = primaryKeys(
    base({ recordChips: [{ kind: "order", paymentState: "paid", fulfilmentState: "preparing" }] }),
  );
  assert.deepEqual(keys, ["prepare_order"]);
});

test("a paid order already FULFILLED does not ask to prepare it again", () => {
  const keys = primaryKeys(
    base({ recordChips: [{ kind: "order", paymentState: "paid", fulfilmentState: "fulfilled" }] }),
  );
  assert.ok(!keys.includes("prepare_order"));
});

test("balance due: collect the balance is primary", () => {
  const keys = primaryKeys(base({ balanceDueAt: "2026-09-18T00:00:00Z" }));
  assert.deepEqual(keys, ["collect_balance"]);
});

test("closed as lost: a single 'closed' task, primary, nothing else", () => {
  const tasks = deriveTasks(
    base({
      opportunityState: "lost",
      conversationState: "needs_reply",
      unanswered: true,
      balanceDueAt: "2026-09-01T00:00:00Z",
    }),
  );
  assert.deepEqual(tasks, [{ key: "closed", title: "Lost", why: "Marked as lost. Reopen if the client comes back.", primary: true }]);
});

test("resolved conversation also short-circuits to a single closed task", () => {
  const tasks = deriveTasks(base({ conversationState: "resolved" }));
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].key, "closed");
  assert.equal(tasks[0].primary, true);
});

test("a payment issue outranks an offer follow-up", () => {
  const keys = primaryKeys(base({ opportunityState: "awaiting_acceptance", paymentIssue: "failed" }));
  assert.equal(keys[0], "payment_issue");
});

test("an expired hold outranks a plain reply", () => {
  const keys = primaryKeys(
    base({ conversationState: "needs_reply", unanswered: true, holdExpiresAt: "2026-09-17T00:00:00Z" }),
  );
  assert.equal(keys[0], "expired_hold");
});

test("nothing pending: a single reassuring 'all clear' task", () => {
  const tasks = deriveTasks(base());
  assert.deepEqual(tasks, [{ key: "all_clear", title: "Nothing to do", why: "No action is needed right now.", primary: true }]);
});

test("talent confirmations pending surface with a count in the sentence", () => {
  const tasks = deriveTasks(base({ talentConfirmationsPending: 2 }));
  assert.equal(tasks[0].key, "confirm_talent");
  assert.match(tasks[0].why, /2 talent confirmations pending/);
});

test("exactly one primary across every combination tried above", () => {
  for (const input of [
    base({ conversationState: "needs_reply" }),
    base({ opportunityState: "accepted_awaiting_deposit", balanceDueAt: "2026-09-01T00:00:00Z" }),
    base({ paymentIssue: "expired", reminderDueAt: "2026-09-01T00:00:00Z" }),
  ]) {
    const tasks = deriveTasks(input);
    assert.equal(tasks.filter((t) => t.primary).length, 1);
  }
});
