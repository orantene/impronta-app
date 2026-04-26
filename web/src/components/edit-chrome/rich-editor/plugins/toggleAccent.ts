/**
 * Phase C — toggle accent over the current range selection.
 *
 * Replaces the selected TextNode(s) with AccentNode equivalents, or
 * inverse: replaces selected AccentNode(s) with plain TextNode(s).
 *
 * Caller must wrap in `editor.update(() => $toggleAccent())`.
 */

import {
  $createTextNode,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
} from "lexical";

import { $createAccentNode, $isAccentNode } from "../nodes/AccentNode";

export function $toggleAccent() {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || selection.isCollapsed()) return;

  // Determine current state: if every text node in the selection is
  // already an AccentNode, we strip; otherwise we wrap.
  const nodes = selection.extract();
  if (nodes.length === 0) return;

  const allAccent =
    nodes.length > 0 &&
    nodes.every((n) => $isTextNode(n) && $isAccentNode(n));

  if (allAccent) {
    for (const n of nodes) {
      if (!$isTextNode(n) || !$isAccentNode(n)) continue;
      const replacement = $createTextNode(n.getTextContent());
      replacement.setFormat(n.getFormat());
      n.replace(replacement);
    }
    return;
  }

  for (const n of nodes) {
    if (!$isTextNode(n)) continue;
    if ($isAccentNode(n)) continue;
    const replacement = $createAccentNode(n.getTextContent());
    n.replace(replacement);
  }
}
