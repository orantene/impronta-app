"use client";

/**
 * WAVE 2.1 — put a LIVE caret in the canvas inline editor the moment it opens.
 *
 * The canvas overlay used to mount completely unfocused: `document.activeElement`
 * stayed `BODY`, so every character the operator typed after their double-click
 * went to the document and was silently dropped. They had to click a THIRD time,
 * into the overlay, before a caret existed. Measured live before this fix:
 * double-click, type "ZZZ", committed text unchanged, `activeElement === BODY`.
 *
 * The fix has to be synchronous. A focus scheduled in a timeout / rAF leaves a
 * window in which the editor is mounted and looks ready but cannot capture
 * input — the exact defect, just shorter and harder to reproduce. This runs in
 * a LAYOUT effect (child layout effects flush before the browser can deliver
 * the next input event, and React has already reconciled Lexical's
 * contentEditable by then), so there is no such window at all.
 *
 * Caret POSITION comes from the point the operator double-clicked, mapped
 * through `caretRangeFromPoint` onto the overlay (which sits exactly over the
 * hidden target with the same computed type styles, so the glyphs line up).
 * The DOM range is then translated into a Lexical selection rather than being
 * left as a raw DOM selection, so Lexical's own state is authoritative from the
 * first keystroke instead of catching up on the next `selectionchange`.
 *
 * The point is consumed ONCE (the ref is nulled), so the undo/redo remount
 * (`resyncKey`) refocuses at the end of the text instead of jumping the caret
 * back to wherever the original double-click happened to land.
 */

import { useLayoutEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getNearestNodeFromDOMNode,
  $getRoot,
  $isTextNode,
} from "lexical";

export interface CaretPoint {
  x: number;
  y: number;
}

interface Props {
  /**
   * Viewport point of the opening double-click, or null to focus at the end of
   * the text. Applying it is IDEMPOTENT: the overlay passes null once the edit
   * has been remounted by an undo/redo resync, and React's dev double-invoke of
   * effects must not change the outcome. An earlier version consumed the point
   * out of a ref on first read, which meant the second (StrictMode) invocation
   * saw null and the caret silently fell back to the end of the line.
   */
  caretPoint: CaretPoint | null;
}

/** Cross-engine `caretRangeFromPoint`. Firefox only ships the Position form. */
function domRangeFromPoint(x: number, y: number): Range | null {
  const doc = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (
      x: number,
      y: number,
    ) => { offsetNode: Node; offset: number } | null;
  };
  if (typeof doc.caretRangeFromPoint === "function") {
    return doc.caretRangeFromPoint(x, y);
  }
  if (typeof doc.caretPositionFromPoint === "function") {
    const position = doc.caretPositionFromPoint(x, y);
    if (!position) return null;
    const range = document.createRange();
    range.setStart(position.offsetNode, position.offset);
    range.collapse(true);
    return range;
  }
  return null;
}

export function AutoFocusCaretPlugin({ caretPoint }: Props) {
  const [editor] = useLexicalComposerContext();

  useLayoutEffect(() => {
    const root = editor.getRootElement();
    if (!root) return;

    // Focus FIRST and synchronously: from here on every keystroke is captured,
    // whatever happens to the caret position below.
    root.focus({ preventScroll: true });

    const domRange = caretPoint
      ? domRangeFromPoint(caretPoint.x, caretPoint.y)
      : null;
    const inEditor =
      domRange !== null && root.contains(domRange.startContainer);

    // `discrete` forces Lexical to flush this selection before the next event
    // is processed, so the first typed character lands where the caret shows.
    editor.update(
      () => {
        if (inEditor && domRange) {
          const node = $getNearestNodeFromDOMNode(domRange.startContainer);
          if ($isTextNode(node)) {
            const max = node.getTextContentSize();
            const offset = Math.min(domRange.startOffset, max);
            node.select(offset, offset);
            return;
          }
        }
        $getRoot().selectEnd();
      },
      { discrete: true },
    );
  }, [editor, caretPoint]);

  return null;
}
