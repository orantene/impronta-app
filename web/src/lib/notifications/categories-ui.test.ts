import test from "node:test";
import assert from "node:assert/strict";

import { categoryForKind, countUnreadByCategory } from "./categories-ui";

test("kind → UI category map (TUL-389)", () => {
  assert.equal(categoryForKind("message"), "messages");
  assert.equal(categoryForKind("payment"), "money");
  assert.equal(categoryForKind("approval"), "attention");
  assert.equal(categoryForKind("offer"), "attention");
  assert.equal(categoryForKind("booking"), "updates");
  assert.equal(categoryForKind("system"), "updates");
  assert.equal(categoryForKind("profile"), "updates");
  assert.equal(categoryForKind("ticket"), "updates");
  assert.equal(categoryForKind("unknown"), "updates");
});

test("countUnreadByCategory skips read rows", () => {
  const counts = countUnreadByCategory([
    { kind: "message", readAt: null },
    { kind: "message", readAt: "2026-10-08T00:00:00Z" },
    { kind: "payment", read: false },
    { kind: "approval", read: true },
    { kind: "booking", readAt: null },
  ]);
  assert.deepEqual(counts, { messages: 1, money: 1, attention: 0, updates: 1 });
});
