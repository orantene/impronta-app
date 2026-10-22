import assert from "node:assert/strict";
import { test } from "node:test";

import { senderLabelFor, talentNamesByUser } from "./thread-sender-labels";

test("TUL-1887: talent names merge from both sources, first non-blank wins", () => {
  const names = talentNamesByUser([
    [{ user_id: "u1", display_name: "Ana Ruiz" }, { user_id: "u2", display_name: "  " }, { user_id: null, display_name: "Ghost" }],
    [{ user_id: "u1", display_name: "Other" }, { user_id: "u2", display_name: "Luis" }],
  ]);
  assert.equal(names.get("u1"), "Ana Ruiz");
  assert.equal(names.get("u2"), "Luis");
  assert.equal(names.size, 2);
});

test("TUL-1887: a talent sender gets the talent name even when the account reads Tulala Hub", () => {
  const talents = new Map([["u1", "Ana Ruiz"]]);
  assert.equal(senderLabelFor("u1", talents, new Map([["u1", "Tulala Hub"]])), "Ana Ruiz");
  assert.equal(senderLabelFor("u1", talents, new Map()), "Ana Ruiz");
});

test("TUL-1887: hub, system and staff senders get null so the business label applies", () => {
  const talents = new Map([["u1", "Ana Ruiz"]]);
  assert.equal(senderLabelFor(null, talents, new Map()), null);
  assert.equal(senderLabelFor("staff", talents, new Map([["staff", "Tulala Hub"]])), null);
});
