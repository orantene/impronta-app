"use client";

import { useActionState } from "react";
import { signUpWithEmail, type AuthActionState } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import { createTranslator } from "@/i18n/messages";
import Link from "next/link";

export function RegisterForm({
  nextPath,
  submitLabel,
  locale = "en",
  defaultEmail,
}: {
  nextPath?: string;
  submitLabel?: string;
  locale?: string;
  /** Pre-fills the email field (e.g. from the get-started lead) — editable. */
  defaultEmail?: string;
}) {
  const t = createTranslator(locale);
  const [state, formAction, pending] = useActionState<
    AuthActionState,
    FormData
  >(signUpWithEmail, undefined);

  return (
    <form action={formAction} className="space-y-4">
      {nextPath ? (
        <input type="hidden" name="next" value={nextPath} />
      ) : null}
      <input type="hidden" name="locale" value={locale} />
      {state?.error ? (
        <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      {state?.message ? (
        <p className="rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-foreground">
          {state.message}
        </p>
      ) : null}
      <div className="space-y-2">
        <label htmlFor="email" className="text-sm font-medium">
          {t("public.auth.form.email")}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={defaultEmail}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="password" className="text-sm font-medium">
          {t("public.auth.form.password")}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <p className="text-sm text-muted-foreground">
          {t("public.auth.register.passwordHint")}
        </p>
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? t("public.auth.register.pending") : submitLabel ?? t("public.auth.register.emailSubmit")}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        {t("public.auth.register.haveAccount")}{" "}
        <Link
          href={nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : "/login"}
          className="text-primary underline-offset-4 hover:underline"
        >
          {t("public.auth.register.logIn")}
        </Link>
      </p>
    </form>
  );
}
