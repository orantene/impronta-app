"use client";

import { useActionState } from "react";
import Link from "next/link";

import { signUpWithEmail, type AuthActionState } from "@/app/auth/actions";
import {
  AUTH_INPUT_CLASS,
  AUTH_INPUT_STYLE,
  AuthField,
  AuthNotice,
  AuthSubmitButton,
} from "@/components/auth/auth-ui";
import { createTranslator } from "@/i18n/messages";

/**
 * "Already have an account? Log in" — one copy, used by the password form and
 * by the passwordless wrapper (which renders it outside both lanes so it does
 * not appear twice).
 *
 * `intent` rides along as `?as=`: a client who bounces to /login should meet the
 * same passwordless-first screen they just left, not a password box.
 */
export function RegisterLoginFooter({
  nextPath,
  locale = "en",
  intent,
}: {
  nextPath?: string;
  locale?: string;
  intent?: string;
}) {
  const t = createTranslator(locale);
  const query = new URLSearchParams();
  if (intent) query.set("as", intent);
  if (nextPath) query.set("next", nextPath);
  const search = query.toString();

  return (
    <p
      className="pt-1 text-center text-[0.8125rem]"
      style={{ color: "var(--plt-muted)" }}
    >
      {t("public.auth.register.haveAccount")}{" "}
      <Link
        href={search ? `/login?${search}` : "/login"}
        className="font-medium underline underline-offset-4 transition-colors hover:text-[var(--plt-forest)]"
        style={{ color: "var(--plt-ink-soft)" }}
      >
        {t("public.auth.register.logIn")}
      </Link>
    </p>
  );
}

export function RegisterForm({
  nextPath,
  submitLabel,
  locale = "en",
  defaultEmail,
  /**
   * P4 — hides the "already have an account? Log in" footer, because the
   * passwordless wrapper renders it once for BOTH lanes (code + password).
   */
  hideFooter = false,
}: {
  nextPath?: string;
  submitLabel?: string;
  locale?: string;
  /** Pre-fills the email field (e.g. from the get-started lead) — editable. */
  defaultEmail?: string;
  hideFooter?: boolean;
}) {
  const t = createTranslator(locale);
  const [state, formAction, pending] = useActionState<
    AuthActionState,
    FormData
  >(signUpWithEmail, undefined);

  return (
    <form action={formAction} className="space-y-3.5">
      {nextPath ? <input type="hidden" name="next" value={nextPath} /> : null}
      <input type="hidden" name="locale" value={locale} />

      {state?.error ? <AuthNotice tone="error">{state.error}</AuthNotice> : null}
      {state?.message ? (
        <AuthNotice tone="success">{state.message}</AuthNotice>
      ) : null}

      <AuthField label={t("public.auth.form.email")} htmlFor="email">
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={defaultEmail}
          placeholder="you@studio.com"
          className={AUTH_INPUT_CLASS}
          style={AUTH_INPUT_STYLE}
        />
      </AuthField>

      <AuthField
        label={t("public.auth.form.password")}
        htmlFor="password"
        hint={t("public.auth.register.passwordHint")}
      >
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          placeholder="••••••••"
          className={AUTH_INPUT_CLASS}
          style={AUTH_INPUT_STYLE}
        />
      </AuthField>

      <AuthSubmitButton
        pending={pending}
        idle={submitLabel ?? t("public.auth.register.emailSubmit")}
        busy={t("public.auth.register.pending")}
      />

      {hideFooter ? null : (
        <RegisterLoginFooter nextPath={nextPath} locale={locale} />
      )}
    </form>
  );
}
