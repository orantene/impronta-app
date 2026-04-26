"use client";

/**
 * Phase C — variant="single" enforces no line breaks.
 *
 * Intercepts Enter so it never inserts a paragraph or line break. If a
 * paste produces multiple paragraphs anyway, a node transform merges
 * them on the next tick so we always render at most one paragraph.
 * Used for headlines / subheadlines / titles where the public render
 * is a single inline element.
 */

import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getRoot,
  $isParagraphNode,
  COMMAND_PRIORITY_HIGH,
  KEY_ENTER_COMMAND,
  ParagraphNode,
} from "lexical";

export function SingleLinePlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const unregisterEnter = editor.registerCommand(
      KEY_ENTER_COMMAND,
      (event) => {
        event?.preventDefault();
        return true; // swallow — never insert a break
      },
      COMMAND_PRIORITY_HIGH,
    );

    const unregisterTransform = editor.registerNodeTransform(
      ParagraphNode,
      () => {
        const root = $getRoot();
        const paragraphs = root.getChildren().filter($isParagraphNode);
        if (paragraphs.length <= 1) return;
        const first = paragraphs[0]!;
        for (let i = 1; i < paragraphs.length; i += 1) {
          const p = paragraphs[i]!;
          for (const child of p.getChildren()) {
            first.append(child);
          }
          p.remove();
        }
      },
    );

    return () => {
      unregisterEnter();
      unregisterTransform();
    };
  }, [editor]);

  return null;
}
