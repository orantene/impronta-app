"use client";

/**
 * Registers list toggle commands and Enter-inside-list (new item / unwrap).
 * Runs at CRITICAL so Enter in a list beats SingleLinePlugin on headings.
 */

import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createParagraphNode,
  $createTextNode,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_CRITICAL,
  COMMAND_PRIORITY_EDITOR,
  KEY_ENTER_COMMAND,
  type LexicalNode,
} from "lexical";

import {
  $createBuilderListItemNode,
  $isBuilderListItemNode,
  $isBuilderListNode,
} from "../nodes/ListNode";
import {
  $toggleList,
  TOGGLE_BULLET_LIST_COMMAND,
  TOGGLE_NUMBER_LIST_COMMAND,
} from "./list-commands";

function $findListItem() {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return null;
  let node: LexicalNode | null = selection.anchor.getNode();
  while (node) {
    if ($isBuilderListItemNode(node)) return node;
    node = node.getParent();
  }
  return null;
}

export function ListCommandPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const unBullet = editor.registerCommand(
      TOGGLE_BULLET_LIST_COMMAND,
      () => {
        $toggleList("bullet");
        return true;
      },
      COMMAND_PRIORITY_EDITOR,
    );
    const unNumber = editor.registerCommand(
      TOGGLE_NUMBER_LIST_COMMAND,
      () => {
        $toggleList("number");
        return true;
      },
      COMMAND_PRIORITY_EDITOR,
    );
    const unEnter = editor.registerCommand(
      KEY_ENTER_COMMAND,
      (event) => {
        const item = $findListItem();
        if (!item) return false;
        event?.preventDefault();
        const list = item.getParent();
        if (item.getTextContent() === "") {
          const paragraph = $createParagraphNode();
          paragraph.append($createTextNode(""));
          if ($isBuilderListNode(list)) {
            list.insertAfter(paragraph);
            item.remove();
            if (list.getChildrenSize() === 0) list.remove();
          }
          paragraph.selectStart();
          return true;
        }
        const next = $createBuilderListItemNode();
        next.append($createTextNode(""));
        item.insertAfter(next);
        next.selectStart();
        return true;
      },
      COMMAND_PRIORITY_CRITICAL,
    );
    return () => {
      unBullet();
      unNumber();
      unEnter();
    };
  }, [editor]);

  return null;
}
