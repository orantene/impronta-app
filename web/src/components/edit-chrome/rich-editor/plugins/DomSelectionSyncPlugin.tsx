"use client";

/**
 * TUL-78 B-3 - make Lexical adopt the browser's caret right before it handles
 * an input event, so a character typed immediately after a caret move (End,
 * Home, arrows, a click) is inserted where the caret actually is. See
 * `dom-selection-sync.ts` for the failure this closes. Mounted for every
 * RichEditor, so the canvas inline editor and the inspector fields share it.
 */

import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createRangeSelectionFromDom,
  $getSelection,
  $isRangeSelection,
  $setSelection,
  type LexicalEditor,
} from "lexical";

import {
  inputEventNeedsSelectionSync,
  shouldAdoptDomSelection,
  type CaretSnapshot,
} from "./dom-selection-sync";

function syncFromDom(editor: LexicalEditor, root: HTMLElement): void {
  const domSelection = window.getSelection();
  if (!domSelection || domSelection.rangeCount === 0) return;
  if (!domSelection.anchorNode || !root.contains(domSelection.anchorNode)) return;
  editor.update(
    () => {
      const next = $createRangeSelectionFromDom(domSelection, editor);
      if (!next) return;
      const current = $getSelection();
      const toSnapshot = (sel: typeof next): CaretSnapshot => ({
        anchor: { key: sel.anchor.key, offset: sel.anchor.offset },
        focus: { key: sel.focus.key, offset: sel.focus.offset },
      });
      const currentSnapshot = $isRangeSelection(current) ? toSnapshot(current) : null;
      if (!shouldAdoptDomSelection(currentSnapshot, toSnapshot(next))) return;
      $setSelection(next);
    },
    { discrete: true },
  );
}

export function DomSelectionSyncPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const onBeforeInput = (event: Event) => {
      const root = editor.getRootElement();
      if (!root) return;
      if (!inputEventNeedsSelectionSync(event as InputEvent)) return;
      syncFromDom(editor, root);
    };
    // Capture phase: runs before Lexical's own (target/bubble) beforeinput handler.
    const unregister = editor.registerRootListener((root, prevRoot) => {
      prevRoot?.removeEventListener("beforeinput", onBeforeInput, true);
      root?.addEventListener("beforeinput", onBeforeInput, true);
    });
    return () => {
      editor.getRootElement()?.removeEventListener("beforeinput", onBeforeInput, true);
      unregister();
    };
  }, [editor]);

  return null;
}
