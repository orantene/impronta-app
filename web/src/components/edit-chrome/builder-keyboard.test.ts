import assert from "node:assert/strict";
import { test } from "node:test";

import { tryHistoryShortcut } from "./builder-keyboard";

function keyEvent(init: {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}): KeyboardEvent {
  return {
    key: init.key,
    metaKey: init.metaKey ?? false,
    ctrlKey: init.ctrlKey ?? false,
    shiftKey: init.shiftKey ?? false,
    altKey: init.altKey ?? false,
    preventDefault() {
      /* no-op in unit tests */
    },
  } as KeyboardEvent;
}

test("⇧⌘Y opens Revisions; ⌘Y / ⌘Z stay undo-redo", () => {
  const calls: string[] = [];
  const actions = {
    undo: () => {
      calls.push("undo");
    },
    redo: () => {
      calls.push("redo");
    },
    openRevisions: () => {
      calls.push("revisions");
    },
  };

  assert.equal(
    tryHistoryShortcut(
      keyEvent({ key: "y", metaKey: true, shiftKey: true }),
      true,
      "y",
      actions,
    ),
    true,
  );
  assert.equal(
    tryHistoryShortcut(keyEvent({ key: "y", metaKey: true }), true, "y", actions),
    true,
  );
  assert.equal(
    tryHistoryShortcut(keyEvent({ key: "z", metaKey: true }), true, "z", actions),
    true,
  );
  assert.equal(
    tryHistoryShortcut(
      keyEvent({ key: "z", metaKey: true, shiftKey: true }),
      true,
      "z",
      actions,
    ),
    true,
  );
  assert.deepEqual(calls, ["revisions", "redo", "undo", "redo"]);
});

test("⌥⌘Y is not claimed so it cannot steal Redo", () => {
  const calls: string[] = [];
  const consumed = tryHistoryShortcut(
    keyEvent({ key: "y", metaKey: true, altKey: true }),
    true,
    "y",
    {
      undo: () => {
        calls.push("undo");
      },
      redo: () => {
        calls.push("redo");
      },
      openRevisions: () => {
        calls.push("revisions");
      },
    },
  );
  assert.equal(consumed, false);
  assert.deepEqual(calls, []);
});
