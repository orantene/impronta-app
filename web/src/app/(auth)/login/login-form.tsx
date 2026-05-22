"use client";

import { useActionState, useEffect, useState } from "react";
import { signInWithEmail, type AuthActionState } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import { createTranslator } from "@/i18n/messages";
import Link from "next/link";

const REMEMBER_STORAGE_KEY = "tulala.login.remember";

function friendlyAuthError(
  raw: string | undefined,
  t: ReturnType<typeof createTranslator>,
): string | undefined {
  if (!raw) return undefined;
  const lower = raw.toLowerCase();
  if (lower.includes("invalid login") || lower.includes("invalid credentials") || lower.includes("password")) {
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

  // Restore preference from localStorage on mount. Defaults to "true"
  // (most users want to stay signed in on their own device).
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(REMEMBER_STORAGE_KEY);
      if (stored !== null) setRemember(stored !== "0");
    } catch { /* ignore */ }
  }, []);

  const handleRememberChange = (checked: boolean) => {
    setRemember(checked);
    try {
      window.localStorage.setItem(REMEMBER_STORAGE_KEY, checked ? "1" : "0");
    } catch { /* ignore */ }
  };

  const friendlyError = friendlyAuthError(state?.error, t);

  return (
    <form action={formAction} className="space-y-4">
      {nextPath ? (
        <input type="hidden" name="next" value={nextPath} />
      ) : null}
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="remember" value={remember ? "1" : "0"} />
      {friendlyError ? (
        <p role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {friendlyError}
        </p>
      ) : null}
      {state?.message ? (
        <p role="status" className="rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-foreground">
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
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="password" className="text-sm font-medium">
            {t("public.auth.form.password")}
          </label>
          <Link
            href="/forgot-password"
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            {t("public.auth.login.forgot")}
          </Link>
        </div>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground select-none">
        <input
          type="checkbox"
          checked={remember}
          onChange={(e) => handleRememberChange(e.target.checked)}
          className="size-4 cursor-pointer rounded border-input accent-foreground"
        />
        {t("public.auth.login.remember")}
      </label>
      <Button type="submit" className="w-full" disabled={pending} aria-busy={pending}>
        {pending ? (
          <span className="inline-flex items-center gap-2">
            <span
              aria-hidden
              className="inline-block size-3 animate-spin rounded-full border-2 border-current border-t-transparent"
            />
            {t("public.auth.login.pending")}
          </span>
        ) : (
          t("public.auth.login.emailSubmit")
        )}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        {t("public.auth.login.noAccount")}{" "}
        <Link
          href={nextPath ? `/register?next=${encodeURIComponent(nextPath)}` : "/register"}
          className="text-primary underline-offset-4 hover:underline"
        >
          {t("public.auth.login.signUp")}
        </Link>
      </p>
    </form>
  );
}
