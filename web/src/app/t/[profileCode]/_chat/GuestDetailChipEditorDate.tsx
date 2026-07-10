"use client";

/**
 * DateEditor — the "Date" kind sub-editor for GuestDetailChipEditor.
 * Extracted verbatim from GuestDetailChipEditor.tsx (W1-A decomposition
 * pre-pass) to keep that file under the 800-line cap. No logic changes.
 */

import { useState, useId } from "react";
import type { Translator } from "@/i18n/interpolate";
import { primaryBtnStyle, type Palette } from "./mini-chat-styles";
import a11y from "./mini-chat-a11y.module.css";
import type { GuestChipValue } from "@/lib/inquiry/guest-chat-contract";
import {
  editorWrap,
  footerStyle,
  ghostBtnStyle,
  labelStyle,
  rowStyle,
  smallInputStyle,
  toggleStyle,
} from "./guest-detail-chip-editor-styles";

type DateStatus = "exact" | "flexible" | "not_sure";

export function DateEditor({
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
  const [status, setStatus] = useState<DateStatus>(
    (initial?.dateStatus as DateStatus) ?? "exact",
  );
  const [eventDate, setEventDate] = useState<string>(initial?.eventDate ?? "");
  const inputId = useId();

  // "Exact date" needs an actual date before it can commit, otherwise it would
  // save an empty exact date that renders as "Date TBD". Flexible / Not sure yet
  // carry no date, so they stay committable.
  const canConfirm = status !== "exact" || eventDate.trim().length > 0;

  function handleConfirm() {
    if (!canConfirm) return;
    onSubmit({
      dateStatus: status,
      eventDate: status === "exact" && eventDate ? eventDate : null,
    });
  }

  const statusOptions: { value: DateStatus; label: string }[] = [
    { value: "exact", label: t("public.guestChat.dateExact") },
    { value: "flexible", label: t("public.guestChat.dateFlexible") },
    { value: "not_sure", label: t("public.guestChat.dateNotSure") },
  ];

  return (
    <div style={editorWrap(C)}>
      <span style={labelStyle(C)}>{t("public.guestChat.editorDateLabel")}</span>
      <div style={rowStyle}>
        {statusOptions.map((opt) => (
          <button
            key={opt.value}
            type="button"
            style={toggleStyle(status === opt.value, accent, C)}
            onClick={() => setStatus(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {status === "exact" && (
        <div>
          <label htmlFor={inputId} style={{ display: "none" }}>
            {t("public.guestChat.editorDateLabel")}
          </label>
          <input
            id={inputId}
            type="date"
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
            className={a11y.focusRing}
            style={smallInputStyle(C, accent)}
          />
        </div>
      )}
      <div style={footerStyle}>
        <button type="button" style={ghostBtnStyle(C)} onClick={onCancel}>
          {t("public.guestChat.cancel")}
        </button>
        <button
          type="button"
          disabled={!canConfirm}
          style={{
            ...primaryBtnStyle(accent, accentInk),
            height: 32,
            padding: "0 14px",
            fontSize: 12,
            opacity: canConfirm ? 1 : 0.5,
            cursor: canConfirm ? "pointer" : "not-allowed",
          }}
          onClick={handleConfirm}
        >
          {t("public.guestChat.confirm")}
        </button>
      </div>
    </div>
  );
}
