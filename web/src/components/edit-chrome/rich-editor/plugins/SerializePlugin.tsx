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
 * The first emit (mount) is suppressed because the initial state was
 * built FROM the input — emitting it back would bounce.
 */

import { useEffect, useRef } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getRoot, $isParagraphNode } from "lexical";

import { lexicalNodesToMarkerString } from "../transformers/lexicalToMarker";

interface Props {
  onChange: (value: string) => void;
  /** Multi-line variant emits paragraphs joined with \n. */
  multiline: boolean;
}

export function SerializePlugin({ onChange, multiline }: Props) {
  const [editor] = useLexicalComposerContext();
  const lastEmitRef = useRef<string | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState, dirtyElements, dirtyLeaves }) => {
      // Skip first emit — that's the initial state we just built FROM the input.
      if (!mountedRef.current) {
        mountedRef.current = true;
        editorState.read(() => {
          lastEmitRef.current = collect(multiline);
        });
        return;
      }

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
  const paragraphs = root.getChildren().filter($isParagraphNode);
  if (paragraphs.length === 0) return "";
  if (!multiline) {
    return lexicalNodesToMarkerString(paragraphs[0]!.getChildren());
  }
  return paragraphs
    .map((p) => lexicalNodesToMarkerString(p.getChildren()))
    .join("\n");
}
