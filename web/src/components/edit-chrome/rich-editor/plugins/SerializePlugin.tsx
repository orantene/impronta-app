"use client";

/**
 * Phase C — converts the live Lexical state back to our marker grammar
 * on every change and forwards the result via `onChange(value)`.
 *
 * Optimization rule from the migration-pass plan §6: if the serialized
 * value equals the last-emitted value, we skip the call. This prevents
 * the inspector's autosave loop from churning DB rows on idle focus
 * cycles.
 *
 * The mount emit is suppressed by seeding `lastEmitRef` from the
 * input string: a mount-only update serializes to the same value and
 * is skipped. A real click that mutates the tree serializes to a
 * different string and writes. Do not skip the first listener fire
 * blindly: that fire is often the click, because the initial
 * editorState update ran before this plugin subscribed.
 */

import { useEffect, useRef } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getRoot, $isParagraphNode } from "lexical";

import { lexicalNodesToMarkerString } from "../transformers/lexicalToMarker";
import {
  $isBuilderListItemNode,
  $isBuilderListNode,
} from "../nodes/ListNode";
import { serializeListBlock } from "@/lib/site-admin/sections/shared/rich-text-lists";

interface Props {
  onChange: (value: string) => void;
  /** Multi-line variant emits paragraphs joined with \n. */
  multiline: boolean;
  /**
   * The marker string the editor was built from. Used so the first
   * contentful update (a real click) is not swallowed as a "mount emit".
   * Mounts only seed this; they do not call onChange.
   */
  seed: string;
}

export function SerializePlugin({ onChange, multiline, seed }: Props) {
  const [editor] = useLexicalComposerContext();
  const lastEmitRef = useRef(seed);

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState, dirtyElements, dirtyLeaves }) => {
      // Skip selection-only changes (no actual content change).
      if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return;

      editorState.read(() => {
        const next = collect(multiline);
        if (next === lastEmitRef.current) return;
        lastEmitRef.current = next;
        onChange(next);
      });
    });
  }, [editor, multiline, onChange]);

  return null;
}

function collect(multiline: boolean): string {
  const root = $getRoot();
  const parts: string[] = [];
  for (const child of root.getChildren()) {
    if ($isBuilderListNode(child)) {
      const kind = child.getListType() === "number" ? "ol" : "ul";
      const items = child
        .getChildren()
        .filter($isBuilderListItemNode)
        .map((item) => lexicalNodesToMarkerString(item.getChildren()));
      parts.push(serializeListBlock(kind, items));
      continue;
    }
    if ($isParagraphNode(child)) {
      parts.push(lexicalNodesToMarkerString(child.getChildren()));
    }
  }
  if (parts.length === 0) return "";
  if (!multiline) return parts.join("\n");
  return parts.join("\n");
}
