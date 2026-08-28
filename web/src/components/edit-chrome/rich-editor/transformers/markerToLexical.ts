/**
 * Phase C — Lexical adapter: marker string → list of leaf nodes.
 *
 * Pure parse lives in `tokens.ts`; this file only bridges the parsed
 * token list into Lexical node instances. Must be called inside an
 * `editor.update(...)` callback so Lexical's editor context is in scope.
 */

import {
  $createParagraphNode,
  $createTextNode,
  type LexicalNode,
} from "lexical";
import { $createLinkNode } from "@lexical/link";

import { $createAccentNode } from "../nodes/AccentNode";
import { $createColorNode } from "../nodes/ColorNode";
import {
  $createBuilderListItemNode,
  $createBuilderListNode,
} from "../nodes/ListNode";
import { tokenize } from "./tokens";
import { splitRichBlocks } from "@/lib/site-admin/sections/shared/rich-text-lists";

/** Marker string → flat list of Lexical leaf nodes. */
export function markerStringToNodes(input: string): LexicalNode[] {
  const tokens = tokenize(input);
  const out: LexicalNode[] = [];
  for (const t of tokens) {
    // Skip ghost-marker leaves (empty content).
    if (t.text === "") continue;

    switch (t.kind) {
      case "text":
        out.push($createTextNode(t.text));
        break;
      case "accent":
        out.push($createAccentNode(t.text));
        break;
      case "color":
        out.push($createColorNode(t.text, t.color));
        break;
      case "bold": {
        const n = $createTextNode(t.text);
        n.setFormat("bold");
        out.push(n);
        break;
      }
      case "italic": {
        const n = $createTextNode(t.text);
        n.setFormat("italic");
        out.push(n);
        break;
      }
      case "link": {
        const link = $createLinkNode(t.url);
        link.append($createTextNode(t.text));
        out.push(link);
        break;
      }
    }
  }
  return out;
}

/** Marker string → root children (paragraphs mixed with real lists). */
export function $appendBlocksFromMarkerString(
  value: string,
  variant: "single" | "multi",
): LexicalNode[] {
  const blocks = splitRichBlocks(value || "");
  const out: LexicalNode[] = [];
  if (blocks.length === 0) {
    out.push($createParagraphNode());
    return out;
  }
  for (const block of blocks) {
    if (block.kind === "ul" || block.kind === "ol") {
      const list = $createBuilderListNode(
        block.kind === "ol" ? "number" : "bullet",
      );
      const items = block.items.length > 0 ? block.items : [""];
      for (const item of items) {
        const li = $createBuilderListItemNode();
        const leaves = markerStringToNodes(item);
        if (leaves.length === 0) li.append($createTextNode(""));
        else for (const leaf of leaves) li.append(leaf);
        list.append(li);
      }
      out.push(list);
      continue;
    }
    const lines =
      variant === "multi"
        ? block.text.split("\n")
        : [block.text.replace(/\n/g, " ")];
    for (const line of lines) {
      const paragraph = $createParagraphNode();
      const leaves = markerStringToNodes(line);
      for (const leaf of leaves) paragraph.append(leaf);
      out.push(paragraph);
    }
  }
  if (out.length === 0) out.push($createParagraphNode());
  return out;
}

export { isPlainText } from "./tokens";
