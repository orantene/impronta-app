/**
 * TUL-78 B-3 - decide when Lexical must adopt the browser caret.
 *
 * Run: NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' \
 *        npx tsx --test src/components/edit-chrome/rich-editor/plugins/dom-selection-sync.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  inputEventNeedsSelectionSync,
  shouldAdoptDomSelection,
  type CaretSnapshot,
} from "./dom-selection-sync";

const caret = (key: string, offset: number): CaretSnapshot => ({
  anchor: { key, offset },
  focus: { key, offset },
});

describe("shouldAdoptDomSelection", () => {
  it("adopts the End caret when Lexical still holds the double-click offset", () => {
    // 'Things people ask before they book.' double-clicked between 'o' and 'k'
    // (offset 31), then End pressed (offset 35) before selectionchange landed.
    assert.equal(shouldAdoptDomSelection(caret("t1", 31), caret("t1", 35)), true);
  });

  it("does nothing when both carets agree", () => {
    assert.equal(shouldAdoptDomSelection(caret("t1", 35), caret("t1", 35)), false);
  });

  it("adopts a DOM caret when Lexical has no range selection", () => {
    assert.equal(shouldAdoptDomSelection(null, caret("t1", 3)), true);
  });

  it("never clears the selection when the DOM has none", () => {
    assert.equal(shouldAdoptDomSelection(caret("t1", 3), null), false);
  });

  it("adopts a different text node at the same offset", () => {
    assert.equal(shouldAdoptDomSelection(caret("t1", 0), caret("t2", 0)), true);
  });
});

describe("inputEventNeedsSelectionSync", () => {
  it("syncs for plain typing and deletes", () => {
    assert.equal(inputEventNeedsSelectionSync({ inputType: "insertText" }), true);
    assert.equal(inputEventNeedsSelectionSync({ inputType: "deleteContentBackward" }), true);
  });

  it("leaves IME composition and undo/redo alone", () => {
    assert.equal(inputEventNeedsSelectionSync({ inputType: "insertText", isComposing: true }), false);
    assert.equal(inputEventNeedsSelectionSync({ inputType: "historyUndo" }), false);
  });
});
