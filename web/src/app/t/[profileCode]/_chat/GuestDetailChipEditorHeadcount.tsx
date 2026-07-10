"use client";

/**
 * HeadcountEditor — the "Headcount" kind sub-editor for GuestDetailChipEditor.
 * Extracted verbatim from GuestDetailChipEditor.tsx (W1-A decomposition
 * pre-pass) to keep that file under the 800-line cap. No logic changes.
 */

import { useState, useId } from "react";
import type { Translator } from "@/i18n/interpolate";
import { primaryBtnStyle, type Palette } from "./mini-chat-styles";
import a11y from "./mini-chat-a11y.module.css";
import type { GuestChipValue } from "@/lib/inquiry/guest-chat-contract";
import { editorWrap, footerStyle, ghostBtnStyle, labelStyle, smallInputStyle } from "./guest-detail-chip-editor-styles";

export function HeadcountEditor({
  initial,
  accent,
  accentInk,
  t,
  C,
  onSubmit,
  onCancel,
}: {
  initial?: Partial<GuestChipValue> | null;
  accent: string;
  accentInk: string;
  t: Translator;
  C: Palette;
  onSubmit: (v: GuestChipValue) => void;
  onCancel: () => void;
}) {
  const [count, setCount] = useState<number>(initial?.headcount ?? 1);
  const inputId = useId();

  function clamp(n: number) {
    return Math.max(1, Math.min(9999, n));
  }

  return (
    <div style={editorWrap(C)}>
      <span style={labelStyle(C)}>{t("public.guestChat.editorHeadcountLabel")}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          type="button"
          aria-label={t("public.guestChat.headcountDecreaseAria")}
          style={{
            ...ghostBtnStyle(C),
            width: 34,
            height: 34,
            padding: 0,
            fontSize: 18,
            borderRadius: 8,
          }}
          onClick={() => setCount((c) => clamp(c - 1))}
        >
          −
        </button>
        <label htmlFor={inputId} style={{ display: "none" }}>
          {t("public.guestChat.headcountCountAria")}
        </label>
        <input
          id={inputId}
          type="number"
          min={1}
          max={9999}
          value={count}
          onChange={(e) => {
            const n = parseInt(e.target.value, 10);
            if (!Number.isNaN(n)) setCount(clamp(n));
          }}
          className={a11y.focusRing}
          style={{ ...smallInputStyle(C, accent), width: 72, textAlign: "center" }}
        />
        <button
          type="button"
          aria-label={t("public.guestChat.headcountIncreaseAria")}
          style={{
            ...ghostBtnStyle(C),
            width: 34,
            height: 34,
            padding: 0,
            fontSize: 18,
            borderRadius: 8,
          }}
          onClick={() => setCount((c) => clamp(c + 1))}
        >
          +
        </button>
        <span style={{ fontSize: 13, color: C.inkMuted }}>
          {count === 1
            ? t("public.guestChat.guestOne")
            : t("public.guestChat.guestOther")}
        </span>
      </div>
      <div style={footerStyle}>
        <button type="button" style={ghostBtnStyle(C)} onClick={onCancel}>
          {t("public.guestChat.cancel")}
        </button>
        <button
          type="button"
          style={{ ...primaryBtnStyle(accent, accentInk), height: 32, padding: "0 14px", fontSize: 12 }}
          onClick={() => onSubmit({ headcount: count })}
        >
          {t("public.guestChat.confirm")}
        </button>
      </div>
    </div>
  );
}
