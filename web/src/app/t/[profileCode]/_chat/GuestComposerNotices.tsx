"use client";

/**
 * GuestComposerNotices: the captcha slot and the send error line above the
 * composer, extracted verbatim from MiniChatPanelColumn to keep that file
 * under the 800-line cap.
 */

import type { Translator } from "@/i18n/interpolate";
import { interpolate } from "@/i18n/interpolate";

import type { Palette } from "./mini-chat-styles";

export function GuestComposerNotices({
  captchaRequired,
  error,
  inCooldown,
  cooldownSecs,
  C,
  t,
}: {
  captchaRequired: boolean;
  error: string | null;
  inCooldown: boolean;
  cooldownSecs: number;
  C: Palette;
  t: Translator;
}) {
  return (
    <>
      {captchaRequired && (
        <div
          data-guest-chat-captcha-slot
          style={{
            padding: "9px 14px",
            borderTop: `1px solid ${C.borderSoft}`,
            background: C.surfaceFaint,
            fontSize: 11.5,
            color: C.inkMuted,
          }}
        >
          {t("public.guestChat.captchaNotice")}
        </div>
      )}

      {error && (
        <div
          role="alert"
          style={{
            padding: "7px 14px",
            fontSize: 11.5,
            color: C.danger,
            background: "rgba(161,58,58,0.06)",
          }}
        >
          {error}
          {inCooldown
            ? ` ${interpolate(t("public.guestChat.tryAgainIn"), { secs: cooldownSecs })}`
            : ""}
        </div>
      )}
    </>
  );
}
