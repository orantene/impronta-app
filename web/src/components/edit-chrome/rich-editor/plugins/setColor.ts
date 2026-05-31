/**
 * Apply / clear an inline color over the current range selection.
 *
 * `$applyColor` replaces the selected text run(s) with `ColorNode`
 * equivalents carrying the given hex; re-applying over an existing color run
 * just repaints it. `$clearColor` does the inverse — `ColorNode` → plain
 * `TextNode`.
 *
 * Like `$toggleAccent`, color supersedes bold / italic / accent at the
 * marker layer (the grammar is non-nesting), so we do NOT carry sibling
 * format onto the new node — the editor then shows exactly what will
 * persist.
 *
 * Callers must wrap in `editor.update(() => $applyColor(hex))`.
 */

import {
  $createTextNode,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
} from "lexical";

import { $createColorNode, $isColorNode } from "../nodes/ColorNode";

export function $applyColor(color: string) {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || selection.isCollapsed()) return;

  const nodes = selection.extract();
  for (const n of nodes) {
    if (!$isTextNode(n)) continue;
    if ($isColorNode(n)) {
      // Already a color run — repaint in place, keeps the same node.
      n.setColor(color);
      continue;
    }
    const replacement = $createColorNode(n.getTextContent(), color);
    n.replace(replacement);
  }
}

export function $clearColor() {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || selection.isCollapsed()) return;

  const nodes = selection.extract();
  for (const n of nodes) {
    if (!$isColorNode(n)) continue;
    const replacement = $createTextNode(n.getTextContent());
    replacement.setFormat(n.getFormat());
    n.replace(replacement);
  }
}
