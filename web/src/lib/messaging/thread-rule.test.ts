/**
 * D-MSG-2: one thread-type rule. Staff-authored POS messages, replies, cards
 * and internal notes alike, land on the client thread ("private"); the kind
 * decides who reads them. The talent thread ("group") is never written here.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { CLIENT_THREAD, TALENT_THREAD, isClientVisibleMessageKind, threadTypeForStaffMessage } from "./thread-rule";
import { CARD_KINDS } from "./types";

test("every kind the engine writes lands on the client thread, never the talent thread", () => {
  for (const kind of CARD_KINDS) {
    assert.equal(threadTypeForStaffMessage(kind), CLIENT_THREAD, kind);
    assert.notEqual(threadTypeForStaffMessage(kind), TALENT_THREAD, kind);
  }
});

test("a staff reply and an internal note share the client thread", () => {
  assert.equal(threadTypeForStaffMessage("text"), threadTypeForStaffMessage("internal_note"));
});

test("internal_note is the only kind a client never sees", () => {
  assert.equal(isClientVisibleMessageKind("internal_note"), false);
  for (const kind of CARD_KINDS.filter((k) => k !== "internal_note")) {
    assert.equal(isClientVisibleMessageKind(kind), true, kind);
  }
  // A legacy row with no kind is a text bubble, not a note.
  assert.equal(isClientVisibleMessageKind(null), true);
  assert.equal(isClientVisibleMessageKind(undefined), true);
});
