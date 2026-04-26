/**
 * Phase C — Lexical adapter: marker string → list of leaf nodes.
 *
 * Pure parse lives in `tokens.ts`; this file only bridges the parsed
 * token list into Lexical node instances. Must be called inside an
 * `editor.update(...)` callback so Lexical's editor context is in scope.
 */

import {
  $createTextNode,
  type LexicalNode,
} from "lexical";
import { $createLinkNode } from "@lexical/link";

import { $createAccentNode } from "../nodes/AccentNode";
import { tokenize } from "./tokens";

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

export { isPlainText } from "./tokens";
