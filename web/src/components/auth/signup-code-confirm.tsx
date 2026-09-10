"use client";

/**
 * The "check your inbox" step after a PASSWORD signup, upgraded from a dead
 * end into a working screen.
 *
 * The confirmation email the auth-email hook sends already carries BOTH the
 * link and Supabase's OTP code (`SignupConfirm` renders `email_data.token`).
 * Before this component the register surfaces only said "check your email",
 * so a person reading mail on their phone had to leave the browser they were
 * in. Now they can type the code here instead; the link keeps working in
 * parallel and either one confirms the account.
 *
 *   code   →  submitEmailCode   (verifyOtp type "email": covers signup tokens)
 *   resend →  resendSignupCode  (auth.resend type "signup", same template)
 *
 * The resend button is held behind a visible 60-second countdown. That number
 * is not decoration: Supabase refuses a second email to the same address
 * inside its send interval, so offering the button earlier would only produce
 * a rate-limit error. The countdown restarts after every successful resend.
 *
 * Used by the marketing talent modal and by /register (every intent), so it
 * takes only the auth-ui primitives and catalog strings both already share.
 */

import { useActionState, useEffect, useState } from "react";

import {
  resendSignupCode,
  submitEmailCode,
  type EmailCodeState,
} from "@/app/auth/otp-actions";
import {
  AUTH_INPUT_CLASS,
  AUTH_INPUT_STYLE,
  AuthField,
  AuthNotice,
  AuthSubmitButton,
} from "@/components/auth/auth-ui";
import { OTP_CODE_MAX_LENGTH } from "@/lib/auth/otp-flow";
import { createTranslator } from "@/i18n/messages";

/** Seconds before "send a new code" becomes tappable. Mirrors Supabase's interval. */
export const SIGNUP_RESEND_COOLDOWN_SECONDS = 60;

/**
 * Counts down from `seconds` to 0, once per `resetKey` change. Returns the
 * seconds remaining; 0 means the button may be offered.
 */
function useCooldown(seconds: number, resetKey: number): number {
  const [remaining, setRemaining] = useState(seconds);
  useEffect(() => {
    setRemaining(seconds);
    const startedAt = Date.now();
    const id = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      const left = Math.max(0, seconds - elapsed);
      setRemaining(left);
      if (left === 0) window.clearInterval(id);
    }, 250);
    return () => window.clearInterval(id);
  }, [seconds, resetKey]);
  return remaining;
}

export function SignupCodeConfirm({
  email,
  nextPath,
  locale = "en",
  onChangeEmail,
}: {
  email: string;
  nextPath?: string;
  locale?: string;
  /** When given, offers a way back to the email/password form. */
  onChangeEmail?: () => void;
}) {
  const t = createTranslator(locale);
  const [verifyState, verifyAction, verifying] = useActionState<
    EmailCodeState,
    FormData
  >(submitEmailCode, undefined);
  const [resendState, resendAction, resending] = useActionState<
    EmailCodeState,
    FormData
  >(resendSignupCode, undefined);

  // Which action produced the line on screen. Both hooks keep their last
  // result, so without this a stale "wrong code" would outlive a fresh resend.
  const [lane, setLane] = useState<"verify" | "resend">("verify");
  // Bumps once per SUCCESSFUL resend so the countdown restarts from 60.
  const [cooldownKey, setCooldownKey] = useState(0);
  const resendSucceeded = resendState?.step === "sent";
  useEffect(() => {
    if (resendSucceeded) setCooldownKey((k) => k + 1);
    // `resendState` identity changes per action result, which is the signal we
    // want: two successful resends are two distinct objects.
  }, [resendSucceeded, resendState]);
  const secondsLeft = useCooldown(SIGNUP_RESEND_COOLDOWN_SECONDS, cooldownKey);

  const verifyError =
    verifyState && verifyState.step !== "sent" ? verifyState.error : undefined;
  const resendError =
    resendState && resendState.step !== "sent" ? resendState.error : undefined;
  const error = lane === "verify" ? verifyError : resendError;
  const notice =
    lane === "resend" && resendState?.step === "sent"
      ? resendState.notice
      : t("public.auth.signupCode.sentNotice").replace("{email}", email);

  return (
    <div className="space-y-3.5">
      <AuthNotice tone="success">{notice}</AuthNotice>
      {error ? <AuthNotice tone="error">{error}</AuthNotice> : null}

      <form
        action={verifyAction}
        className="space-y-3.5"
        onSubmit={() => setLane("verify")}
      >
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="locale" value={locale} />
        {nextPath ? <input type="hidden" name="next" value={nextPath} /> : null}

        <AuthField
          label={t("public.auth.signupCode.codeLabel")}
          htmlFor="signup-otp-code"
          hint={t("public.auth.signupCode.codeHint")}
        >
          <input
            id="signup-otp-code"
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            required
            // Digit count is project config (6-10), see lib/auth/otp-flow.ts.
            maxLength={OTP_CODE_MAX_LENGTH}
            className={AUTH_INPUT_CLASS}
            style={{ ...AUTH_INPUT_STYLE, letterSpacing: "0.35em" }}
          />
        </AuthField>

        <AuthSubmitButton
          pending={verifying}
          idle={t("public.auth.signupCode.verifySubmit")}
          busy={t("public.auth.signupCode.verifyPending")}
        />
      </form>

      <form
        action={resendAction}
        className="pt-1 text-center text-[0.8125rem]"
        onSubmit={() => setLane("resend")}
      >
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="locale" value={locale} />
        {nextPath ? <input type="hidden" name="next" value={nextPath} /> : null}
        <button
          type="submit"
          disabled={resending || secondsLeft > 0}
          aria-live="polite"
          className="font-medium underline underline-offset-4 transition-colors hover:text-[var(--plt-forest)] disabled:no-underline disabled:opacity-60"
          style={{ color: "var(--plt-ink-soft)" }}
        >
          {resending
            ? t("public.auth.signupCode.resending")
            : secondsLeft > 0
              ? t("public.auth.signupCode.resendIn").replace(
                  "{seconds}",
                  String(secondsLeft),
                )
              : t("public.auth.signupCode.resend")}
        </button>
      </form>

      {onChangeEmail ? (
        <p
          className="text-center text-[0.8125rem]"
          style={{ color: "var(--plt-muted)" }}
        >
          <button
            type="button"
            onClick={onChangeEmail}
            className="font-medium underline underline-offset-4 transition-colors hover:text-[var(--plt-forest)]"
            style={{ color: "var(--plt-ink-soft)" }}
          >
            {t("public.auth.signupCode.changeEmail")}
          </button>
        </p>
      ) : null}
    </div>
  );
}
