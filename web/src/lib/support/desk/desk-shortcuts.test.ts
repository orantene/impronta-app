import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  deskShortcutFromKeyboardEvent,
  isEditableTarget,
} from "./desk-shortcuts";

function key(
  partial: Partial<KeyboardEvent> & { key: string },
): Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey"> {
  return {
    key: partial.key,
    metaKey: partial.metaKey ?? false,
    ctrlKey: partial.ctrlKey ?? false,
    altKey: partial.altKey ?? false,
    shiftKey: partial.shiftKey ?? false,
  };
}

describe("desk-shortcuts (SPEC §6 / journey 28)", () => {
  it("maps j/k/r/n/a/e/s and escape", () => {
    assert.equal(deskShortcutFromKeyboardEvent(key({ key: "j" }), null), "next");
    assert.equal(deskShortcutFromKeyboardEvent(key({ key: "k" }), null), "prev");
    assert.equal(deskShortcutFromKeyboardEvent(key({ key: "r" }), null), "reply");
    assert.equal(deskShortcutFromKeyboardEvent(key({ key: "n" }), null), "note");
    assert.equal(deskShortcutFromKeyboardEvent(key({ key: "a" }), null), "assign");
    assert.equal(deskShortcutFromKeyboardEvent(key({ key: "e" }), null), "resolve");
    assert.equal(deskShortcutFromKeyboardEvent(key({ key: "s" }), null), "snooze");
    assert.equal(deskShortcutFromKeyboardEvent(key({ key: "Escape" }), null), "escape");
  });

  it("⌘K / Ctrl+K opens command palette", () => {
    assert.equal(
      deskShortcutFromKeyboardEvent(key({ key: "k", metaKey: true }), null),
      "command",
    );
    assert.equal(
      deskShortcutFromKeyboardEvent(key({ key: "k", ctrlKey: true }), null),
      "command",
    );
  });

  it("ignores letter shortcuts inside inputs (journey 28)", () => {
    const input = { tagName: "TEXTAREA", isContentEditable: false, closest: () => null } as unknown as HTMLElement;
    assert.equal(isEditableTarget(input), true);
    assert.equal(deskShortcutFromKeyboardEvent(key({ key: "j" }), input), null);
    assert.equal(deskShortcutFromKeyboardEvent(key({ key: "r" }), input), null);
    // Escape + ⌘K still work from the composer.
    assert.equal(deskShortcutFromKeyboardEvent(key({ key: "Escape" }), input), "escape");
    assert.equal(
      deskShortcutFromKeyboardEvent(key({ key: "k", metaKey: true }), input),
      "command",
    );
  });
});
