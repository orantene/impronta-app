import {
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  type LexicalEditor,
} from "lexical";
import { $isLinkNode } from "@lexical/link";

/** Opens the link picker anchored to the current native selection. */
export function requestLinkFromEditor(
  editor: LexicalEditor,
  onRequestLink: (rect: DOMRect, currentUrl: string | null) => void,
): boolean {
  editor.focus();
  const native = window.getSelection();
  if (!native || native.rangeCount === 0) {
    const root = editor.getRootElement();
    if (!root) return false;
    const rect = root.getBoundingClientRect();
    onRequestLink(rect, null);
    return true;
  }
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
