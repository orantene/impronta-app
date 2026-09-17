import assert from "node:assert/strict";
import { test } from "node:test";

import { deriveTasks } from "@/lib/messaging/tasks";

import type { ShellActionId } from "./contracts";
import { TASK_ACTION, actionLabel, comingActions, primaryActionFor, routeShellAction } from "./NextStep";
import { EN_SCREEN, ES_SCREEN, FR_SCREEN } from "./test-screen-copy";

const ALL: ShellActionId[] = ["reply", "add_items", "create_offer", "revise_offer", "request_payment", "confirm", "capture_identity", "remind", "reopen", "resolve", "assign", "handover", "rename", "copy_link", "close_lost", "history", "send_times", "send_file", "link_record", "open_record", "open_client", "add_note", "new_conversation", "book_again"];

test("every shell action has a route, and the coming set is exactly the later lanes' targets", () => {
  for (const id of ALL) assert.ok(routeShellAction(id), id);
  assert.deepEqual(comingActions().sort(), ["add_items", "book_again", "confirm", "create_offer", "link_record", "open_record", "remind", "request_payment", "revise_offer", "send_times"].sort());
  for (const id of comingActions()) {
    const route = routeShellAction(id);
    assert.ok(route.kind === "coming" && route.seam.length > 0, id);
  }
});

test("every task key deriveTasks can emit has a row in TASK_ACTION", () => {
  const keys = new Set<string>();
  const now = "2026-09-17T12:00:00Z";
  const base = { conversationState: "needs_reply" as const, opportunityState: null, recordChips: [], identityLevel: "none" as const, unanswered: false, talentConfirmationsPending: 0, balanceDueAt: null, reminderDueAt: null, holdExpiresAt: null, paymentIssue: null, now };
  const variants = [
    base,
    { ...base, conversationState: "resolved" as const },
    { ...base, opportunityState: "lost" as const },
    { ...base, paymentIssue: "failed" as const },
    { ...base, holdExpiresAt: "2026-09-17T11:00:00Z" },
    { ...base, unanswered: true },
    { ...base, recordChips: [{ kind: "appointment" as const, paymentState: null, fulfilmentState: "hold" }] },
    { ...base, opportunityState: "awaiting_acceptance" as const },
    { ...base, opportunityState: "accepted_awaiting_deposit" as const },
    { ...base, recordChips: [{ kind: "order" as const, paymentState: "paid", fulfilmentState: "preparing" }] },
    { ...base, balanceDueAt: "2026-09-18T12:00:00Z" },
    { ...base, reminderDueAt: "2026-09-17T11:00:00Z" },
    { ...base, talentConfirmationsPending: 2 },
    { ...base, conversationState: "awaiting_customer" as const },
  ];
  for (const v of variants) for (const t of deriveTasks(v)) keys.add(t.key);
  assert.ok(keys.size >= 12, `expected the full task vocabulary, saw ${[...keys].join(",")}`);
  for (const key of keys) assert.ok(key in TASK_ACTION, `TASK_ACTION is missing ${key}`);
});

test("primaryActionFor: reply → reply, closed → reopen only when resolved or lost, all_clear → null", () => {
  const needs = { conversation: "needs_reply" as const, opportunity: null, records: [] };
  assert.equal(primaryActionFor([{ key: "reply", title: "", why: "", primary: true }], needs), "reply");
  assert.equal(primaryActionFor([{ key: "all_clear", title: "", why: "", primary: true }], needs), null);
  assert.equal(primaryActionFor([{ key: "closed", title: "", why: "", primary: true }], { ...needs, conversation: "resolved" }), "reopen");
  assert.equal(primaryActionFor([{ key: "closed", title: "", why: "", primary: true }], { ...needs, opportunity: "lost" }), "reopen");
  assert.equal(primaryActionFor([{ key: "closed", title: "", why: "", primary: true }], needs), null);
  assert.equal(primaryActionFor([], needs), null);
});

test("action labels resolve in EN/ES/FR without raw keys, em dashes or customer", () => {
  for (const copy of [EN_SCREEN, ES_SCREEN, FR_SCREEN]) {
    for (const id of ALL) {
      const label = actionLabel(id, copy);
      assert.ok(label.length > 0);
      assert.doesNotMatch(label, /dashboard\./);
      assert.doesNotMatch(label, /—/);
      assert.doesNotMatch(label, /customer/i);
    }
    assert.equal(actionLabel("request_payment", copy), copy.shell.next.request_payment);
  }
});
