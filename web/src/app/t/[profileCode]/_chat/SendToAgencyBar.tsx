"use client";

/**
 * SendToAgencyBar — the persistent primary "Send to agency" affordance for the
 * unified inquiry chat (Message Impronta plan §B.9 / B.11 / finding #2).
 *
 * The build had only the chat composer + the contact gate, so a guest who filled
 * the details rail (talent, brief, date) but never typed a chat line had no
 * "I'm done, submit this" moment, and the placeholder-contact early row never got
 * promoted. This bar gives the "this chat IS my inquiry" model its confirming
 * moment: tapping it forces the ContactCard gate when the contact is still the
 * placeholder seed (via the send hook's sendToAgency), then a success note
 * confirms ("Sent. The agency will reply shortly.").
 *
 * It is hidden once the thread is a live, contact-promoted conversation (there is
 * nothing left to "submit" — the composer carries the reply flow from there).
 *
 * House rules: tenant accent only (no hardcoded gold), no em dashes, "client"
 * never "buyer", inline styles only. Copy is localized via the injected `t`.
 */

import type { CSSProperties } from "react";

import type { Translator } from "@/i18n/interpolate";
import { interpolate } from "@/i18n/interpolate";
import { C, FONT, primaryBtnStyle } from "./mini-chat-styles";

export type SendToAgencyBarProps = {
  /** Tenant accent color (CSS string). */
  accent: string;
  /** Readable ink on the accent. */
  accentInk: string;
  /** Guest-locale translator (resolved from brand.locale). */
  t: Translator;
  /** Disable while a send is in flight or during cooldown. */
  disabled?: boolean;
  /** Whether to show the post-send success confirmation note. */
  sent: boolean;
  /**
   * Jon 360 Phase 1: the agency's typical reply window (e.g. "within a day").
   * When present it renders a quiet pre-frame line under the button; when null it
   * is omitted entirely (never invent a duration).
   */
  typicalReply?: string | null;
  /** Trigger the send-to-agency flow (gate when needed, else submit). */
  onSend: () => void;
};

const wrapStyle: CSSProperties = {
  borderTop: `1px solid ${C.borderSoft}`,
  background: C.surfaceFaint,
  padding: "8px 12px",
  display: "flex",
  flexDirection: "column",
  gap: 6,
  fontFamily: FONT,
};

export function SendToAgencyBar({
  accent,
  accentInk,
  t,
  disabled = false,
  sent,
  typicalReply = null,
  onSend,
}: SendToAgencyBarProps) {
  if (sent) {
    return (
      <div style={wrapStyle}>
        <p
          role="status"
          aria-live="polite"
          style={{
            margin: 0,
            fontSize: 12,
            fontWeight: 500,
            color: C.inkMuted,
            textAlign: "center",
          }}
        >
          {t("public.guestChat.sendToAgencySent")}
        </p>
      </div>
    );
  }

  return (
    <div style={wrapStyle}>
      <button
        type="button"
        onClick={onSend}
        disabled={disabled}
        style={{
          ...primaryBtnStyle(accent, accentInk),
          width: "100%",
          opacity: disabled ? 0.6 : 1,
          cursor: disabled ? "default" : "pointer",
        }}
      >
        {t("public.guestChat.sendToAgency")}
      </button>

      {/* Jon 360 Phase 1: trust pre-frame under the Send button. */}
      <p
        style={{
          margin: 0,
          fontSize: 11,
          fontWeight: 500,
          color: C.inkMuted,
          textAlign: "center",
          lineHeight: 1.4,
        }}
      >
        {t("public.guestChat.sendNoPayment")}
      </p>
      {typicalReply ? (
        <p
          style={{
            margin: 0,
            fontSize: 11,
            fontWeight: 500,
            color: C.inkDim,
            textAlign: "center",
            lineHeight: 1.4,
          }}
        >
          {interpolate(t("public.guestChat.sendTypicalReply"), { when: typicalReply })}
        </p>
      ) : null}
    </div>
  );
}
