"use client";

/**
 * BriefEditor — reusable in-chat project-brief editor (Phase 2 / P2, §4.B.6).
 *
 * A compact textarea consistent with GuestDetailChipEditor's visual language
 * (mini-chat tokens, tenant accent). Standalone so the upcoming details sidebar
 * can rehouse it unchanged.
 *
 * Wiring: on Confirm it calls onSubmit(summary), which the panel routes through
 * useUnifiedInquiry.patch({ kind: "brief", summary }). That writes
 * interpreted_query.brief.summary + the flat message/raw_ai_query columns and
 * emits a synced "Brief updated." thread note, exactly like the other chips.
 *
 * House rules: tenant accent only (no hardcoded gold), no em dashes,
 * "client" never "buyer".
 */

import { useState } from "react";

import { C, FONT, inputStyle, primaryBtnStyle, readableOn } from "./mini-chat-styles";

export type BriefEditorProps = {
  /** Current brief summary to pre-fill. */
  initialSummary?: string | null;
  /** Tenant accent color (CSS string). */
  accent: string;
  /** Readable text color on the accent background. */
  accentInk?: string;
  onSubmit: (summary: string) => void;
  onCancel: () => void;
};

export function BriefEditor({
  initialSummary,
  accent,
  accentInk,
  onSubmit,
  onCancel,
}: BriefEditorProps) {
  const ink = accentInk || readableOn(accent);
  const [summary, setSummary] = useState<string>(initialSummary ?? "");

  return (
    <div
      style={{
        padding: "12px 14px",
        background: C.surfaceFaint,
        borderTop: `1px solid ${C.borderSoft}`,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        fontFamily: FONT,
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.04em",
          color: C.inkMuted,
          textTransform: "uppercase",
        }}
      >
        What you need
      </span>
      <textarea
        rows={4}
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        placeholder="What are you planning? What kind of talent works for you? Anything already confirmed?"
        aria-label="Tell us about the project"
        style={{
          ...inputStyle,
          height: "auto",
          minHeight: 84,
          padding: "10px 12px",
          fontSize: 13,
          lineHeight: 1.45,
          resize: "vertical",
          fontFamily: FONT,
        }}
      />
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button
          type="button"
          onClick={onCancel}
          style={{
            height: 32,
            padding: "0 12px",
            borderRadius: 8,
            border: `1px solid ${C.border}`,
            background: "transparent",
            fontFamily: FONT,
            fontSize: 12,
            fontWeight: 500,
            color: C.inkMuted,
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onSubmit(summary.trim())}
          style={{ ...primaryBtnStyle(accent, ink), height: 32, padding: "0 14px", fontSize: 12 }}
        >
          Confirm
        </button>
      </div>
    </div>
  );
}
