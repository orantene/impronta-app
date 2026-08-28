"use client";

/**
 * Lexical formatting for the canvas text toolbar (inline + standalone editor ref).
 */

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
  $getSelection,
  $isRangeSelection,
  FORMAT_TEXT_COMMAND,
  SELECTION_CHANGE_COMMAND,
  COMMAND_PRIORITY_LOW,
  type LexicalEditor,
} from "lexical";

import {
  getActiveCanvasLexicalEditor,
  subscribeActiveCanvasLexicalEditor,
} from "./canvas-lexical-bridge";
import {
  $selectionListType,
  TOGGLE_BULLET_LIST_COMMAND,
  TOGGLE_NUMBER_LIST_COMMAND,
} from "./rich-editor/plugins/list-commands";

export interface CanvasTextFormattingState {
  isBold: boolean;
  isItalic: boolean;
  isBulletList: boolean;
  isNumberedList: boolean;
}

export function useCanvasTextFormattingFromEditor(
  editor: LexicalEditor | null,
  enabled = true,
) {
  const [state, setState] = useState<CanvasTextFormattingState>({
    isBold: false,
    isItalic: false,
    isBulletList: false,
    isNumberedList: false,
  });

  useEffect(() => {
    if (!enabled || !editor) {
      setState({
        isBold: false,
        isItalic: false,
        isBulletList: false,
        isNumberedList: false,
      });
      return;
    }

    function readSelection() {
      if (!editor) return;
      editor.getEditorState().read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) {
          setState({
            isBold: false,
            isItalic: false,
            isBulletList: false,
            isNumberedList: false,
          });
          return;
        }
        const listType = $selectionListType();
        setState({
          isBold: selection.hasFormat("bold"),
          isItalic: selection.hasFormat("italic"),
          isBulletList: listType === "bullet",
          isNumberedList: listType === "number",
        });
      });
    }

    readSelection();
    const unregister = editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      () => {
        readSelection();
        return false;
      },
      COMMAND_PRIORITY_LOW,
    );
    const unregisterUpdate = editor.registerUpdateListener(() => readSelection());
    return () => {
      unregister();
      unregisterUpdate();
    };
  }, [editor, enabled]);

  const toggleBold = useCallback(() => {
    editor?.dispatchCommand(FORMAT_TEXT_COMMAND, "bold");
  }, [editor]);

  const toggleItalic = useCallback(() => {
    editor?.dispatchCommand(FORMAT_TEXT_COMMAND, "italic");
  }, [editor]);

  const toggleBulletList = useCallback(() => {
    editor?.dispatchCommand(TOGGLE_BULLET_LIST_COMMAND, undefined);
  }, [editor]);

  const toggleNumberedList = useCallback(() => {
    editor?.dispatchCommand(TOGGLE_NUMBER_LIST_COMMAND, undefined);
  }, [editor]);

  return {
    state,
    toggleBold,
    toggleItalic,
    toggleBulletList,
    toggleNumberedList,
    editor,
  };
}

/** Toolbar outside composer — reads the active canvas inline editor. */
export function useActiveCanvasTextFormatting(enabled = true) {
  const editor = useSyncExternalStore(
    subscribeActiveCanvasLexicalEditor,
    () => (enabled ? getActiveCanvasLexicalEditor() : null),
    () => null,
  );
  return useCanvasTextFormattingFromEditor(editor, enabled && editor !== null);
}
