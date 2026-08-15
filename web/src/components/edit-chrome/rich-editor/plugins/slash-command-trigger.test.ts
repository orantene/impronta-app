import assert from "node:assert/strict";
import { test } from "node:test";

import {
  extractSlashQuery,
  shouldTriggerSlashCommand,
} from "./slash-command-trigger";

// ── shouldTriggerSlashCommand ────────────────────────────────────────────

test("triggers at the start of an empty block", () => {
  assert.equal(shouldTriggerSlashCommand(""), true);
});

test("triggers right after whitespace", () => {
  assert.equal(shouldTriggerSlashCommand("Hello "), true);
  assert.equal(shouldTriggerSlashCommand("Hello\t"), true);
  assert.equal(shouldTriggerSlashCommand("Hello\n"), true);
});

test("does not trigger mid-word — 'and/or' stays literal", () => {
  assert.equal(shouldTriggerSlashCommand("and"), false);
});

test("does not trigger right after a non-whitespace character in general", () => {
  assert.equal(shouldTriggerSlashCommand("Book a session"), false);
  assert.equal(shouldTriggerSlashCommand("100"), false);
});

// ── extractSlashQuery ─────────────────────────────────────────────────────

test("extracts an empty query immediately after the trigger", () => {
  assert.equal(extractSlashQuery("/", 0, 1), "");
});

test("extracts the typed query as the operator keeps typing", () => {
  assert.equal(extractSlashQuery("/gal", 0, 4), "gal");
  assert.equal(extractSlashQuery("Hi /galler", 3, 10), "galler");
});

test("returns null once a space is typed after the trigger", () => {
  assert.equal(extractSlashQuery("/foo bar", 0, 8), null);
  assert.equal(extractSlashQuery("/foo ", 0, 5), null);
});

test("returns null when the caret moves back to (or before) the trigger", () => {
  assert.equal(extractSlashQuery("/gallery", 0, 0), null);
  assert.equal(extractSlashQuery("/gallery", 3, 2), null);
});

test("returns null when the slash at triggerOffset is no longer there (deleted)", () => {
  assert.equal(extractSlashQuery("gallery", 0, 3), null);
});

test("returns null for an out-of-range trigger offset", () => {
  assert.equal(extractSlashQuery("abc", 10, 10), null);
  assert.equal(extractSlashQuery("abc", -1, 2), null);
});
