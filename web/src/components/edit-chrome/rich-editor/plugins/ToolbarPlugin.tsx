"use client";

/**
 * Phase C — floating selection toolbar.
 *
 * Four actions, in order: Bold / Italic / Accent / Link. No font picker,
 * no color wheel, no alignment, no font size. Per §17 + Phase C scope cap.
 *
 * Behavior:
 *   - Visible only when there is a non-collapsed text selection inside
 *     the editor.
 *   - Position anchors above the selection's bounding rect.
 *   - Buttons reflect active marks: Bold/Italic when selection has the
 *     stock format flag; Accent when the entire selection is contained
 *     in AccentNode(s); Link when inside a LinkNode.
 *   - Click toggles the corresponding mark via Lexical commands.
 *   - Link button delegates to `LinkPickerPlugin` (popover).
 *   - Motion: ~120ms ease-out fade + 4px upward translate (matches §17).
 *
 * Implementation notes:
 *   - We render a portal into `document.body` so the toolbar can escape
 *     overflow:hidden ancestors.
 *   - `mousedown` on the toolbar is e.preventDefault()'d so the
 *     ContentEditable doesn't lose selection mid-click.
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_LOW,
  FORMAT_TEXT_COMMAND,
  SELECTION_CHANGE_COMMAND,
} from "lexical";
import { $isLinkNode } from "@lexical/link";

import { $isAccentNode } from "../nodes/AccentNode";
import { $toggleAccent } from "./toggleAccent";

interface Props {
  /** Called when user clicks the Link button. Caller mounts LinkPicker. */
  onRequestLink: (rect: DOMRect, currentUrl: string | null) => void;
}

interface ToolbarState {
  rect: DOMRect;
  isBold: boolean;
  isItalic: boolean;
  isAccent: boolean;
  isLink: boolean;
}

export function ToolbarPlugin({ onRequestLink }: Props) {
  const [editor] = useLexicalComposerContext();
  const [state, setState] = useState<ToolbarState | null>(null);

  useEffect(() => {
    function update() {
      editor.getEditorState().read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || selection.isCollapsed()) {
          setState(null);
          return;
        }
        const native = window.getSelection();
        if (!native || native.rangeCount === 0) {
          setState(null);
          return;
        }
        const rect = native.getRangeAt(0).getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) {
          setState(null);
          return;
        }
        const nodes = selection.getNodes();
        let isAccent = nodes.length > 0;
        let isLink = false;
        for (const n of nodes) {
          if ($isTextNode(n)) {
            if (!$isAccentNode(n)) isAccent = false;
            const link = n.getParent();
            if (link && $isLinkNode(link)) isLink = true;
          }
        }
        setState({
          rect,
          isBold: selection.hasFormat("bold"),
          isItalic: selection.hasFormat("italic"),
          isAccent,
          isLink,
        });
      });
    }

    const unregisterCommand = editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      () => {
        update();
        return false;
      },
      COMMAND_PRIORITY_LOW,
    );
    const unregisterUpdate = editor.registerUpdateListener(() => update());
    document.addEventListener("selectionchange", update);
    window.addEventListener("scroll", update, { capture: true, passive: true });
    window.addEventListener("resize", update);
    return () => {
      unregisterCommand();
      unregisterUpdate();
      document.removeEventListener("selectionchange", update);
      window.removeEventListener("scroll", update, {
        capture: true,
      } as EventListenerOptions);
      window.removeEventListener("resize", update);
    };
  }, [editor]);

  if (!state) return null;

  const top = Math.max(state.rect.top - 44, 8);
  const left = Math.max(
    Math.min(
      state.rect.left + state.rect.width / 2 - 110,
      window.innerWidth - 228,
    ),
    8,
  );

  return createPortal(
    <div
      data-edit-overlay="rich-toolbar"
      onMouseDown={(e) => e.preventDefault()}
      style={{
        position: "fixed",
        top,
        left,
        zIndex: 130,
        transition: "opacity 120ms ease-out, transform 120ms ease-out",
        opacity: 1,
        transform: "translateY(0)",
      }}
      className="pointer-events-auto inline-flex items-center gap-0.5 rounded-full border border-[#2e3452] bg-[#242942]/95 px-1.5 py-1 text-white shadow-xl backdrop-blur"
    >
      <ToolbarButton
        active={state.isBold}
        title="Bold (⌘B)"
        onClick={() =>
          editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold")
        }
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M7 5h6.5a3.5 3.5 0 0 1 0 7H7z" />
          <path d="M7 12h7a3.5 3.5 0 0 1 0 7H7z" />
        </svg>
      </ToolbarButton>
      <ToolbarButton
        active={state.isItalic}
        title="Italic (⌘I)"
        onClick={() =>
          editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic")
        }
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M19 4 L10 4" />
          <path d="M14 20 L5 20" />
          <path d="M15 4 L9 20" />
        </svg>
      </ToolbarButton>
      <ToolbarButton
        active={state.isAccent}
        title="Accent"
        onClick={() => editor.update(() => $toggleAccent())}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M19 4 L8 19" />
          <path d="M5 19 L8 19" />
          <path d="M16 4 L19 4" />
        </svg>
      </ToolbarButton>
      <span className="mx-0.5 h-4 w-px bg-white/15" />
      <ToolbarButton
        active={state.isLink}
        title="Link (⌘K)"
        onClick={() => {
          // Read the existing URL synchronously inside editor scope.
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
          onRequestLink(state.rect, url);
        }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
      </ToolbarButton>
    </div>,
    document.body,
  );
}

interface ToolbarButtonProps {
  active: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}
function ToolbarButton({ active, title, onClick, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      onClick={onClick}
      className={[
        "inline-flex h-7 w-7 items-center justify-center rounded-full transition",
        active ? "bg-white text-zinc-900" : "text-white hover:bg-white/10",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
