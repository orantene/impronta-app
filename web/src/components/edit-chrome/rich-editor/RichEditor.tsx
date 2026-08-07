"use client";
import { logServerError } from "@/lib/server/safe-error";

/**
 * Phase C — `<RichEditor>` is the inspector-side primitive that replaces
 * raw `<input>` / `<textarea>` for rich-eligible text fields. It renders
 * marker text live (operators see `Impronta` in italic blush, not the
 * literal `{accent}Impronta{/accent}`), supports the four toolbar
 * actions (Bold / Italic / Accent / Link), and serializes back to the
 * existing marker grammar on every change.
 *
 * Two variants:
 *   - `single`: single line. Enter is swallowed.
 *   - `multi`:  multi-line. Enter inserts a paragraph; serialized with
 *     paragraphs joined by `\n` so storage stays a single string.
 *
 * No new storage shape. No data migration. The public render path
 * (`renderInlineRich` in `shared/rich-text.tsx`) is unchanged.
 */

import { useCallback, useState } from "react";

import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { PlainTextPlugin } from "@lexical/react/LexicalPlainTextPlugin";
import { LinkNode } from "@lexical/link";
import {
  $createParagraphNode,
  $getRoot,
  type LexicalEditor,
} from "lexical";

import { AccentNode } from "./nodes/AccentNode";
import { ColorNode } from "./nodes/ColorNode";
import { markerStringToNodes } from "./transformers/markerToLexical";
import { richEditorTheme } from "./theme";
import { ToolbarPlugin } from "./plugins/ToolbarPlugin";
import { SerializePlugin } from "./plugins/SerializePlugin";
import { KeyboardShortcutsPlugin } from "./plugins/KeyboardShortcutsPlugin";
import { CanvasLexicalBridgePlugin } from "./plugins/CanvasLexicalBridgePlugin";
import { SingleLinePlugin } from "./plugins/SingleLinePlugin";
import { LinkPickerPopover } from "./plugins/LinkPickerPopover";
import { FormatPlugin } from "./plugins/FormatPlugin";
import {
  AutoFocusCaretPlugin,
  type CaretPoint,
} from "./plugins/AutoFocusCaretPlugin";

export type RichEditorVariant = "single" | "multi";

interface Props {
  /** The current marker-format string. */
  value: string;
  /** Called with the new marker-format string on each meaningful change. */
  onChange: (next: string) => void;
  variant?: RichEditorVariant;
  /** Used to scope the LinkPicker's asset/talent/page lookups. */
  tenantId?: string;
  /** Operator-facing placeholder when the field is empty. */
  placeholder?: string;
  /** Optional className applied to the editable surface. */
  className?: string;
  /** Tab through to additional fields. */
  ariaLabel?: string;
  /** When the editor mounts read-only (rare). */
  readOnly?: boolean;
  /** Hide Lexical's dark floating toolbar (canvas text toolbar owns formatting UI). */
  suppressFloatingToolbar?: boolean;
  /**
   * WAVE 2.1 — when provided, the editor focuses itself on mount and drops the
   * caret at this viewport point (the canvas overlay passes the point of the
   * opening double-click). The ref is consumed once. Omitted by the inspector,
   * which must not steal focus when a field renders.
   */
  autoFocusCaretRef?: { current: CaretPoint | null };
}

/**
 * Build the initial Lexical state from the marker string. The string
 * may contain `\n` newlines — each becomes a separate paragraph node
 * (multi-line variant) or is collapsed into spaces (single-line variant).
 */
function buildInitialState(value: string, variant: RichEditorVariant) {
  return (editor: LexicalEditor) => {
    editor.update(() => {
      const root = $getRoot();
      // Lexical fills root with an initial empty paragraph; clear it.
      root.clear();
      const lines =
        variant === "multi"
          ? (value || "").split("\n")
          : [(value || "").replace(/\n/g, " ")];
      if (lines.length === 0) lines.push("");
      for (const line of lines) {
        const paragraph = $createParagraphNode();
        const nodes = markerStringToNodes(line);
        for (const n of nodes) paragraph.append(n);
        root.append(paragraph);
      }
    });
  };
}

export function RichEditor({
  value,
  onChange,
  variant = "single",
  tenantId,
  placeholder,
  className,
  ariaLabel,
  readOnly,
  suppressFloatingToolbar,
  autoFocusCaretRef,
}: Props) {
  const [linkAnchor, setLinkAnchor] = useState<{
    rect: DOMRect;
    currentUrl: string | null;
  } | null>(null);

  const onRequestLink = useCallback(
    (rect: DOMRect, currentUrl: string | null) => {
      setLinkAnchor({ rect, currentUrl });
    },
    [],
  );

  const initialConfig = {
    namespace: "phase-c-rich-editor",
    theme: richEditorTheme,
    nodes: [AccentNode, ColorNode, LinkNode],
    editable: !readOnly,
    onError: (error: Error) => {
      logServerError("inline_editor", error);
    },
    editorState: buildInitialState(value, variant),
  };

  const inputClass =
    className ??
    [
      "w-full rounded-lg border border-[#e5e0d5] bg-[#faf9f6] px-3 py-2 text-[13px] text-stone-800",
      variant === "multi" ? "min-h-[80px]" : "",
      "outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/15 focus-visible:border-indigo-300 transition-colors",
      "whitespace-pre-wrap break-words",
    ]
      .filter(Boolean)
      .join(" ");

  return (
    <div className="relative" data-edit-rich-field={variant}>
      <LexicalComposer initialConfig={initialConfig}>
        <PlainTextPlugin
          contentEditable={
            placeholder ? (
              <ContentEditable
                aria-label={ariaLabel ?? "Rich text editor"}
                aria-placeholder={placeholder}
                placeholder={
                  <div className="pointer-events-none absolute left-3 top-2 text-[13px] text-stone-500">
                    {placeholder}
                  </div>
                }
                className={inputClass}
              />
            ) : (
              <ContentEditable
                aria-label={ariaLabel ?? "Rich text editor"}
                placeholder={null}
                className={inputClass}
              />
            )
          }
          ErrorBoundary={LexicalErrorBoundary}
        />
        <LinkPlugin />
        <FormatPlugin />
        <SerializePlugin onChange={onChange} multiline={variant === "multi"} />
        <KeyboardShortcutsPlugin onRequestLink={onRequestLink} />
        <ToolbarPlugin
          onRequestLink={onRequestLink}
          suppressChrome={suppressFloatingToolbar}
        />
        {suppressFloatingToolbar ? (
          <CanvasLexicalBridgePlugin onRequestLink={onRequestLink} />
        ) : null}
        {variant === "single" ? <SingleLinePlugin /> : null}
        {autoFocusCaretRef ? (
          <AutoFocusCaretPlugin caretPointRef={autoFocusCaretRef} />
        ) : null}
        <LinkPickerPopover
          anchor={linkAnchor}
          tenantId={tenantId}
          onClose={() => setLinkAnchor(null)}
        />
      </LexicalComposer>
    </div>
  );
}
