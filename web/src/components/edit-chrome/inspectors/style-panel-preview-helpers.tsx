"use client";

/**
 * Style-panel preview helpers — extracted from style-panel.tsx (mechanical
 * lift, byte-stable). Two small file-local presentational helpers pulled out
 * of the 10k-line `style-panel.tsx` as a bounded, behavior-identical
 * extraction; markup and behavior are unchanged.
 *
 *   - ImportPresetsOverlay — inline textarea overlay for importing presets
 *     JSON (replaces window.prompt).
 *   - DividerPreview       — small SVG thumbnail previewing a divider
 *     treatment so the operator picks by appearance, not enum name.
 */

import { useRef } from "react";

import { CHROME } from "../kit/tokens";

/**
 * INS-3: inline textarea overlay for importing presets JSON (replaces window.prompt).
 * Kept as a small file-local component to avoid polluting the inspector kit with
 * a one-off that's only useful for the style-panel preset import flow.
 */
export function ImportPresetsOverlay({
  error,
  onConfirm,
  onCancel,
}: {
  error: string | null;
  onConfirm: (raw: string) => void;
  onCancel: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Import presets JSON"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        borderRadius: 10,
        border: `1px solid ${CHROME.controlBorder}`,
        background: CHROME.surface,
        boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
        padding: "10px 12px",
      }}
    >
      <p style={{ margin: 0, fontSize: 12, color: CHROME.muted }}>
        Paste the presets JSON array here.
      </p>
      <textarea
        ref={textareaRef}
        autoFocus
        rows={5}
        style={{
          width: "100%",
          resize: "vertical",
          borderRadius: 7,
          border: `1px solid ${CHROME.controlBorder}`,
          background: CHROME.paper,
          padding: "7px 10px",
          fontSize: 11,
          fontFamily: "var(--font-mono, monospace)",
          color: CHROME.ink,
          outline: "none",
          boxSizing: "border-box",
        }}
        aria-label="Presets JSON"
        onFocus={(e) => { e.currentTarget.style.borderColor = CHROME.blue; }}
        onBlur={(e) => { e.currentTarget.style.borderColor = CHROME.controlBorder; }}
        onKeyDown={(e) => {
          if (e.key === "Escape") { e.preventDefault(); onCancel(); }
        }}
      />
      {error ? (
        <p style={{ margin: 0, fontSize: 11, color: CHROME.amber }}>{error}</p>
      ) : null}
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={onCancel}
          style={{ height: 28, paddingInline: 10, fontSize: 12, fontWeight: 500, background: "transparent", border: `1px solid ${CHROME.controlBorder}`, borderRadius: 7, color: CHROME.muted, cursor: "pointer" }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onConfirm(textareaRef.current?.value ?? "")}
          style={{ height: 28, paddingInline: 10, fontSize: 12, fontWeight: 600, background: CHROME.accent, border: `1px solid ${CHROME.accent}`, borderRadius: 7, color: "#fff", cursor: "pointer" }}
        >
          Import
        </button>
      </div>
    </div>
  );
}

// Divider thumbnail — a small SVG that previews the visual treatment so
// the operator picks by appearance, not enum name.
export function DividerPreview({ kind }: { kind: string }) {
  const stroke = CHROME.muted2;
  const accent = CHROME.ink;
  switch (kind) {
    case "thin-line":
      return (
        <svg width="44" height="14" viewBox="0 0 44 14" aria-hidden>
          <line x1="2" y1="7" x2="42" y2="7" stroke={accent} strokeWidth="1" />
        </svg>
      );
    case "gradient-fade":
      return (
        <svg width="44" height="14" viewBox="0 0 44 14" aria-hidden>
          <defs>
            <linearGradient id="grad-fade" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={accent} stopOpacity="0" />
              <stop offset="50%" stopColor={accent} stopOpacity="0.8" />
              <stop offset="100%" stopColor={accent} stopOpacity="0" />
            </linearGradient>
          </defs>
          <rect x="0" y="6" width="44" height="2" fill="url(#grad-fade)" />
        </svg>
      );
    case "decorative":
      return (
        <svg width="44" height="14" viewBox="0 0 44 14" aria-hidden>
          <line x1="2" y1="7" x2="18" y2="7" stroke={stroke} strokeWidth="1" />
          <circle cx="22" cy="7" r="2.5" fill="none" stroke={accent} strokeWidth="1" />
          <line x1="26" y1="7" x2="42" y2="7" stroke={stroke} strokeWidth="1" />
        </svg>
      );
    case "none":
    default:
      return (
        <svg width="44" height="14" viewBox="0 0 44 14" aria-hidden>
          <line
            x1="2"
            y1="7"
            x2="42"
            y2="7"
            stroke={stroke}
            strokeWidth="1"
            strokeDasharray="2 3"
          />
        </svg>
      );
  }
}
