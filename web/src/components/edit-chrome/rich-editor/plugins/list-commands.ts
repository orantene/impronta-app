/**
 * Toggle bullet / numbered lists inside the existing Lexical editor.
 *
 * No `@lexical/list`: commands live on `lexical` core (already allowed).
 */

import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isParagraphNode,
  $isRangeSelection,
  $isRootNode,
  createCommand,
  type LexicalCommand,
  type LexicalNode,
} from "lexical";

import {
  $createBuilderListItemNode,
  $createBuilderListNode,
  $isBuilderListItemNode,
  $isBuilderListNode,
  type BuilderListNode,
  type BuilderListType,
} from "../nodes/ListNode";

export const TOGGLE_BULLET_LIST_COMMAND: LexicalCommand<void> = createCommand(
  "TOGGLE_BULLET_LIST",
);
export const TOGGLE_NUMBER_LIST_COMMAND: LexicalCommand<void> = createCommand(
  "TOGGLE_NUMBER_LIST",
);

function $getRootBlock(node: LexicalNode): LexicalNode {
  let current = node;
  while (current.getParent() && !$isRootNode(current.getParent())) {
    current = current.getParent()!;
  }
  return current;
}

function $unwrapList(list: BuilderListNode): void {
  const items = list.getChildren();
  for (const item of items) {
    if (!$isBuilderListItemNode(item)) continue;
    const paragraph = $createParagraphNode();
    const children = item.getChildren();
    if (children.length === 0) {
      paragraph.append($createTextNode(""));
    } else {
      for (const child of children) paragraph.append(child);
    }
    list.insertBefore(paragraph);
  }
  list.remove();
}

function $wrapParagraphs(
  blocks: LexicalNode[],
  listType: BuilderListType,
): void {
  const paragraphs = blocks.filter($isParagraphNode);
  if (paragraphs.length === 0) return;
  const list = $createBuilderListNode(listType);
  const first = paragraphs[0]!;
  first.insertBefore(list);
  for (const paragraph of paragraphs) {
    const item = $createBuilderListItemNode();
    const children = paragraph.getChildren();
    if (children.length === 0) {
      item.append($createTextNode(""));
    } else {
      for (const child of children) item.append(child);
    }
    list.append(item);
    paragraph.remove();
  }
}

export function $toggleList(listType: BuilderListType): boolean {
  const selection = $getSelection();
  const blocks: LexicalNode[] = [];
  const seen = new Set<string>();
  if ($isRangeSelection(selection)) {
    for (const node of selection.getNodes()) {
      const block = $getRootBlock(node);
      if (seen.has(block.getKey())) continue;
      seen.add(block.getKey());
      blocks.push(block);
    }
    if (blocks.length === 0) {
      blocks.push($getRootBlock(selection.anchor.getNode()));
    }
  } else {
    for (const child of $getRoot().getChildren()) blocks.push(child);
  }
  if (blocks.length === 0) return false;

  const lists = blocks.filter($isBuilderListNode);
  if (lists.length > 0 && lists.every((list) => list.getListType() === listType)) {
    for (const list of lists) $unwrapList(list);
    return true;
  }
  if (lists.length > 0) {
    for (const list of lists) list.setListType(listType);
    return true;
  }

  $wrapParagraphs(blocks, listType);
  return true;
}

export function $selectionListType(): BuilderListType | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return null;
  const node = selection.anchor.getNode();
  const block = $getRootBlock(node);
  if ($isBuilderListNode(block)) return block.getListType();
  const parent = node.getParent();
  if ($isBuilderListItemNode(parent) && $isBuilderListNode(parent.getParent())) {
    return parent.getParent()!.getListType();
  }
  return null;
}
