"use client";

import { useActionState } from "react";

import {
  completeRecoveryPasswordUpdate,
  type PasswordRecoveryActionState,
} from "@/app/auth/password-actions";
import {
  AUTH_INPUT_CLASS,
  AUTH_INPUT_STYLE,
  AuthField,
  AuthNotice,
  AuthSubmitButton,
} from "@/components/auth/auth-ui";
import { createTranslator } from "@/i18n/messages";

export function UpdatePasswordForm({ locale = "en" }: { locale?: string }) {
  const t = createTranslator(locale);
  const [state, formAction, pending] = useActionState<
    PasswordRecoveryActionState,
    FormData
  >(completeRecoveryPasswordUpdate, undefined);

  return (
    <form action={formAction} className="space-y-3.5">
      <input type="hidden" name="locale" value={locale} />

      {state?.error ? <AuthNotice tone="error">{state.error}</AuthNotice> : null}

      <AuthField
        label={t("public.auth.update.newPassword")}
        htmlFor="recovery-new"
        hint={t("public.auth.register.passwordHint")}
      >
        <input
          id="recovery-new"
          name="new_password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          placeholder="••••••••"
          className={AUTH_INPUT_CLASS}
          style={AUTH_INPUT_STYLE}
        />
      </AuthField>

      <AuthField
        label={t("public.auth.update.confirmPassword")}
        htmlFor="recovery-confirm"
      >
        <input
          id="recovery-confirm"
          name="confirm_password"
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
        idle={t("public.auth.update.submit")}
        busy={t("public.auth.update.pending")}
      />
    </form>
  );
}
