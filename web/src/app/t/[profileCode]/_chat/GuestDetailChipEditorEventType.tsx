"use client";

/**
 * EventTypeEditor — the "Event Type" kind sub-editor for GuestDetailChipEditor.
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

/**
 * Event-type presets. `value` is the canonical English string PERSISTED into
 * interpreted_query.source_context.ai_event_type (kept stable across locales so
 * stored data + reconcile reads stay consistent); `labelKey` is the localized
 * display label shown on the toggle.
 */
const EVENT_TYPE_PRESETS: { value: string; labelKey: string }[] = [
  { value: "Wedding", labelKey: "public.guestChat.eventTypeWedding" },
  { value: "Corporate event", labelKey: "public.guestChat.eventTypeCorporate" },
  { value: "Private dinner", labelKey: "public.guestChat.eventTypePrivateDinner" },
  { value: "Brand shoot", labelKey: "public.guestChat.eventTypeBrandShoot" },
  { value: "Birthday party", labelKey: "public.guestChat.eventTypeBirthday" },
  { value: "Product launch", labelKey: "public.guestChat.eventTypeProductLaunch" },
  { value: "Other", labelKey: "public.guestChat.eventTypeOther" },
];

export function EventTypeEditor({
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
  const [selected, setSelected] = useState<string>(initial?.eventType ?? "");
  const [custom, setCustom] = useState<string>("");
  const inputId = useId();

  function handlePreset(preset: string) {
    if (preset === "Other") {
      setSelected("Other");
    } else {
      setSelected(preset);
      setCustom("");
    }
  }

  function handleConfirm() {
    const value =
      selected === "Other" ? custom.trim() || "Other" : selected || custom.trim() || null;
    onSubmit({ eventType: value || null });
  }

  return (
    <div style={editorWrap(C)}>
      <span style={labelStyle(C)}>{t("public.guestChat.editorEventTypeLabel")}</span>
      <div style={rowStyle}>
        {EVENT_TYPE_PRESETS.map((preset) => (
          <button
            key={preset.value}
            type="button"
            style={toggleStyle(selected === preset.value, accent, C)}
            onClick={() => handlePreset(preset.value)}
          >
            {t(preset.labelKey)}
          </button>
        ))}
      </div>
      {selected === "Other" && (
        <div>
          <label htmlFor={inputId} style={{ display: "none" }}>
            {t("public.guestChat.eventTypeDescribeAria")}
          </label>
          <input
            id={inputId}
            type="text"
            placeholder={t("public.guestChat.eventTypeDescribePlaceholder")}
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            className={a11y.focusRing}
            style={smallInputStyle(C, accent)}
            autoFocus
          />
        </div>
      )}
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
