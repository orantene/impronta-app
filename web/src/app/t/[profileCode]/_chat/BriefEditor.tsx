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

import type { Translator } from "@/i18n/interpolate";
import {
  FONT,
  inputStyleFor,
  paletteFor,
  primaryBtnStyle,
  readableOn,
  type SurfaceMode,
} from "./mini-chat-styles";

export type BriefEditorProps = {
  /** Current brief summary to pre-fill. */
  initialSummary?: string | null;
  /** Tenant accent color (CSS string). */
  accent: string;
  /** Readable text color on the accent background. */
  accentInk?: string;
  /** Guest-locale translator (resolved from brand.locale). */
  t: Translator;
  /** Jon 360 Phase 7 — dark surface variant for noir tenants. Default "light". */
  surfaceMode?: SurfaceMode;
  onSubmit: (summary: string) => void;
  onCancel: () => void;
};

export function BriefEditor({
  initialSummary,
  accent,
  accentInk,
  t,
  surfaceMode = "light",
  onSubmit,
  onCancel,
}: BriefEditorProps) {
  const C = paletteFor(surfaceMode);
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
        {t("public.guestChat.briefSectionLabel")}
      </span>
      <textarea
        rows={4}
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        placeholder={t("public.guestChat.briefPlaceholder")}
        aria-label={t("public.guestChat.briefAria")}
        style={{
          ...inputStyleFor(C),
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
          {t("public.guestChat.cancel")}
        </button>
        <button
          type="button"
          onClick={() => onSubmit(summary.trim())}
          style={{ ...primaryBtnStyle(accent, ink), height: 32, padding: "0 14px", fontSize: 12 }}
        >
          {t("public.guestChat.confirm")}
        </button>
      </div>
    </div>
  );
}
