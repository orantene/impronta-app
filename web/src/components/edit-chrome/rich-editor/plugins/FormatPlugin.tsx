"use client";

/**
 * Phase C bug-fix — `FORMAT_TEXT_COMMAND` listener.
 *
 * `@lexical/react/LexicalPlainTextPlugin` does NOT subscribe to
 * `FORMAT_TEXT_COMMAND` — that listener lives in `@lexical/rich-text`,
 * which is banned by the Phase C scope cap (see eslint.config.mjs and
 * the editor-base evaluation memo). Without this 6-line plugin the
 * toolbar's Bold / Italic buttons silently no-op: the command fires
 * but nothing applies the format to the selection.
 *
 * Surfaced during the Phase C lived-experience verification (Cmd-B +
 * toolbar click both produced no `<strong>` in the editor's HTML).
 *
 * The implementation mirrors what `@lexical/rich-text` does for the
 * same command — call `selection.formatText(format)` on a
 * `RangeSelection`. We keep it here because re-implementing the 6 lines
 * is cheaper than amending the allow-list to permit a whole package.
 */

import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_EDITOR,
  FORMAT_TEXT_COMMAND,
  type TextFormatType,
} from "lexical";

export function FormatPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand<TextFormatType>(
      FORMAT_TEXT_COMMAND,
      (format) => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return false;
        selection.formatText(format);
        return true;
      },
      COMMAND_PRIORITY_EDITOR,
    );
  }, [editor]);

  return null;
}
