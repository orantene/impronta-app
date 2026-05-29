"use client";

/**
 * Floating selection toolbar.
 *
 * Actions, in order: Bold / Italic / Accent / Color / Link.
 *
 * Color was added after the original Phase-C scope cap (Bold/Italic/Accent/
 * Link only) — the product owner asked for true inline color under the
 * "mimic any design" directive. It opens a palette popover: preset swatches
 * + an any-hex custom picker + a remove action.
 *
 * Behavior:
 *   - Visible only when there is a non-collapsed text selection inside
 *     the editor (or while the color palette is open).
 *   - Position anchors above the selection's bounding rect.
 *   - Buttons reflect active marks: Bold/Italic when selection has the
 *     stock format flag; Accent when the entire selection is contained
 *     in AccentNode(s); Color when the whole selection is one ColorNode
 *     run; Link when inside a LinkNode.
 *   - Click toggles the corresponding mark via Lexical commands.
 *   - Link button delegates to `LinkPickerPlugin` (popover).
 *   - Motion: ~120ms ease-out fade + 4px upward translate.
 *
 * Implementation notes:
 *   - We render a portal into `document.body` so the toolbar can escape
 *     overflow:hidden ancestors.
 *   - `mousedown` on the toolbar is e.preventDefault()'d so the
 *     ContentEditable doesn't lose selection mid-click. The native color
 *     `<input>` is the one control that DOES steal focus — so we snapshot
 *     the Lexical selection continuously and restore it before applying.
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createRangeSelection,
  $getNodeByKey,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  COMMAND_PRIORITY_LOW,
  FORMAT_TEXT_COMMAND,
  SELECTION_CHANGE_COMMAND,
} from "lexical";
import { $isLinkNode } from "@lexical/link";

import { $isAccentNode } from "../nodes/AccentNode";
import { $isColorNode } from "../nodes/ColorNode";
import { $toggleAccent } from "./toggleAccent";
import { $applyColor, $clearColor } from "./setColor";

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
  /** The uniform color of the selection, or null if mixed / uncolored. */
  color: string | null;
}

interface SelectionSnapshot {
  anchorKey: string;
  anchorOffset: number;
  anchorType: "text" | "element";
  focusKey: string;
  focusOffset: number;
  focusType: "text" | "element";
}

/** Preset swatches — neutrals + a spread that reads on light and dark grounds. */
const SWATCHES: ReadonlyArray<{ hex: string; label: string }> = [
  { hex: "#18181b", label: "Near-black" },
  { hex: "#71717a", label: "Gray" },
  { hex: "#dc2626", label: "Red" },
  { hex: "#ea580c", label: "Orange" },
  { hex: "#d97706", label: "Amber" },
  { hex: "#16a34a", label: "Green" },
  { hex: "#0d9488", label: "Teal" },
  { hex: "#2563eb", label: "Blue" },
  { hex: "#3d4f7c", label: "Indigo" },
  { hex: "#7c3aed", label: "Violet" },
  { hex: "#db2777", label: "Pink" },
  { hex: "#ffffff", label: "White" },
];

const DEFAULT_CUSTOM = "#3d4f7c";

export function ToolbarPlugin({ onRequestLink }: Props) {
  const [editor] = useLexicalComposerContext();
  const [state, setState] = useState<ToolbarState | null>(null);
  const [paletteRect, setPaletteRect] = useState<DOMRect | null>(null);
  const [lastColor, setLastColor] = useState<string>(DEFAULT_CUSTOM);
  const rootElRef = useRef<HTMLDivElement | null>(null);
  const selectionRef = useRef<SelectionSnapshot | null>(null);

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
        // Snapshot the live selection so the focus-stealing native color
        // input can restore it before applying.
        selectionRef.current = {
          anchorKey: selection.anchor.key,
          anchorOffset: selection.anchor.offset,
          anchorType: selection.anchor.type,
          focusKey: selection.focus.key,
          focusOffset: selection.focus.offset,
          focusType: selection.focus.type,
        };
        const nodes = selection.getNodes();
        let isAccent = nodes.length > 0;
        let isLink = false;
        let color: string | null = nodes.length > 0 ? "__init__" : null;
        for (const n of nodes) {
          if ($isTextNode(n)) {
            if (!$isAccentNode(n)) isAccent = false;
            // Color: every text node must be a ColorNode of the SAME hex.
            if ($isColorNode(n)) {
              const c = n.getColor();
              if (color === "__init__") color = c;
              else if (color !== c) color = null;
            } else {
              color = null;
            }
            const link = n.getParent();
            if (link && $isLinkNode(link)) isLink = true;
          }
        }
        if (color === "__init__") color = null;
        setState({
          rect,
          isBold: selection.hasFormat("bold"),
          isItalic: selection.hasFormat("italic"),
          isAccent,
          isLink,
          color,
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

  // Close the palette on Escape or an outside click.
  useEffect(() => {
    if (!paletteRect) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setPaletteRect(null);
    }
    function onDown(e: MouseEvent) {
      if (rootElRef.current && !rootElRef.current.contains(e.target as Node)) {
        setPaletteRect(null);
      }
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown, true);
    };
  }, [paletteRect]);

  /** Rebuild the snapshotted selection — only when the live one is gone. */
  function restoreSelection(): boolean {
    const snap = selectionRef.current;
    if (!snap) return false;
    // Guard against stale keys (nodes that no longer exist).
    if (!$getNodeByKey(snap.anchorKey) || !$getNodeByKey(snap.focusKey)) {
      return false;
    }
    try {
      const sel = $createRangeSelection();
      sel.anchor.set(snap.anchorKey, snap.anchorOffset, snap.anchorType);
      sel.focus.set(snap.focusKey, snap.focusOffset, snap.focusType);
      $setSelection(sel);
      return true;
    } catch {
      return false;
    }
  }

  /** Prefer the live selection; only rebuild from snapshot if it's gone. */
  function withSelection(run: () => void) {
    editor.update(() => {
      const live = $getSelection();
      const haveLive = $isRangeSelection(live) && !live.isCollapsed();
      if (!haveLive) restoreSelection();
      run();
    });
  }

  function applyColor(hex: string) {
    withSelection(() => $applyColor(hex));
    setLastColor(hex);
    setPaletteRect(null);
  }

  function removeColor() {
    withSelection(() => $clearColor());
    setPaletteRect(null);
  }

  const anchorRect = state?.rect ?? paletteRect;
  if (!anchorRect) return null;

  const top = Math.max(anchorRect.top - 44, 8);
  const left = Math.max(
    Math.min(
      anchorRect.left + anchorRect.width / 2 - 130,
      window.innerWidth - 268,
    ),
    8,
  );
  const swatchHex = state?.color ?? lastColor;

  return createPortal(
    <div
      ref={rootElRef}
      data-edit-overlay="rich-toolbar"
      role="toolbar"
      aria-label="Text formatting"
      onMouseDown={(e) => {
        // Keep the editor selection while clicking toolbar buttons. The
        // native color <input> opts out (it must focus to open).
        const t = e.target as HTMLElement;
        if (t.closest("[data-allow-focus]")) return;
        e.preventDefault();
      }}
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
        active={Boolean(state?.isBold)}
        title="Bold (⌘B)"
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold")}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M7 5h6.5a3.5 3.5 0 0 1 0 7H7z" />
          <path d="M7 12h7a3.5 3.5 0 0 1 0 7H7z" />
        </svg>
      </ToolbarButton>
      <ToolbarButton
        active={Boolean(state?.isItalic)}
        title="Italic (⌘I)"
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic")}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M19 4 L10 4" />
          <path d="M14 20 L5 20" />
          <path d="M15 4 L9 20" />
        </svg>
      </ToolbarButton>
      <ToolbarButton
        active={Boolean(state?.isAccent)}
        title="Accent"
        onClick={() => editor.update(() => $toggleAccent())}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M19 4 L8 19" />
          <path d="M5 19 L8 19" />
          <path d="M16 4 L19 4" />
        </svg>
      </ToolbarButton>

      {/* Color — opens the palette popover. "A" over a color bar + chevron. */}
      <button
        type="button"
        title="Text color"
        aria-label="Text color"
        aria-pressed={Boolean(state?.color)}
        aria-expanded={Boolean(paletteRect)}
        onClick={() => {
          if (paletteRect) {
            setPaletteRect(null);
          } else if (state?.rect) {
            setPaletteRect(state.rect);
          }
        }}
        className={[
          "inline-flex h-7 items-center gap-1 rounded-full pl-2 pr-1.5 transition",
          state?.color || paletteRect ? "bg-white/15" : "hover:bg-white/10",
        ].join(" ")}
      >
        <span className="flex flex-col items-center justify-center leading-none">
          <span className="text-[11px] font-bold leading-none">A</span>
          <span
            className="mt-[2px] block h-[3.5px] w-[15px] rounded-sm ring-1 ring-inset ring-white/30"
            style={{ backgroundColor: swatchHex }}
          />
        </span>
        <svg
          width="9"
          height="9"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-white/70"
          aria-hidden
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      <span className="mx-0.5 h-4 w-px bg-white/15" />
      <ToolbarButton
        active={Boolean(state?.isLink)}
        title="Link (⌘K)"
        onClick={() => {
          if (!state) return;
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

      {paletteRect ? (
        <div
          role="dialog"
          aria-label="Text color palette"
          className="absolute left-1/2 top-full z-10 mt-2 w-[244px] -translate-x-1/2 rounded-xl border border-[#2e3452] bg-[#242942] p-2.5 shadow-2xl"
        >
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-white/55">
              Text color
            </span>
            <button
              type="button"
              onClick={removeColor}
              className="rounded px-1.5 py-0.5 text-[10px] font-medium text-white/55 transition hover:bg-white/10 hover:text-white"
            >
              Remove
            </button>
          </div>
          <div className="grid grid-cols-6 gap-1.5">
            {SWATCHES.map((s) => {
              const selected = state?.color?.toLowerCase() === s.hex;
              return (
                <button
                  key={s.hex}
                  type="button"
                  title={s.label}
                  aria-label={s.label}
                  onClick={() => applyColor(s.hex)}
                  className={[
                    "h-7 w-7 rounded-md border transition",
                    selected
                      ? "border-white ring-2 ring-white/40"
                      : "border-white/15 hover:border-white/40",
                  ].join(" ")}
                  style={{ backgroundColor: s.hex }}
                />
              );
            })}
          </div>
          <label
            data-allow-focus
            className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5"
          >
            <span className="text-[11px] font-medium text-white/75">
              Custom
            </span>
            <span className="flex items-center gap-1.5">
              <span className="font-mono text-[10px] uppercase text-white/45">
                {swatchHex}
              </span>
              <input
                data-allow-focus
                type="color"
                value={swatchHex}
                onChange={(e) => applyColor(e.target.value)}
                className="h-6 w-8 cursor-pointer rounded border-0 bg-transparent p-0"
              />
            </span>
          </label>
        </div>
      ) : null}
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
