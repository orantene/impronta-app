"use client";

import { useCallback, useEffect, useState } from "react";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getSelection,
  $isRangeSelection,
  SELECTION_CHANGE_COMMAND,
  COMMAND_PRIORITY_LOW,
} from "lexical";
import { $isColorNode } from "../nodes/ColorNode";

import { ColorPickerPopover } from "../../kit/color-picker";
import {
  registerCanvasToolbarBridge,
  setActiveCanvasLexicalEditor,
} from "../../canvas-lexical-bridge";
import { $applyColor } from "./setColor";
import { requestLinkFromEditor } from "./requestLinkFromEditor";

interface Props {
  onRequestLink: (rect: DOMRect, currentUrl: string | null) => void;
}

/**
 * Registers the inline canvas editor for the white toolbar and mounts
 * link/color surfaces that the external toolbar triggers.
 */
export function CanvasLexicalBridgePlugin({ onRequestLink }: Props) {
  const [editor] = useLexicalComposerContext();
  const [colorOpen, setColorOpen] = useState(false);
  const [colorAnchor, setColorAnchor] = useState<HTMLElement | null>(null);
  const [colorValue, setColorValue] = useState("#18181b");

  const readUniformColor = useCallback(() => {
    let next = "#18181b";
    editor.getEditorState().read(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      const nodes = selection.getNodes();
      if (nodes.length === 0) return;
      let uniform: string | null = null;
      for (const node of nodes) {
        const parent = node.getParent();
        if (!parent || !$isColorNode(parent)) {
          uniform = null;
          break;
        }
        const hex = parent.getColor();
        if (uniform === null) uniform = hex;
        else if (uniform !== hex) {
          uniform = null;
          break;
        }
      }
      if (uniform) next = uniform;
    });
    setColorValue(next);
  }, [editor]);

  useEffect(() => {
    setActiveCanvasLexicalEditor(editor);
    registerCanvasToolbarBridge({
      requestLink: () => {
        requestLinkFromEditor(editor, onRequestLink);
      },
      requestColor: (anchor) => {
        readUniformColor();
        setColorAnchor(anchor);
        setColorOpen(true);
        editor.focus();
      },
    });
    return () => {
      setActiveCanvasLexicalEditor(null);
      registerCanvasToolbarBridge(null);
    };
  }, [editor, onRequestLink, readUniformColor]);

  useEffect(() => {
    return editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      () => {
        if (colorOpen) readUniformColor();
        return false;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [colorOpen, editor, readUniformColor]);

  return (
    <ColorPickerPopover
      open={colorOpen}
      anchor={colorAnchor}
      value={colorValue}
      onChange={(hex) => {
        setColorValue(hex);
        editor.update(() => $applyColor(hex));
      }}
      onClose={() => setColorOpen(false)}
    />
  );
}
