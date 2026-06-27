"use client";

/**
 * ContactEditor — reusable in-chat contact editor (Phase 2 / P2, §4.B.9).
 *
 * Name / email / phone fields consistent with GuestDetailChipEditor's visual
 * language (mini-chat tokens, tenant accent). Standalone so the upcoming details
 * sidebar can rehouse it unchanged.
 *
 * Wiring: on Confirm it calls onSubmit({ name, email, phone }), which the panel
 * routes through useUnifiedInquiry.patch({ kind: "contact", ... }). That promotes
 * the early-partial placeholder contact (the ensureGuestChatInquiry seed:
 * "Guest" / "pending-{id}@guest.impronta") to the real values via the additive
 * `contact` chip path and emits a synced "Contact details updated." thread note.
 *
 * NOTE: this does NOT run the full startGuestChatInquiry gate. It edits the
 * contact on an inquiry that already exists (created early by the first
 * structured commit). The first-message gate (MiniChatGateForm) is the separate
 * "send your first message" moment and is unchanged.
 *
 * House rules: tenant accent only (no hardcoded gold), no em dashes,
 * "client" never "buyer".
 */

import { useState } from "react";

import type { Translator } from "@/i18n/interpolate";
import {
  EMAIL_RE,
  FONT,
  inputStyleFor,
  paletteFor,
  primaryBtnStyle,
  readableOn,
  type Palette,
  type SurfaceMode,
} from "./mini-chat-styles";

export type ContactEditorValue = {
  name: string;
  email: string;
  phone: string;
};

export type ContactEditorProps = {
  /** Current contact values to pre-fill. */
  initial?: Partial<ContactEditorValue> | null;
  /** Tenant accent color (CSS string). */
  accent: string;
  /** Readable text color on the accent background. */
  accentInk?: string;
  /** Guest-locale translator (resolved from brand.locale). */
  t: Translator;
  /** Jon 360 Phase 7 — dark surface variant for noir tenants. Default "light". */
  surfaceMode?: SurfaceMode;
  onSubmit: (value: ContactEditorValue) => void;
  onCancel: () => void;
};

function fieldLabelStyle(C: Palette): React.CSSProperties {
  return {
    display: "block",
    fontSize: 11,
    fontWeight: 600,
    color: C.inkMuted,
    marginBottom: 4,
  };
}

function smallInputStyle(C: Palette): React.CSSProperties {
  return {
    ...inputStyleFor(C),
    height: 36,
    padding: "0 10px",
    fontSize: 13,
    width: "100%",
    boxSizing: "border-box",
  };
}

export function ContactEditor({
  initial,
  accent,
  accentInk,
  t,
  surfaceMode = "light",
  onSubmit,
  onCancel,
}: ContactEditorProps) {
  const C = paletteFor(surfaceMode);
  const ink = accentInk || readableOn(accent);
  const [name, setName] = useState<string>(initial?.name ?? "");
  const [email, setEmail] = useState<string>(initial?.email ?? "");
  const [phone, setPhone] = useState<string>(initial?.phone ?? "");

  const emailTrimmed = email.trim();
  const emailInvalid = emailTrimmed.length > 0 && !EMAIL_RE.test(emailTrimmed);
  // Confirm requires at least a name and a valid email so the agency can reach
  // the client (mirrors the inquiry's NOT NULL contact contract).
  const canConfirm = name.trim().length > 0 && EMAIL_RE.test(emailTrimmed);

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
        {t("public.guestChat.contactSectionLabel")}
      </span>

      <div>
        <label style={fieldLabelStyle(C)}>{t("public.guestChat.contactName")}</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("public.guestChat.contactNamePlaceholder")}
          aria-label={t("public.guestChat.contactNameAria")}
          style={smallInputStyle(C)}
        />
      </div>

      <div>
        <label style={fieldLabelStyle(C)}>{t("public.guestChat.contactEmail")}</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("public.guestChat.contactEmailPlaceholder")}
          aria-label={t("public.guestChat.contactEmailAria")}
          style={{
            ...smallInputStyle(C),
            borderColor: emailInvalid ? C.danger : undefined,
          }}
        />
        {emailInvalid && (
          <p style={{ margin: "4px 0 0", fontSize: 11, color: C.danger }}>
            {t("public.guestChat.contactEmailInvalid")}
          </p>
        )}
      </div>

      <div>
        <label style={fieldLabelStyle(C)}>{t("public.guestChat.contactPhoneLabel")}</label>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder={t("public.guestChat.contactPhonePlaceholder")}
          aria-label={t("public.guestChat.contactPhoneAria")}
          style={smallInputStyle(C)}
        />
      </div>

      <p style={{ margin: 0, fontSize: 11, color: C.inkDim }}>
        {t("public.guestChat.contactPrivacy")}
      </p>

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
          disabled={!canConfirm}
          onClick={() =>
            onSubmit({ name: name.trim(), email: emailTrimmed, phone: phone.trim() })
          }
          style={{
            ...primaryBtnStyle(accent, ink),
            height: 32,
            padding: "0 14px",
            fontSize: 12,
            opacity: canConfirm ? 1 : 0.5,
            cursor: canConfirm ? "pointer" : "not-allowed",
          }}
        >
          {t("public.guestChat.confirm")}
        </button>
      </div>
    </div>
  );
}
