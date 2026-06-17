"use client";

/**
 * InlineNameInput — replace native window.prompt() for preset naming.
 *
 * INS-3 (Builder Ecosystem 2026, Phase 5): drops all four window.prompt/
 * window.confirm callsites (style-presets-bar, style-panel rename/import,
 * builder-node-content block preset, linked-style-classes-bar delete) and
 * replaces them with an accessible inline overlay that follows the existing
 * InspectorInput visual language.
 *
 * Two modes:
 *   "text"    — shows a text field pre-filled with `defaultValue`; user
 *               edits and confirms with Enter or the confirm button.
 *   "confirm" — shows a short message with Confirm / Cancel buttons.
 *
 * Focus management: auto-focuses the input (text mode) or the confirm button
 * (confirm mode) on mount. Escape cancels without committing.
 *
 * Accessibility: role=dialog, aria-modal=true, aria-label from `title`.
 */

import { useEffect, useRef, type KeyboardEvent } from "react";
import { CHROME } from "../../kit/tokens";

export interface InlineNameInputProps {
  mode: "text" | "confirm";
  title: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Rendered inside the overlay above the input (e.g. a question or instruction) */
  description?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

export function InlineNameInput({
  mode,
  title,
  placeholder = "Enter name…",
  defaultValue = "",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  description,
  onConfirm,
  onCancel,
}: InlineNameInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (mode === "text") {
      inputRef.current?.focus();
      inputRef.current?.select();
    } else {
      confirmBtnRef.current?.focus();
    }
  }, [mode]);

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  }

  function handleConfirm() {
    const value = mode === "text" ? (inputRef.current?.value ?? defaultValue) : defaultValue;
    onConfirm(value);
  }

  function handleInputKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleConfirm();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onKeyDown={handleKeyDown}
      style={{
        borderRadius: 10,
        border: `1px solid ${CHROME.controlBorder}`,
        background: CHROME.surface,
        boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
        padding: "10px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      {description ? (
        <p
          style={{
            fontSize: 12,
            color: CHROME.muted,
            lineHeight: "1.45",
            margin: 0,
          }}
        >
          {description}
        </p>
      ) : null}
      {mode === "text" ? (
        <input
          ref={inputRef}
          type="text"
          defaultValue={defaultValue}
          placeholder={placeholder}
          aria-label={title}
          onKeyDown={handleInputKeyDown}
          style={{
            width: "100%",
            borderRadius: 7,
            border: `1px solid ${CHROME.controlBorder}`,
            background: CHROME.paper,
            padding: "7px 10px",
            fontSize: 13,
            color: CHROME.ink,
            outline: "none",
            boxSizing: "border-box",
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = CHROME.blue;
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = CHROME.controlBorder;
          }}
        />
      ) : null}
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={onCancel}
          style={{
            height: 28,
            paddingInline: 10,
            fontSize: 12,
            fontWeight: 500,
            background: "transparent",
            border: `1px solid ${CHROME.controlBorder}`,
            borderRadius: 7,
            color: CHROME.muted,
            cursor: "pointer",
          }}
        >
          {cancelLabel}
        </button>
        <button
          ref={confirmBtnRef}
          type="button"
          onClick={handleConfirm}
          style={{
            height: 28,
            paddingInline: 10,
            fontSize: 12,
            fontWeight: 600,
            background: mode === "confirm" ? CHROME.amberBg : CHROME.accent,
            border: `1px solid ${mode === "confirm" ? CHROME.amberLine : CHROME.accent}`,
            borderRadius: 7,
            color: mode === "confirm" ? CHROME.amber : "#fff",
            cursor: "pointer",
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}
