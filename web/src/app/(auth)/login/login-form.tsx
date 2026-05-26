"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";

import { signInWithEmail, type AuthActionState } from "@/app/auth/actions";
import { createTranslator } from "@/i18n/messages";

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

  return (
    <form action={formAction} className="space-y-3.5">
      {nextPath ? <input type="hidden" name="next" value={nextPath} /> : null}
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="remember" value={remember ? "1" : "0"} />

      {friendlyError ? (
        <p
          role="alert"
          className="rounded-xl px-3 py-2 text-[0.8125rem]"
          style={{
            background: "rgba(180, 35, 24, 0.08)",
            color: "#9b1c14",
            border: "1px solid rgba(180, 35, 24, 0.18)",
          }}
        >
          {friendlyError}
        </p>
      ) : null}

      {state?.message ? (
        <p
          role="status"
          className="rounded-xl px-3 py-2 text-[0.8125rem]"
          style={{
            background: "color-mix(in srgb, var(--plt-forest) 8%, transparent)",
            color: "var(--plt-ink)",
            border:
              "1px solid color-mix(in srgb, var(--plt-forest) 22%, transparent)",
          }}
        >
          {state.message}
        </p>
      ) : null}

      <Field label={t("public.auth.form.email")}>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={defaultEmail}
          placeholder="you@studio.com"
          className={INPUT_CLASSES}
          style={INPUT_STYLE}
        />
      </Field>

      <Field
        label={t("public.auth.form.password")}
        rightSlot={
          <Link
            href="/forgot-password"
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
          placeholder="••••••••"
          className={INPUT_CLASSES}
          style={INPUT_STYLE}
        />
      </Field>

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

      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="group mt-1 inline-flex w-full items-center justify-center gap-2 rounded-full px-6 py-3 text-[0.9375rem] font-medium leading-none tracking-[-0.005em] transition-[background,transform,box-shadow] duration-200 disabled:cursor-wait disabled:opacity-80"
        style={{
          background: "var(--plt-forest)",
          color: "var(--plt-forest-on)",
          boxShadow: "var(--plt-shadow-forest)",
        }}
      >
        <span>{pending ? t("public.auth.login.pending") : t("public.auth.login.emailSubmit")}</span>
        {!pending ? <ArrowGlyph /> : <Spinner />}
      </button>
    </form>
  );
}

/* ───────────────────────── building blocks ───────────────────────── */

function Field({
  label,
  rightSlot,
  children,
}: {
  label: string;
  rightSlot?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span
          className="plt-mono block text-[0.6875rem] font-semibold uppercase tracking-[0.16em]"
          style={{ color: "var(--plt-muted)" }}
        >
          {label}
        </span>
        {rightSlot}
      </div>
      {children}
    </div>
  );
}

const INPUT_CLASSES =
  "flex h-12 w-full rounded-2xl px-4 text-[0.9375rem] leading-none outline-none transition-[border-color,box-shadow] placeholder:text-[var(--plt-muted-soft)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--plt-forest)_18%,transparent)]";

const INPUT_STYLE: React.CSSProperties = {
  backgroundColor: "var(--plt-bg)",
  border: "1px solid var(--plt-hairline-strong)",
  color: "var(--plt-ink)",
};

function ArrowGlyph() {
  return (
    <svg
      aria-hidden
      width="14"
      height="10"
      viewBox="0 0 14 10"
      fill="none"
      className="transition-transform duration-200 group-hover:translate-x-0.5"
    >
      <path
        d="M1 5H13M13 5L9 1M13 5L9 9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Spinner() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className="animate-spin"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="2"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
