"use client";

/**
 * CssEditorWithHints — shared Custom CSS textarea with inline error hints.
 *
 * Drop-in replacement for the raw <textarea> used in both the section-level
 * and node-level Custom CSS controls inside style-panel.tsx. Composes the
 * css-validator advisory checks and surfaces errors as a non-blocking inline
 * banner below the editor.
 *
 * Design constraints:
 *   - Advisory only — errors never block saving. The operator can ignore them.
 *   - Debounced — validation runs 400ms after the last keystroke so it doesn't
 *     thrash on each character.
 *   - Zero extra deps — no Prism / Monaco / CodeMirror. A plain <textarea>
 *     with a styled hint strip is the right tool at this scale.
 *   - Accessible — the error banner is an aria-live="polite" region so screen
 *     readers announce new errors without interrupting typing.
 *
 * Props mirror the <textarea> subset needed at both call sites, plus an
 * `onValueChange` callback that matches the existing `onChange` pattern in
 * style-panel.
 */

import { useEffect, useRef, useState } from "react";

import { CHROME } from "../../kit/tokens";
import { validateCss, type CssError } from "./css-validator";

interface CssEditorWithHintsProps {
  /** Current CSS string value (controlled). */
  value: string;
  /** Called whenever the value changes (controlled pattern). */
  onValueChange: (next: string) => void;
  /** Placeholder text shown when the editor is empty. */
  placeholder?: string;
  /** Number of visible rows (defaults to 6). */
  rows?: number;
  /** Additional inline styles on the textarea element. */
  textareaStyle?: React.CSSProperties;
  /** aria-label for the textarea (accessibility). */
  ariaLabel?: string;
}

/**
 * Shared CSS editor with advisory error hints.
 * Replaces the raw <textarea> at both Custom CSS call sites.
 */
export function CssEditorWithHints({
  value,
  onValueChange,
  placeholder,
  rows = 6,
  textareaStyle,
  ariaLabel = "Custom CSS",
}: CssEditorWithHintsProps) {
  const [errors, setErrors] = useState<CssError[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Validate whenever value changes, debounced 400ms.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value || !value.trim()) {
      // Clear errors immediately when the field is blanked.
      setErrors([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      setErrors(validateCss(value));
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value]);

  const hasErrors = errors.some((e) => e.severity === "error");
  const hasWarnings = errors.some((e) => e.severity === "warning") && !hasErrors;

  const borderColor = hasErrors
    ? CHROME.rose
    : hasWarnings
      ? CHROME.amber
      // Inspector Reset P5: idle edge cools from khaki controlBorder to
      // lineStrong, matching NumberUnit/InspectorSelect.
      : CHROME.lineStrong;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <textarea
        value={value}
        onChange={(e) => onValueChange(e.target.value || "")}
        placeholder={placeholder}
        spellCheck={false}
        rows={rows}
        aria-label={ariaLabel}
        aria-describedby={errors.length > 0 ? "css-editor-hints" : undefined}
        aria-invalid={hasErrors}
        style={{
          width: "100%",
          padding: "8px 10px",
          fontSize: 11.5,
          lineHeight: 1.45,
          fontFamily: "ui-monospace, SFMono-Regular, monospace",
          background: CHROME.surface2,
          border: `1px solid ${borderColor}`,
          borderRadius: 7,
          color: CHROME.ink,
          outline: "none",
          resize: "vertical",
          minHeight: 110,
          transition: "border-color 150ms, box-shadow 150ms",
          ...textareaStyle,
        }}
        onFocus={(e) => {
          (e.target as HTMLTextAreaElement).style.boxShadow =
            `0 0 0 3px ${hasErrors ? "rgba(180,35,35,0.15)" : "rgba(58,123,255,0.15)"}`;
        }}
        onBlur={(e) => {
          (e.target as HTMLTextAreaElement).style.boxShadow = "";
        }}
      />

      {/* Advisory error/warning strip */}
      <div
        id="css-editor-hints"
        role="status"
        aria-live="polite"
        aria-atomic="false"
        style={{ display: "flex", flexDirection: "column", gap: 3 }}
      >
        {errors.map((err, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 5,
              padding: "4px 7px",
              borderRadius: 5,
              background:
                err.severity === "error" ? CHROME.roseBg : CHROME.amberBg,
              border: `1px solid ${err.severity === "error" ? CHROME.roseLine : CHROME.amberLine}`,
              fontSize: 11,
              lineHeight: 1.4,
              color: err.severity === "error" ? CHROME.rose : CHROME.amber,
            }}
          >
            <span aria-hidden style={{ flexShrink: 0, marginTop: 1 }}>
              {err.severity === "error" ? "⚠" : "ℹ"}
            </span>
            <span>{err.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
