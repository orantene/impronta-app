"use client";

/**
 * URL popover for linking a selected heading/paragraph/rich-text block without
 * arming inline edit. Lexical's link picker still owns a live text selection.
 */

import { useEffect, useRef } from "react";

import { CHROME, CHROME_RADII, Z_INDEX } from "./kit/tokens";
import { useEditorLocale } from "./use-editor-locale";

export function CanvasTextLinkPopover({
  draft,
  onDraftChange,
  onApply,
  onRemove,
  onClose,
}: {
  draft: string;
  onDraftChange: (next: string) => void;
  onApply: () => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const { t } = useEditorLocale();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      data-canvas-text-link-popover=""
      role="dialog"
      aria-label={t("Link URL")}
      style={{
        position: "absolute",
        bottom: "calc(100% + 8px)",
        left: 0,
        width: 280,
        padding: 10,
        borderRadius: CHROME_RADII.lg,
        background: CHROME.surface,
        border: `1px solid ${CHROME.lineStrong}`,
        boxShadow: "0 8px 24px rgba(0,0,0,0.14)",
        zIndex: Z_INDEX.floatingControls + 2,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <input
        ref={inputRef}
        type="url"
        value={draft}
        placeholder={t("Paste a URL")}
        aria-label={t("Link URL")}
        onChange={(event) => onDraftChange(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onApply();
          }
        }}
        style={{
          width: "100%",
          boxSizing: "border-box",
          borderRadius: 7,
          border: `1px solid ${CHROME.lineStrong}`,
          background: CHROME.controlFill,
          padding: "7px 10px",
          fontSize: 13,
          color: CHROME.ink,
          outline: "none",
        }}
      />
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={onRemove}
          style={{
            height: 28,
            paddingInline: 10,
            fontSize: 12,
            background: "transparent",
            border: `1px solid ${CHROME.lineStrong}`,
            borderRadius: 7,
            color: CHROME.muted,
            cursor: "pointer",
          }}
        >
          {t("Remove this link")}
        </button>
        <button
          type="button"
          onClick={onApply}
          style={{
            height: 28,
            paddingInline: 10,
            fontSize: 12,
            fontWeight: 600,
            background: CHROME.accent,
            border: `1px solid ${CHROME.accent}`,
            borderRadius: 7,
            color: "#fff",
            cursor: "pointer",
          }}
        >
          {t("Apply link")}
        </button>
      </div>
    </div>
  );
}
