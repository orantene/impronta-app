import assert from "node:assert/strict";
import { test } from "node:test";

import { composerKeyAction } from "./composer-key-action";

const base = {
  key: "Enter",
  shiftKey: false,
  metaKey: false,
  ctrlKey: false,
  isComposing: false,
} as const;

test("plain Enter submits (second message and first)", () => {
  assert.equal(composerKeyAction(base), "submit");
});

test("Shift+Enter stays a newline", () => {
  assert.equal(composerKeyAction({ ...base, shiftKey: true }), "none");
});

test("Cmd/Ctrl+Enter still submit", () => {
  assert.equal(composerKeyAction({ ...base, metaKey: true }), "submit");
  assert.equal(composerKeyAction({ ...base, ctrlKey: true }), "submit");
});

test("IME composition does not submit", () => {
  assert.equal(composerKeyAction({ ...base, isComposing: true }), "none");
});

test("non-Enter keys are ignored", () => {
  assert.equal(composerKeyAction({ ...base, key: "a" }), "none");
});
