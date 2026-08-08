"use client";

import { useActionState } from "react";
import Link from "next/link";

import { requestPasswordReset, type AuthActionState } from "@/app/auth/actions";
import {
  AUTH_INPUT_CLASS,
  AUTH_INPUT_STYLE,
  AuthField,
  AuthNotice,
  AuthSubmitButton,
} from "@/components/auth/auth-ui";
import { createTranslator } from "@/i18n/messages";

export function ForgotPasswordForm({
  defaultEmail,
  locale = "en",
}: {
  defaultEmail?: string;
  locale?: string;
}) {
  const t = createTranslator(locale);
  const [state, formAction, pending] = useActionState<
    AuthActionState,
    FormData
  >(requestPasswordReset, undefined);

  return (
    <form action={formAction} className="space-y-3.5">
      <input type="hidden" name="locale" value={locale} />

      {state?.error ? <AuthNotice tone="error">{state.error}</AuthNotice> : null}
      {state?.message ? (
        <AuthNotice tone="success">{state.message}</AuthNotice>
      ) : null}

      <AuthField label={t("public.auth.form.email")} htmlFor="reset-email">
        <input
          id="reset-email"
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

      <AuthSubmitButton
        pending={pending}
        idle={t("public.auth.forgot.submit")}
        busy={t("public.auth.forgot.pending")}
      />

      <p className="pt-1 text-center text-[0.8125rem]">
        <Link
          href="/login"
          className="font-medium underline underline-offset-4 transition-colors hover:text-[var(--plt-forest)]"
          style={{ color: "var(--plt-ink-soft)" }}
        >
          {t("public.auth.forgot.back")}
        </Link>
      </p>
    </form>
  );
}
