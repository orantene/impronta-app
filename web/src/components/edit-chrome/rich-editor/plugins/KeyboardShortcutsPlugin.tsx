"use client";

/**
 * Phase C — keyboard shortcut handler for ⌘B / ⌘I / ⌘K (and Ctrl
 * equivalents on non-Mac).
 *
 * Bold + Italic dispatch Lexical's stock FORMAT_TEXT_COMMAND. Cmd-K
 * delegates to the parent's `onRequestLink` callback (so the existing
 * `LinkPicker` popover opens with the current URL prefilled).
 *
 * Per the Phase C scope cap: no other shortcuts. No ⌘U (no underline),
 * no ⌘Shift-A, no markdown shortcuts.
 */

import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_HIGH,
  FORMAT_TEXT_COMMAND,
  KEY_MODIFIER_COMMAND,
} from "lexical";
import { $isLinkNode } from "@lexical/link";

interface Props {
  /** Called when ⌘K is pressed; the parent owns the LinkPicker popover. */
  onRequestLink: (rect: DOMRect, currentUrl: string | null) => void;
}

export function KeyboardShortcutsPlugin({ onRequestLink }: Props) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      KEY_MODIFIER_COMMAND,
      (event) => {
        const isMod = event.metaKey || event.ctrlKey;
        if (!isMod) return false;
        const key = event.key.toLowerCase();
        if (key === "b") {
          event.preventDefault();
          editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold");
          return true;
        }
        if (key === "i") {
          event.preventDefault();
          editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic");
          return true;
        }
        if (key === "k") {
          event.preventDefault();
          // Compute selection rect for the popover anchor.
          const native = window.getSelection();
          if (!native || native.rangeCount === 0) return true;
          const rect = native.getRangeAt(0).getBoundingClientRect();
          let url: string | null = null;
          editor.getEditorState().read(() => {
            const selection = $getSelection();
            if (!$isRangeSelection(selection)) return;
            for (const n of selection.getNodes()) {
              const parent = $isTextNode(n) ? n.getParent() : null;
              if (parent && $isLinkNode(parent)) {
                url = parent.getURL();
                break;
              }
            }
          });
          onRequestLink(rect, url);
          return true;
        }
        return false;
      },
      COMMAND_PRIORITY_HIGH,
    );
  }, [editor, onRequestLink]);

  return null;
}
