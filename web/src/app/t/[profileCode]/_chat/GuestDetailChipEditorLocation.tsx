"use client";

/**
 * LocationEditor — the "Location" kind sub-editor for GuestDetailChipEditor.
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

type LocationStatus = "confirmed" | "unconfirmed" | "online" | "not_sure";

export function LocationEditor({
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
  const [city, setCity] = useState<string>(initial?.city ?? "");
  const [locStatus, setLocStatus] = useState<LocationStatus>(
    (initial?.locationStatus as LocationStatus) ?? "unconfirmed",
  );
  const inputId = useId();

  const statusOptions: { value: LocationStatus; label: string }[] = [
    { value: "confirmed", label: t("public.guestChat.locationConfirmed") },
    { value: "unconfirmed", label: t("public.guestChat.locationTbd") },
    { value: "online", label: t("public.guestChat.locationOnline") },
    { value: "not_sure", label: t("public.guestChat.locationNotSure") },
  ];

  function handleConfirm() {
    onSubmit({
      city: city.trim() || null,
      locationStatus: locStatus,
    });
  }

  return (
    <div style={editorWrap(C)}>
      <span style={labelStyle(C)}>{t("public.guestChat.editorLocationLabel")}</span>
      {locStatus !== "online" && locStatus !== "not_sure" && (
        <div>
          <label htmlFor={inputId} style={{ display: "none" }}>
            {t("public.guestChat.locationCityFieldAria")}
          </label>
          <input
            id={inputId}
            type="text"
            placeholder={t("public.guestChat.locationCityPlaceholder")}
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className={a11y.focusRing}
            style={smallInputStyle(C, accent)}
          />
          <p style={{ margin: "4px 0 0", fontSize: 11, color: C.inkDim }}>
            {t("public.guestChat.locationCityHelper")}
          </p>
        </div>
      )}
      <div style={rowStyle}>
        {statusOptions.map((opt) => (
          <button
            key={opt.value}
            type="button"
            style={toggleStyle(locStatus === opt.value, accent, C)}
            onClick={() => setLocStatus(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <div style={footerStyle}>
        <button type="button" style={ghostBtnStyle(C)} onClick={onCancel}>
          {t("public.guestChat.cancel")}
        </button>
        <button
          type="button"
          style={{ ...primaryBtnStyle(accent, accentInk), height: 32, padding: "0 14px", fontSize: 12 }}
          onClick={handleConfirm}
        >
          {t("public.guestChat.confirm")}
        </button>
      </div>
    </div>
  );
}
