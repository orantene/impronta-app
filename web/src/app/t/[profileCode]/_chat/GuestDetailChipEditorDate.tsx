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
  // A half-typed native date (02/08/yyyy) reads back as "", so track it apart.
  const [badInput, setBadInput] = useState(false);
  // TUL-1885 (regression of TUL-953): a half-typed date fires no change event and a disabled
  // Confirm never blurs the field, so also reveal the error once the field was touched or the
  // disabled Confirm was pressed. Shown whenever "exact" has no complete date yet.
  const [touched, setTouched] = useState(false);
  const inputId = useId();
  const dateErrorId = `${inputId}-date-error`;

  // "Exact date" needs an actual date before it can commit, otherwise it would
  // save an empty exact date that renders as "Date TBD". Flexible / Not sure yet
  // carry no date, so they stay committable.
  const canConfirm = status !== "exact" || eventDate.trim().length > 0;
  const dateIncomplete = status === "exact" && !eventDate.trim() && (badInput || touched);

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
            onChange={(e) => {
              setBadInput(e.target.validity.badInput);
              setEventDate(e.target.value);
            }}
            onKeyUp={(e) => setBadInput(e.currentTarget.validity.badInput)}
            onBlur={(e) => {
              setBadInput(e.target.validity.badInput);
              setTouched(true);
            }}
            aria-invalid={dateIncomplete}
            aria-describedby={dateIncomplete ? dateErrorId : undefined}
            className={a11y.focusRing}
            style={smallInputStyle(C, accent)}
          />
          {dateIncomplete && (
            <p id={dateErrorId} role="alert" style={{ margin: "4px 0 0", fontSize: 12, color: "#b3261e" }}>
              {t("public.guestChat.dateIncompleteInline")}
            </p>
          )}
        </div>
      )}
      <div style={footerStyle}>
        <button type="button" style={ghostBtnStyle(C)} onClick={onCancel}>
          {t("public.guestChat.cancel")}
        </button>
        {/* a disabled button swallows clicks: the wrapper reveals why Confirm is off */}
        <span onClick={() => !canConfirm && setTouched(true)} style={{ display: "inline-flex" }}>
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
        </span>
      </div>
    </div>
  );
}
