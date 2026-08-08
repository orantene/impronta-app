"use client";

/**
 * P4 — the passwordless email-code form (CLIENT / booker intent).
 *
 * Two steps, one card:
 *   1. email  →  "Email me a sign-in code"   (requestEmailCode)
 *   2. code   →  the emailed digits + "Continue" (submitEmailCode)
 *
 * B2 (2026-08-07) — the code really is in the email: the Supabase Send Email
 * Hook is ENABLED and points at /api/hooks/auth-email, which renders
 * `email_data.token` into the magiclink + signup templates. So the code box is
 * legitimately the primary affordance here. The DIGIT COUNT is project config
 * (`mailer_otp_length`, currently 8), which is why no copy on this screen
 * promises a specific number of digits.
 *
 * The same email also carries the sign-in LINK, which the existing
 * /auth/confirm + /auth/callback routes already handle, so a booker who opens
 * their mail on another device just taps the link and is done. The code screen
 * names that link as the alternative in `codeHint`, so the way out is visible
 * even when a verify error has cleared the "code sent" notice.
 *
 * The password fields are NOT removed: `passwordFallback` is rendered in place
 * of this whole flow the moment the visitor picks "use a password instead", and
 * a matching link switches back. Nobody is trapped in either lane.
 *
 * Used by `/register?as=client` and `/login?as=client`. Every string comes from
 * the i18n catalog (EN + ES).
 */

import { useActionState, useState, type ReactNode } from "react";

import {
  requestEmailCode,
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

/** The error line for a state, if it carries one (the `sent` state never does). */
function stateError(state: EmailCodeState): string | undefined {
  return state && state.step !== "sent" ? state.error : undefined;
}

/** The address a state is about, when it knows one. */
function stateEmail(state: EmailCodeState): string | undefined {
  if (!state) return undefined;
  return state.email;
}

/** Small text button that matches the auth card's quiet link treatment. */
function QuietAction({
  onClick,
  children,
  pending = false,
}: {
  onClick: () => void;
  children: ReactNode;
  pending?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="font-medium underline underline-offset-4 transition-colors hover:text-[var(--plt-forest)] disabled:opacity-60"
      style={{ color: "var(--plt-ink-soft)" }}
    >
      {children}
    </button>
  );
}

export function EmailCodeForm({
  nextPath,
  locale = "en",
  defaultEmail,
  submitLabel,
  /** false on the login path: an unknown address must not create an account. */
  allowCreate = true,
  passwordFallback,
  footer,
}: {
  nextPath?: string;
  locale?: string;
  defaultEmail?: string;
  /** Overrides the step-1 button label (per-flow copy from the page). */
  submitLabel?: string;
  allowCreate?: boolean;
  /** The existing password form, shown when the visitor asks for it. */
  passwordFallback?: ReactNode;
  /** Rendered under both lanes (e.g. the "already have an account" line). */
  footer?: ReactNode;
}) {
  const t = createTranslator(locale);
  const [sendState, sendAction, sending] = useActionState<EmailCodeState, FormData>(
    requestEmailCode,
    undefined,
  );
  const [verifyState, verifyAction, verifying] = useActionState<
    EmailCodeState,
    FormData
  >(submitEmailCode, undefined);

  // "Use a different email" pins the form back to step 1 until the next send.
  const [backToEmail, setBackToEmail] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  // Which action the visitor most recently triggered. Both `useActionState`
  // hooks keep their last result forever, so without this a stale "that code
  // isn't right" would sit on top of a fresh "new code sent" (and vice versa).
  const [lane, setLane] = useState<"send" | "verify">("send");

  const sent = sendState?.step === "sent" ? sendState : null;
  // The code step survives a FAILED resend (`step: "code"`) too: losing the
  // screen and the address because the resend was rate limited would be worse
  // than the rate limit itself.
  const codeStepEmail =
    sendState?.step === "sent" || sendState?.step === "code"
      ? sendState.email
      : verifyState?.step === "code"
        ? verifyState.email
        : undefined;
  const email = codeStepEmail ?? stateEmail(sendState) ?? defaultEmail;
  const onCodeStep = Boolean(codeStepEmail) && !backToEmail;

  const stepError =
    lane === "verify" ? stateError(verifyState) : stateError(sendState);
  const notice = lane === "send" ? sent?.notice : undefined;

  if (showPassword && passwordFallback) {
    return (
      <div className="space-y-3.5">
        {passwordFallback}
        <p
          className="text-center text-[0.8125rem]"
          style={{ color: "var(--plt-muted)" }}
        >
          <QuietAction onClick={() => setShowPassword(false)}>
            {t("public.auth.passwordless.useCode")}
          </QuietAction>
        </p>
        {footer}
      </div>
    );
  }

  if (onCodeStep && email) {
    return (
      <div className="space-y-3.5">
        {notice ? (
          <AuthNotice tone="success">{notice.replace("{email}", email)}</AuthNotice>
        ) : null}
        {stepError ? <AuthNotice tone="error">{stepError}</AuthNotice> : null}

        <form
          action={verifyAction}
          className="space-y-3.5"
          onSubmit={() => setLane("verify")}
        >
          <input type="hidden" name="email" value={email} />
          <input type="hidden" name="locale" value={locale} />
          {nextPath ? <input type="hidden" name="next" value={nextPath} /> : null}

          <AuthField
            label={t("public.auth.passwordless.codeLabel")}
            htmlFor="otp-code"
            hint={t("public.auth.passwordless.codeHint")}
          >
            <input
              id="otp-code"
              name="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              // The code box is the only control on this step; focusing it is
              // the whole point of the screen (and saves a tap on mobile).
              autoFocus
              required
              // The emailed length is project config (6-10 digits), so the box
              // takes the widest code Supabase can issue and does not advertise
              // a digit count it cannot guarantee. See lib/auth/otp-flow.ts.
              maxLength={OTP_CODE_MAX_LENGTH}
              className={AUTH_INPUT_CLASS}
              style={{ ...AUTH_INPUT_STYLE, letterSpacing: "0.35em" }}
            />
          </AuthField>

          <AuthSubmitButton
            pending={verifying}
            idle={t("public.auth.passwordless.verifySubmit")}
            busy={t("public.auth.passwordless.verifyPending")}
          />
        </form>

        <form
          action={sendAction}
          className="pt-1 text-center text-[0.8125rem]"
          onSubmit={() => setLane("send")}
        >
          <input type="hidden" name="email" value={email} />
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="resend" value="1" />
          <input type="hidden" name="create" value={allowCreate ? "1" : "0"} />
          {nextPath ? <input type="hidden" name="next" value={nextPath} /> : null}
          <button
            type="submit"
            disabled={sending}
            className="font-medium underline underline-offset-4 transition-colors hover:text-[var(--plt-forest)] disabled:opacity-60"
            style={{ color: "var(--plt-ink-soft)" }}
          >
            {sending
              ? t("public.auth.passwordless.resending")
              : t("public.auth.passwordless.resend")}
          </button>
        </form>

        <p
          className="text-center text-[0.8125rem]"
          style={{ color: "var(--plt-muted)" }}
        >
          <QuietAction onClick={() => setBackToEmail(true)}>
            {t("public.auth.passwordless.changeEmail")}
          </QuietAction>
          {passwordFallback ? (
            <>
              {" · "}
              <QuietAction onClick={() => setShowPassword(true)}>
                {t("public.auth.passwordless.usePassword")}
              </QuietAction>
            </>
          ) : null}
        </p>

        {footer}
      </div>
    );
  }

  return (
    <div className="space-y-3.5">
      <form
        action={sendAction}
        className="space-y-3.5"
        onSubmit={() => {
          setBackToEmail(false);
          setLane("send");
        }}
      >
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="create" value={allowCreate ? "1" : "0"} />
        {nextPath ? <input type="hidden" name="next" value={nextPath} /> : null}

        {stepError ? <AuthNotice tone="error">{stepError}</AuthNotice> : null}

        <AuthField
          label={t("public.auth.form.email")}
          htmlFor="email"
          hint={t("public.auth.passwordless.emailHint")}
        >
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            defaultValue={email}
            placeholder="you@studio.com"
            className={AUTH_INPUT_CLASS}
            style={AUTH_INPUT_STYLE}
          />
        </AuthField>

        <AuthSubmitButton
          pending={sending}
          idle={submitLabel ?? t("public.auth.passwordless.emailSubmit")}
          busy={t("public.auth.passwordless.emailPending")}
        />
      </form>

      {passwordFallback ? (
        <p
          className="text-center text-[0.8125rem]"
          style={{ color: "var(--plt-muted)" }}
        >
          <QuietAction onClick={() => setShowPassword(true)}>
            {t("public.auth.passwordless.usePassword")}
          </QuietAction>
        </p>
      ) : null}

      {footer}
    </div>
  );
}
