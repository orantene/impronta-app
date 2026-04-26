"use client";

/**
 * Phase C — popover wrapper around the existing `shared/LinkPicker`.
 *
 * The toolbar's Link button + ⌘K both invoke this. The popover anchors
 * above the selection rect (or below if there isn't enough room above),
 * dismisses on outside-click, and dispatches Lexical's TOGGLE_LINK_COMMAND
 * with the picked URL. Empty URL unwraps the link.
 *
 * `LinkPicker` itself is reused intact — no changes to its props or
 * behavior.
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { TOGGLE_LINK_COMMAND } from "@lexical/link";

import { LinkPicker } from "@/lib/site-admin/sections/shared/LinkPicker";

interface Props {
  anchor: { rect: DOMRect; currentUrl: string | null } | null;
  tenantId?: string;
  onClose: () => void;
}

export function LinkPickerPopover({ anchor, tenantId, onClose }: Props) {
  const [editor] = useLexicalComposerContext();
  const [draft, setDraft] = useState<string>(anchor?.currentUrl ?? "");
  const popoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setDraft(anchor?.currentUrl ?? "");
  }, [anchor]);

  useEffect(() => {
    if (!anchor) return;
    function onDown(e: MouseEvent) {
      if (!popoverRef.current) return;
      if (popoverRef.current.contains(e.target as Node)) return;
      onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [anchor, onClose]);

  if (!anchor) return null;

  const POPOVER_W = 360;
  const POPOVER_H = 240;
  const top =
    anchor.rect.top - POPOVER_H - 16 > 8
      ? anchor.rect.top - POPOVER_H - 16
      : Math.min(anchor.rect.bottom + 12, window.innerHeight - POPOVER_H - 8);
  const left = Math.max(
    Math.min(
      anchor.rect.left + anchor.rect.width / 2 - POPOVER_W / 2,
      window.innerWidth - POPOVER_W - 8,
    ),
    8,
  );

  function apply(value: string) {
    const trimmed = value.trim();
    editor.dispatchCommand(
      TOGGLE_LINK_COMMAND,
      trimmed === "" ? null : trimmed,
    );
    onClose();
  }

  return createPortal(
    <div
      ref={popoverRef}
      data-edit-overlay="rich-link-popover"
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        position: "fixed",
        top,
        left,
        width: POPOVER_W,
        zIndex: 140,
      }}
      className="rounded-lg border border-zinc-200 bg-white p-3 shadow-2xl"
    >
      <div className="flex items-center justify-between pb-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Link target
        </span>
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Close"
        >
          ✕
        </button>
      </div>
      <LinkPicker
        value={draft}
        onChange={(next) => setDraft(next)}
        tenantId={tenantId}
      />
      <div className="mt-3 flex items-center justify-between gap-2">
        <button
          type="button"
          className="rounded-md border border-zinc-200 px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => apply("")}
          title="Remove the link"
        >
          Remove link
        </button>
        <button
          type="button"
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800"
          onClick={() => apply(draft)}
        >
          Apply
        </button>
      </div>
    </div>,
    document.body,
  );
}
