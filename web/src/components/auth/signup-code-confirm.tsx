"use client";

/**
 * The step after a PASSWORD signup when the account still needs confirming.
 *
 * The confirmation email carries BOTH the link and Supabase's OTP code
 * (`SignupConfirm` renders `email_data.token`). Before this the register
 * surfaces only said "check your email", which sent a person reading mail on
 * their phone away from the browser they signed up in. Now the code goes in
 * here, one box per digit, and the form submits itself the moment the last
 * box fills; the link keeps working in parallel and either one confirms.
 *
 *   code   →  submitEmailCode   (verifyOtp type "email": covers signup tokens)
 *   resend →  resendSignupCode  (auth.resend type "signup", same template)
 *
 * "Resend" sits behind a visible 60-second countdown. That number is not
 * decoration: Supabase refuses a second email to the same address inside its
 * send interval, so offering the button earlier would only produce an error.
 * The countdown restarts after every successful resend, and the boxes clear
 * so the old code cannot be submitted by accident.
 *
 * Copy is deliberately minimal (owner review 2026-09-10: the first version
 * explained itself three times). Title, the address, the boxes, one line.
 */

import { useActionState, useEffect, useRef, useState } from "react";

import {
  resendSignupCode,
  submitEmailCode,
  type EmailCodeState,
} from "@/app/auth/otp-actions";
import { AuthNotice, AuthSubmitButton } from "@/components/auth/auth-ui";
import { OtpCodeInput } from "@/components/auth/otp-code-input";
import { createTranslator } from "@/i18n/messages";

/** Seconds before "resend" becomes tappable. Mirrors Supabase's interval. */
export const SIGNUP_RESEND_COOLDOWN_SECONDS = 60;

/** Counts down from `seconds` to 0, restarting whenever `resetKey` changes. */
function useCooldown(seconds: number, resetKey: number): number {
  const [remaining, setRemaining] = useState(seconds);
  useEffect(() => {
    setRemaining(seconds);
    const startedAt = Date.now();
    const id = window.setInterval(() => {
      const left = Math.max(0, seconds - Math.floor((Date.now() - startedAt) / 1000));
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
  const formRef = useRef<HTMLFormElement | null>(null);

  // Which action produced the line on screen. Both hooks keep their last
  // result, so without this a stale "wrong code" would outlive a fresh resend.
  const [lane, setLane] = useState<"verify" | "resend">("verify");
  // Bumps once per SUCCESSFUL resend: restarts the countdown, clears the boxes.
  const [resendCount, setResendCount] = useState(0);
  const resendSucceeded = resendState?.step === "sent";
  useEffect(() => {
    if (resendSucceeded) setResendCount((k) => k + 1);
    // `resendState` identity changes per action result, which is the signal we
    // want: two successful resends are two distinct objects.
  }, [resendSucceeded, resendState]);
  const secondsLeft = useCooldown(SIGNUP_RESEND_COOLDOWN_SECONDS, resendCount);

  const verifyError =
    verifyState && verifyState.step !== "sent" ? verifyState.error : undefined;
  const resendError =
    resendState && resendState.step !== "sent" ? resendState.error : undefined;
  const error = lane === "verify" ? verifyError : resendError;
  const resent = lane === "resend" && resendSucceeded;

  return (
    <div className="space-y-5">
      <div className="space-y-1 text-center">
        <h3
          className="plt-display text-[1.25rem] font-semibold"
          style={{ color: "var(--plt-ink)" }}
        >
          {t("public.auth.signupCode.title")}
        </h3>
        <p className="text-[0.875rem]" style={{ color: "var(--plt-muted)" }}>
          {t("public.auth.signupCode.sentTo")}{" "}
          <span className="font-medium" style={{ color: "var(--plt-ink)" }}>
            {email}
          </span>
        </p>
      </div>

      <form
        ref={formRef}
        action={verifyAction}
        className="space-y-4"
        onSubmit={() => setLane("verify")}
      >
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="locale" value={locale} />
        {nextPath ? <input type="hidden" name="next" value={nextPath} /> : null}

        <OtpCodeInput
          disabled={verifying}
          invalid={Boolean(verifyError) && lane === "verify"}
          resetKey={resendCount}
          // Last box filled: submit without a second tap.
          onComplete={() => formRef.current?.requestSubmit()}
        />

        {error ? <AuthNotice tone="error">{error}</AuthNotice> : null}
        {resent ? (
          <AuthNotice tone="success">{t("public.auth.signupCode.resentNotice")}</AuthNotice>
        ) : null}

        <AuthSubmitButton
          pending={verifying}
          idle={t("public.auth.signupCode.verifySubmit")}
          busy={t("public.auth.signupCode.verifyPending")}
        />
      </form>

      <form
        action={resendAction}
        className="text-center text-[0.8125rem]"
        style={{ color: "var(--plt-muted)" }}
        onSubmit={() => setLane("resend")}
      >
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="locale" value={locale} />
        {nextPath ? <input type="hidden" name="next" value={nextPath} /> : null}
        {t("public.auth.signupCode.resendPrompt")}{" "}
        <button
          type="submit"
          disabled={resending || secondsLeft > 0}
          aria-live="polite"
          className="font-medium underline underline-offset-4 transition-colors hover:text-[var(--plt-forest)] disabled:no-underline disabled:opacity-70"
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
        {onChangeEmail ? (
          <>
            {" · "}
            <button
              type="button"
              onClick={onChangeEmail}
              className="font-medium underline underline-offset-4 transition-colors hover:text-[var(--plt-forest)]"
              style={{ color: "var(--plt-ink-soft)" }}
            >
              {t("public.auth.signupCode.changeEmail")}
            </button>
          </>
        ) : null}
      </form>
    </div>
  );
}
