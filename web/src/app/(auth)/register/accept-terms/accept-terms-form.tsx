"use client";

import { useActionState } from "react";

import { AgeTermsCheckbox } from "@/components/auth/age-terms-checkbox";
import { AuthNotice, AuthSubmitButton } from "@/components/auth/auth-ui";
import { createTranslator } from "@/i18n/messages";

import { acceptSignupTermsAction, type AcceptTermsState } from "./actions";

export function AcceptTermsForm({ nextPath, locale }: { nextPath: string; locale: string }) {
  const t = createTranslator(locale);
  const [state, formAction, pending] = useActionState<AcceptTermsState, FormData>(
    acceptSignupTermsAction,
    undefined,
  );
  return (
    <form action={formAction} className="space-y-3.5">
      <input type="hidden" name="next" value={nextPath} />
      <input type="hidden" name="locale" value={locale} />
      {state?.error ? <AuthNotice tone="error">{state.error}</AuthNotice> : null}
      <AgeTermsCheckbox locale={locale} />
      <AuthSubmitButton
        pending={pending}
        idle={t("public.auth.acceptTerms.submit")}
        busy={t("public.auth.register.pending")}
      />
    </form>
  );
}
