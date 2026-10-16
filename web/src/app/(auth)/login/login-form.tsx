"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";

import { signInWithEmail, type AuthActionState } from "@/app/auth/actions";
import {
  AUTH_INPUT_CLASS,
  AUTH_INPUT_STYLE,
  AuthField,
  AuthNotice,
  AuthSubmitButton,
} from "@/components/auth/auth-ui";
import { pickAuthEmail, readAuthEmailDraft, writeAuthEmailDraft } from "@/lib/auth/email-draft";
import { useFocusFirstInvalidOnError } from "@/lib/auth/use-focus-first-invalid";
import { createTranslator } from "@/i18n/messages";
import { withLocaleHref } from "@/i18n/pathnames";

const REMEMBER_STORAGE_KEY = "tulala.login.remember";

function friendlyAuthError(
  raw: string | undefined,
  t: ReturnType<typeof createTranslator>,
): string | undefined {
  if (!raw) return undefined;
  const lower = raw.toLowerCase();
  if (
    lower.includes("invalid login") ||
    lower.includes("invalid credentials") ||
    lower.includes("password")
  ) {
    return t("public.auth.errors.invalidCredentials");
  }
  if (lower.includes("email not confirmed") || lower.includes("not confirmed")) {
    return t("public.auth.errors.emailNotConfirmed");
  }
  if (lower.includes("rate") || lower.includes("too many")) {
    return t("public.auth.errors.tooManyAttempts");
  }
  if (lower.includes("network") || lower.includes("fetch")) {
    return t("public.auth.errors.network");
  }
  return raw;
}

export function LoginForm({
  nextPath,
  defaultEmail,
  locale = "en",
}: {
  nextPath?: string;
  defaultEmail?: string;
  locale?: string;
}) {
  const t = createTranslator(locale);
  const [state, formAction, pending] = useActionState<
    AuthActionState,
    FormData
  >(signInWithEmail, undefined);
  const [remember, setRemember] = useState(true);
  // TUL-768: React resets uncontrolled fields after a form action, so a failed login wiped the typed email.
  const [email, setEmail] = useState(pickAuthEmail(readAuthEmailDraft(), defaultEmail));

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(REMEMBER_STORAGE_KEY);
      if (stored !== null) setRemember(stored !== "0");
    } catch {
      /* ignore */
    }
  }, []);

  const handleRememberChange = (checked: boolean) => {
    setRemember(checked);
    try {
      window.localStorage.setItem(REMEMBER_STORAGE_KEY, checked ? "1" : "0");
    } catch {
      /* ignore */
    }
  };

  const friendlyError = friendlyAuthError(state?.error, t);
  useFocusFirstInvalidOnError(friendlyError);

  return (
    <form action={formAction} noValidate className="space-y-3.5">
      {nextPath ? <input type="hidden" name="next" value={nextPath} /> : null}
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="remember" value={remember ? "1" : "0"} />

      {friendlyError ? (
        <AuthNotice tone="error" id="login-error">{friendlyError}</AuthNotice>
      ) : null}

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
          aria-invalid={friendlyError ? true : undefined}
          aria-describedby={friendlyError ? "login-error" : undefined}
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            writeAuthEmailDraft(e.target.value);
          }}
          placeholder={t("public.auth.form.emailPlaceholder")}
          className={AUTH_INPUT_CLASS}
          style={AUTH_INPUT_STYLE}
        />
      </AuthField>

      <AuthField
        label={t("public.auth.form.password")}
        htmlFor="password"
        rightSlot={
          <Link
            href={withLocaleHref("/forgot-password", locale)}
            className="plt-mono text-[0.6875rem] font-semibold uppercase tracking-[0.14em] transition-colors hover:text-[var(--plt-forest)]"
            style={{ color: "var(--plt-muted)" }}
          >
            {t("public.auth.login.forgot")}
          </Link>
        }
      >
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={AUTH_INPUT_CLASS}
          style={AUTH_INPUT_STYLE}
        />
      </AuthField>

      <label
        className="flex cursor-pointer items-center gap-2 pt-1 text-[0.8125rem] select-none"
        style={{ color: "var(--plt-muted)" }}
      >
        <input
          type="checkbox"
          checked={remember}
          onChange={(e) => handleRememberChange(e.target.checked)}
          className="size-4 cursor-pointer rounded"
          style={{ accentColor: "var(--plt-forest)" }}
        />
        {t("public.auth.login.remember")}
      </label>

      <AuthSubmitButton
        pending={pending}
        idle={t("public.auth.login.emailSubmit")}
        busy={t("public.auth.login.pending")}
      />
    </form>
  );
}
