"use client";

/**
 * MiniChatGateForm — the inline name+email gate sub-form extracted out of
 * MiniChatPanel to keep that file under the 800-line cap. It is purely
 * presentational: the panel owns all state (name / email / draft / sending) and
 * the send handler; this component just renders the controls and reports edits
 * back through the setters.
 *
 * The gate appears at SEND TIME (never before the first message) and is framed
 * "Where should {Name} reach you?" — a contact ask, not a "register" wall
 * (strategy §3.1 / §10). House rule: the only warm color is the tenant accent.
 */

import { interpolate } from "@/i18n/interpolate";

import {
  inputStyleFor,
  paletteFor,
  primaryBtnStyle,
  type SurfaceMode,
} from "./mini-chat-styles";

export type MiniChatGateFormProps = {
  /**
   * The panel's resolved translator (createTranslator(brand.locale)). Threaded
   * down so the gate — the conversion moment — speaks the visitor's language
   * instead of hardcoded English. Routes all copy through public.guestChat.*.
   */
  t: (key: string) => string;
  /** Talent first name for the "Where should {name} reach you?" prompt. */
  talentFirst: string;
  /**
   * Phase 6 — a quiet recap line anchoring the contact ask to the lineup, e.g.
   * "We will use this to send you {agency} reply about Jane, +2". Null when the
   * lineup is empty (no recap rendered).
   */
  lineupRecap?: string | null;
  /** The pending message body (shown as a read-only recap above the fields). */
  draft: string;
  firstName: string;
  onFirstNameChange: (value: string) => void;
  lastName: string;
  onLastNameChange: (value: string) => void;
  email: string;
  onEmailChange: (value: string) => void;
  accent: string;
  accentInk: string;
  /** True when first name + a valid email are present (enables the send button). */
  gateReady: boolean;
  /** Helper or error copy under the email field (already-registered probe). */
  emailNotice?: string | null;
  /** When true, emailNotice is an error and send stays disabled. */
  emailBlocksSubmit?: boolean;
  sending: boolean;
  /** Jon 360 Phase 7 — dark surface variant for noir tenants. Default "light". */
  surfaceMode?: SurfaceMode;
  /** Fire the first-send (the panel's handleFirstSend). */
  onSend: () => void;
};

export function MiniChatGateForm({
  t,
  talentFirst,
  lineupRecap = null,
  draft,
  firstName,
  onFirstNameChange,
  lastName,
  onLastNameChange,
  email,
  onEmailChange,
  accent,
  accentInk,
  gateReady,
  emailNotice = null,
  emailBlocksSubmit = false,
  sending,
  surfaceMode = "light",
  onSend,
}: MiniChatGateFormProps) {
  const canSend = gateReady && !emailBlocksSubmit && !sending;
  const C = paletteFor(surfaceMode);
  const inputStyle = inputStyleFor(C);

  return (
    <div
      style={{
        padding: "11px 14px",
        borderTop: `1px solid ${C.borderSoft}`,
        background: C.surfaceFaint,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, color: C.inkMuted }}>
        {interpolate(t("public.guestChat.gatePrompt"), { name: talentFirst })}
      </div>
      {lineupRecap ? (
        <div
          style={{
            fontSize: 11,
            lineHeight: 1.45,
            color: C.inkDim,
          }}
        >
          {lineupRecap}
        </div>
      ) : null}
      {draft.trim() && (
        <div
          style={{
            fontSize: 12,
            color: C.inkMuted,
            background: C.surface,
            border: `1px solid ${C.borderSoft}`,
            borderRadius: 9,
            padding: "8px 11px",
            lineHeight: 1.45,
            maxHeight: 66,
            overflowY: "auto",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          <span
            style={{ color: C.inkDim, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.3 }}
          >
            {t("public.guestChat.gateYourMessageLabel")}
          </span>
          <br />
          {draft.trim()}
        </div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={firstName}
          onChange={(e) => onFirstNameChange(e.target.value)}
          placeholder={t("public.guestChat.gateFirstName")}
          autoComplete="given-name"
          style={inputStyle}
        />
        <input
          value={lastName}
          onChange={(e) => onLastNameChange(e.target.value)}
          placeholder={t("public.guestChat.gateLastName")}
          autoComplete="family-name"
          style={inputStyle}
        />
      </div>
      <input
        value={email}
        onChange={(e) => onEmailChange(e.target.value)}
        placeholder={t("public.guestChat.contactEmail")}
        type="email"
        autoComplete="email"
        style={inputStyle}
      />
      {emailNotice && (
        <div
          role={emailBlocksSubmit ? "alert" : "status"}
          style={{
            fontSize: 11,
            lineHeight: 1.45,
            color: emailBlocksSubmit ? C.danger : C.inkMuted,
          }}
        >
          {emailNotice}
        </div>
      )}
      <button
        type="button"
        onClick={onSend}
        disabled={!canSend}
        style={{
          ...primaryBtnStyle(accent, accentInk),
          opacity: !canSend ? 0.5 : 1,
          cursor: !canSend ? "not-allowed" : "pointer",
        }}
      >
        {sending
          ? t("public.guestChat.sendingShort")
          : t("public.guestChat.gateSend")}
      </button>
    </div>
  );
}
