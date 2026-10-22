"use client";

/**
 * P4 — the passwordless email-code form (CLIENT / booker intent).
 *
 * Two steps, one card:
 *   1. email  →  "Email me a code"   (requestEmailCode)
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

import { useActionState, useEffect, useState, type ReactNode } from "react";

import {
  requestEmailCode,
  submitEmailCode,
} from "@/app/auth/otp-actions";
import type { EmailCodeState } from "@/lib/auth/send-email-code-core";
import {
  AUTH_INPUT_CLASS,
  AUTH_INPUT_STYLE,
  AuthField,
  AuthNotice,
  AuthSubmitButton,
} from "@/components/auth/auth-ui";
import {
  forgetCodeStep,
  hasCodeStepParam,
  recallCodeStep,
  rememberCodeStep,
  urlWithCodeStep,
} from "@/lib/auth/code-step-url";
import { pickAuthEmail, readAuthEmailDraft, readAuthNameDraft, writeAuthEmailDraft, writeAuthNameDraft } from "@/lib/auth/email-draft";
import { authEmailHasPlusTag, OTP_CODE_LENGTH, OTP_CODE_MAX_LENGTH } from "@/lib/auth/otp-flow";
import { useFocusFirstInvalidOnError } from "@/lib/auth/use-focus-first-invalid";
import { AUTH_ERROR_IDS, authErrorField } from "@/lib/auth/auth-error-field";
import { createTranslator } from "@/i18n/messages";
import { AgeTermsCheckbox } from "@/components/auth/age-terms-checkbox";

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

/**
 * TUL-784: the password lane is ~5.3rem taller than the code lane (password
 * field + "keep me signed in" row). Without this, tapping "Use a password
 * instead" pushed the submit button ~85px down, under the pointer. The code
 * lane reserves that space so the toggle link stays where the visitor tapped.
 */
export const METHOD_SWAP_RESERVE = "pb-[5.3rem]";

/**
 * TUL-910: the email step and the code step share one floor height, so requesting a code
 * does not make the card jump (293px -> 580px at 390 before the copy was shortened).
 */
export const STEP_MIN_HEIGHT = "min-h-[19rem]";

/** TUL-910: one success/error notice row (two lines at 390px) reserved on the code step. */
export const NOTICE_SLOT_MIN_HEIGHT = "min-h-[3.5rem]";

export function EmailCodeForm({
  nextPath,
  locale = "en",
  marketingOrigin,
  defaultEmail,
  submitLabel,
  /** false on the login path: an unknown address must not create an account. */
  allowCreate = true,
  passwordFallback,
  footer,
  startWithPassword = false,
  collectName = false,
  clientSignup = false,
}: {
  nextPath?: string;
  locale?: string;
  /** Server-resolved marketing origin for the Terms/Privacy links (TUL-750). */
  marketingOrigin: string;
  defaultEmail?: string;
  /** Overrides the step-1 button label (per-flow copy from the page). */
  submitLabel?: string;
  allowCreate?: boolean;
  /** The existing password form, shown when the visitor asks for it. */
  passwordFallback?: ReactNode;
  /** Rendered under both lanes (e.g. the "already have an account" line). */
  footer?: ReactNode;
  /**
   * TUL-16 (a): the default /login keeps the password form first, with
   * "Email me a code" one tap away, so a passwordless account
   * (magic link or Google) always has a way back in.
   */
  startWithPassword?: boolean;
  /** TUL-762: ask for a name on the create path; it rides as `full_name` into the new profile. */
  collectName?: boolean;
  /** TUL-771: this is an explicit client sign-up; the verified account skips the role screen. */
  clientSignup?: boolean;
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
  // TUL-1234: controlled, so a failed verify (form action reset) keeps what was typed.
  const [code, setCode] = useState("");
  const [showPassword, setShowPassword] = useState(startWithPassword);
  // TUL-558: warn before send when the visitor types a +tag alias.
  const [emailDraft, setEmailDraft] = useState(() => {
    const seed = pickAuthEmail(readAuthEmailDraft(), defaultEmail);
    if (seed) writeAuthEmailDraft(seed);
    return seed;
  });
  // Which action the visitor most recently triggered. Both `useActionState`
  // hooks keep their last result forever, so without this a stale "that code
  // isn't right" would sit on top of a fresh "new code sent" (and vice versa).
  const [lane, setLane] = useState<"send" | "verify">("send");

  const sent = sendState?.step === "sent" ? sendState : null;
  // TUL-909: a short wait before the next code, like the sign-up code screen.
  const [secondsLeft, setSecondsLeft] = useState(0);
  useEffect(() => {
    if (sent) setSecondsLeft(30);
  }, [sent]);
  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = window.setTimeout(() => setSecondsLeft((n) => n - 1), 1000);
    return () => window.clearTimeout(id);
  }, [secondsLeft]);
  // The code step survives a FAILED resend (`step: "code"`) too: losing the
  // screen and the address because the resend was rate limited would be worse
  // than the rate limit itself.
  // TUL-766: a reload (or coming back from the mail app) lands on the code box again.
  const [restoredEmail, setRestoredEmail] = useState<string | undefined>(undefined);
  useEffect(() => {
    try {
      if (hasCodeStepParam(window.location.search)) {
        const remembered = recallCodeStep(window.sessionStorage, Date.now());
        if (remembered) setRestoredEmail(remembered);
        else window.history.replaceState(window.history.state, "", urlWithCodeStep(window.location.href, false));
      }
    } catch {
      /* storage unavailable: the form simply starts at step 1 */
    }
  }, []);
  const liveCodeStepEmail =
    sendState?.step === "sent" || sendState?.step === "code"
      ? sendState.email
      : verifyState?.step === "code"
        ? verifyState.email
        : undefined;
  const codeStepEmail = liveCodeStepEmail ?? (backToEmail ? undefined : restoredEmail);
  const email = codeStepEmail ?? stateEmail(sendState) ?? defaultEmail;
  const onCodeStep = Boolean(codeStepEmail) && !backToEmail;
  useEffect(() => {
    try {
      if (onCodeStep && codeStepEmail) {
        rememberCodeStep(window.sessionStorage, codeStepEmail, Date.now());
        window.history.replaceState(window.history.state, "", urlWithCodeStep(window.location.href, true));
      } else if (backToEmail) {
        forgetCodeStep(window.sessionStorage);
        window.history.replaceState(window.history.state, "", urlWithCodeStep(window.location.href, false));
      }
    } catch {
      /* the URL marker is a nicety; never block the form */
    }
  }, [onCodeStep, codeStepEmail, backToEmail]);

  const stepError =
    lane === "verify" ? stateError(verifyState) : stateError(sendState);
  useFocusFirstInvalidOnError(stepError);
  const errField = authErrorField(stepError, {
    invalidEmail: t("public.auth.actions.invalidEmail"),
    ageTermsRequired: t("public.auth.actions.ageTermsRequired"),
  });

  if (showPassword && passwordFallback) {
    return (
      <div className="space-y-3.5">
        {passwordFallback}
        <p
          className="text-center text-[0.8125rem]"
          style={{ color: "var(--plt-muted)" }}
        >
          <QuietAction
            onClick={() => {
              // Back from the password lane: take the address typed there.
              setEmailDraft(readAuthEmailDraft());
              setShowPassword(false);
            }}
          >
            {onCodeStep && email
              ? t("public.auth.passwordless.backToCode")
              : t("public.auth.passwordless.useCode")}
          </QuietAction>
        </p>
        {footer}
      </div>
    );
  }

  if (onCodeStep && email) {
    return (
      <div className={`space-y-3.5 ${STEP_MIN_HEIGHT}`}>
        {/* TUL-910: one fixed slot; an error replaces the sent notice instead of stacking above it */}
        <div className={NOTICE_SLOT_MIN_HEIGHT}>
          {stepError ? (
            <AuthNotice tone="error" id="code-step-error">{stepError}</AuthNotice>
          ) : sent?.notice ? (
            <AuthNotice tone="success">{sent.notice.replace("{email}", email)}</AuthNotice>
          ) : null}
        </div>

        <form
          action={verifyAction}
          className={`space-y-3.5 ${passwordFallback ? METHOD_SWAP_RESERVE : ""}`}
          onSubmit={() => setLane("verify")}
        >
          <input type="hidden" name="email" value={email} />
          <input type="hidden" name="locale" value={locale} />
          {allowCreate ? <input type="hidden" name="create" value="1" /> : null}
          {allowCreate && clientSignup ? <input type="hidden" name="signup_intent" value="client" /> : null}
          {/* Step 1 required the 18+ and Terms box on the create path. */}
          {allowCreate ? <input type="hidden" name="age_terms" value="on" /> : null}
          {nextPath ? <input type="hidden" name="next" value={nextPath} /> : null}

          <AuthField
            label={t("public.auth.passwordless.codeLabel")}
            htmlFor="otp-code"
            hintLines={3}
            hint={`${t("public.auth.passwordless.codeLengthHint").replace("{n}", String(OTP_CODE_LENGTH))} ${t("public.auth.passwordless.codeHint")}`}
          >
            <input
              id="otp-code"
              name="code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D+/g, "").slice(0, OTP_CODE_MAX_LENGTH))}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              aria-invalid={stepError ? true : undefined}
              aria-describedby={stepError ? "code-step-error" : undefined}
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
          {allowCreate && collectName ? <input type="hidden" name="full_name" value={readAuthNameDraft()} /> : null}
          <input type="hidden" name="create" value={allowCreate ? "1" : "0"} />
          {allowCreate ? <input type="hidden" name="age_terms" value="on" /> : null}
          {allowCreate ? <input type="hidden" name="terms_form" value="1" /> : null}
          {nextPath ? <input type="hidden" name="next" value={nextPath} /> : null}
          <button
            type="submit"
            disabled={sending || secondsLeft > 0}
            className="font-medium underline underline-offset-4 transition-colors hover:text-[var(--plt-forest)] disabled:opacity-60"
            style={{ color: "var(--plt-ink-soft)" }}
          >
            {sending
              ? t("public.auth.passwordless.resending")
              : secondsLeft > 0
                ? t("public.auth.signupCode.resendIn").replace("{seconds}", String(secondsLeft))
                : t("public.auth.passwordless.resend")}
          </button>
        </form>

        <p
          className="text-center text-[0.8125rem]"
          style={{ color: "var(--plt-muted)" }}
        >
          <QuietAction onClick={() => { setBackToEmail(true); setRestoredEmail(undefined); }}>
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
    <div className={`space-y-3.5 ${STEP_MIN_HEIGHT}`}>
      <form
        action={sendAction}
        noValidate // TUL-893: the server answers in the page language; no English browser tooltip
        className={`space-y-3.5 ${passwordFallback ? METHOD_SWAP_RESERVE : ""}`}
        onSubmit={() => {
          setBackToEmail(false);
          setLane("send");
        }}
      >
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="create" value={allowCreate ? "1" : "0"} />
        {allowCreate ? <input type="hidden" name="terms_form" value="1" /> : null}
        {allowCreate && clientSignup ? <input type="hidden" name="signup_as" value="client" /> : null}
        {nextPath ? <input type="hidden" name="next" value={nextPath} /> : null}

        {allowCreate && collectName ? (
          <AuthField label={t("public.auth.form.name")} htmlFor="full_name">
            <input
              id="full_name"
              name="full_name"
              type="text"
              autoComplete="name"
              required
              maxLength={120}
              defaultValue={readAuthNameDraft()}
              onChange={(e) => writeAuthNameDraft(e.target.value)}
              placeholder={t("public.auth.form.namePlaceholder")}
              className={AUTH_INPUT_CLASS}
              style={AUTH_INPUT_STYLE}
            />
          </AuthField>
        ) : null}

        <AuthField
          label={t("public.auth.form.email")}
          htmlFor="email"
          hintLines={2}
          error={stepError}
          errorId={AUTH_ERROR_IDS[errField ?? "form"]}
          hint={
            authEmailHasPlusTag(emailDraft)
              ? t("public.auth.passwordless.plusEmailHint")
              : t("public.auth.passwordless.emailHint")
          }
        >
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            aria-invalid={errField === "email" ? true : undefined}
            aria-describedby={errField === "email" ? AUTH_ERROR_IDS.email : undefined}
            defaultValue={pickAuthEmail(readAuthEmailDraft(), email)}
            onChange={(e) => {
              setEmailDraft(e.target.value);
              writeAuthEmailDraft(e.target.value);
            }}
            placeholder={t("public.auth.form.emailPlaceholder")}
            className={AUTH_INPUT_CLASS}
            style={AUTH_INPUT_STYLE}
          />
        </AuthField>

        {allowCreate ? (
          <AgeTermsCheckbox
            locale={locale}
            marketingOrigin={marketingOrigin}
            invalid={errField === "consent"}
            errorId={AUTH_ERROR_IDS.consent}
          />
        ) : null}

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
