import assert from "node:assert/strict";
import { test } from "node:test";

import {
  aggregateUnreadByKind,
  emptyUnreadCounts,
  kindsForUiCategory,
  KIND_TO_UI_CATEGORY,
  uiCategoryForKind,
} from "./categories-ui";

test("kind→category map covers every DB kind exactly once across the four UI buckets", () => {
  const kinds = Object.keys(KIND_TO_UI_CATEGORY);
  assert.deepEqual(
    kinds.sort(),
    ["approval", "booking", "message", "offer", "payment", "profile", "system", "ticket"].sort(),
  );
  assert.equal(uiCategoryForKind("message"), "messages");
  assert.equal(uiCategoryForKind("payment"), "money");
  assert.equal(uiCategoryForKind("approval"), "attention");
  assert.equal(uiCategoryForKind("offer"), "attention");
  assert.equal(uiCategoryForKind("booking"), "attention");
  assert.equal(uiCategoryForKind("ticket"), "attention");
  assert.equal(uiCategoryForKind("system"), "updates");
  assert.equal(uiCategoryForKind("profile"), "updates");
  assert.equal(uiCategoryForKind("unknown-future"), "updates");
});

test("kindsForUiCategory is the inverse of KIND_TO_UI_CATEGORY", () => {
  assert.deepEqual(kindsForUiCategory("messages").sort(), ["message"]);
  assert.deepEqual(kindsForUiCategory("money").sort(), ["payment"]);
  assert.deepEqual(kindsForUiCategory("attention").sort(), [
    "approval",
    "booking",
    "offer",
    "ticket",
  ]);
  assert.deepEqual(kindsForUiCategory("updates").sort(), ["profile", "system"]);
});

test("aggregateUnreadByKind rolls unread kinds into bubble counts", () => {
  assert.deepEqual(aggregateUnreadByKind([]), emptyUnreadCounts());
  assert.deepEqual(aggregateUnreadByKind(["message", "message", "payment", "approval", "system"]), {
    total: 5,
    messages: 2,
    money: 1,
    attention: 1,
    updates: 1,
  });
});
