/**
 * createApplyFailure — factory for MiniChatPanel's `applyFailure` handler
 * (rate-limit / captcha / disposable-email / blocked / limit-reached error
 * routing). Extracted verbatim from MiniChatPanel.tsx (W1-A decomposition
 * pre-pass) to keep that file under the 800-line cap. A plain closure factory
 * (not a hook) — MiniChatPanel calls it once per render with the current-render
 * values, exactly mirroring the original inline function's closure. No logic
 * changes.
 */

import type { Dispatch, SetStateAction } from "react";

import type { GuestIdentityTier } from "@/lib/inquiry/guest-chat-contract";
import type { Translator } from "@/i18n/interpolate";
import { EMAIL_RE } from "./mini-chat-styles";

export type ApplyFailureFn = (
  code: string,
  message: string,
  retryAfterMs?: number,
  extra?: { gateTier?: GuestIdentityTier; activeCount?: number; limit?: number },
) => void;

export function createApplyFailure({
  identity,
  firstName,
  email,
  t,
  setCooldownSecs,
  setError,
  setCaptchaRequired,
  setLimitNudge,
}: {
  identity: GuestIdentityTier;
  firstName: string;
  email: string;
  t: Translator;
  setCooldownSecs: Dispatch<SetStateAction<number>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setCaptchaRequired: Dispatch<SetStateAction<boolean>>;
  setLimitNudge: Dispatch<
    SetStateAction<{
      tier: GuestIdentityTier;
      activeCount: number;
      limit: number;
    } | null>
  >;
}): ApplyFailureFn {
  return function applyFailure(code, message, retryAfterMs, extra) {
    if (code === "rate_limited") {
      setCooldownSecs(Math.max(1, Math.ceil((retryAfterMs ?? 30_000) / 1000)));
      setError(message || t("public.guestChat.errRateLimited"));
      return;
    }
    if (code === "captcha_required") {
      setCaptchaRequired(true);
      setError(message || "Quick check to confirm you're human.");
      return;
    }
    if (code === "disposable_email") {
      setError(message || "Please use a non-disposable email so we can reach you.");
      return;
    }
    if (code === "talent_unavailable") {
      // Deliberately IGNORES the server message. Every other branch here
      // prefers `message`, but these action strings are hardcoded English, so
      // a Spanish or French guest would be told in English that the talent is
      // unavailable. The catalog copy also adds the way forward (message the
      // agency instead), which the server string cannot know to offer.
      setError(t("public.guestChat.errTalentUnavailable"));
      return;
    }
    if (code === "blocked") {
      setError(message || "This conversation can't continue.");
      return;
    }
    if (code === "limit_reached") {
      const tier: GuestIdentityTier =
        extra?.gateTier ??
        (identity === "account"
          ? "account"
          : identity === "email_verified"
            ? "email_verified"
            : identity === "identified" ||
                (Boolean(firstName.trim()) && EMAIL_RE.test(email.trim()))
              ? "identified"
              : "guest");
      setLimitNudge({
        tier,
        activeCount: extra?.activeCount ?? 0,
        limit: extra?.limit ?? 0,
      });
      setError(message);
      return;
    }
    setError(message || "Something went wrong. Please try again.");
  };
}
