"use client";

/**
 * Marketing sign-in MODAL — opens in place on any marketing surface (notably
 * the apex `tulala.digital`) instead of redirecting to `app.tulala.digital/login`.
 *
 * Why in-place: signing in ON the apex writes the Supabase session cookie for
 * the current host, which `cookieDomainForHost` scopes to `.tulala.digital` — so
 * the marketing header (and every subdomain) recognizes the session immediately.
 * On success the modal closes and `router.refresh()`es; the header flips to the
 * account menu (which carries the user into their workspace) without leaving the
 * page. See the OAuth cookie-scope work (PRs #799/#800) for the underlying fix.
 *
 * Trigger from anywhere: `window.dispatchEvent(new CustomEvent(LOGIN_MODAL_EVENT))`.
 * Mounted once per surface by `MarketingModalHost`.
 *
 * Reuses the existing server-initiated Google popup (`/auth/google?popup=1`,
 * allowed on the marketing host) and a non-redirecting email action
 * (`signInWithEmailModal`). No duplicated auth logic.
 */

import { useActionState, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  signInWithEmailModal,
  type SignInModalState,
} from "@/app/auth/actions";
import { AUTH_POPUP_MESSAGE_TYPE, type AuthPopupMessage } from "@/lib/auth-popup";
import { pickLocale } from "@/lib/i18n/pick-locale";
import {
  ArrowGlyph,
  CloseGlyph,
  GoogleGlyph,
  Spinner,
} from "./talent-register-modal-glyphs";
import { loadWelcomeAccountModel } from "./welcome-actions";
import { LoginWelcomePanel } from "./login-welcome-panel";
import type { MarketingAccount } from "./marketing-account-menu";

export const LOGIN_MODAL_EVENT = "tulala:open-login-modal" as const;

type LoginCopy = {
  eyebrow: string;
  title: string;
  titleAccent: string;
  sub: string;
  google: string;
  googleOpening: string;
  orEmail: string;
  email: string;
  password: string;
  submit: string;
  submitting: string;
  forgot: string;
  noAccount: string;
  createOne: string;
  googleFailed: string;
  popupBlocked: string;
};

function getLoginCopy(locale: string): LoginCopy {
  return pickLocale(locale, {
    en: {
      eyebrow: "Welcome back",
      title: "Sign in to",
      titleAccent: "Tulala.",
      sub: "Pick up right where you left off.",
      google: "Continue with Google",
      googleOpening: "Opening Google…",
      orEmail: "or with email",
      email: "Email",
      password: "Password",
      submit: "Sign in",
      submitting: "Signing you in…",
      forgot: "Forgot your password?",
      noAccount: "New to Tulala?",
      createOne: "Create a free workspace",
      googleFailed: "Google sign-in failed. Try again.",
      popupBlocked: "Popup blocked. Allow popups for this site and try again.",
    },
    es: {
      eyebrow: "Bienvenido de nuevo",
      title: "Inicia sesión en",
      titleAccent: "Tulala.",
      sub: "Continúa justo donde lo dejaste.",
      google: "Continuar con Google",
      googleOpening: "Abriendo Google…",
      orEmail: "o con correo",
      email: "Correo",
      password: "Contraseña",
      submit: "Iniciar sesión",
      submitting: "Iniciando sesión…",
      forgot: "¿Olvidaste tu contraseña?",
      noAccount: "¿Nuevo en Tulala?",
      createOne: "Crea un workspace gratis",
      googleFailed: "Error al iniciar sesión con Google. Inténtalo de nuevo.",
      popupBlocked: "Popup bloqueado. Permite popups para este sitio e inténtalo de nuevo.",
    },
  });
}

export function LoginModal({
  onClose,
  locale = "en",
}: {
  onClose: () => void;
  locale?: string;
}) {
  const [mounted, setMounted] = useState(false);
  const [welcome, setWelcome] = useState<MarketingAccount | null>(null);
  const [loadingWelcome, setLoadingWelcome] = useState(false);
  const emailRef = useRef<HTMLInputElement | null>(null);
  const router = useRouter();
  const t = getLoginCopy(locale);

  useEffect(() => setMounted(true), []);

  // Lock body scroll while open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Close on Escape + focus email when opened.
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    const focusT = window.setTimeout(() => emailRef.current?.focus(), 60);
    return () => {
      document.removeEventListener("keydown", handleKey);
      window.clearTimeout(focusT);
    };
  }, [onClose]);

  // On success, fetch the identity-aware model and show the welcome panel with
  // quick links (staying on the page). If the model can't load, fall back to
  // just refreshing so the header flips to the account menu.
  async function handleAuthSuccess() {
    setLoadingWelcome(true);
    try {
      const model = await loadWelcomeAccountModel();
      if (model) {
        setWelcome(model);
        return;
      }
    } catch {
      /* fall through to refresh */
    } finally {
      setLoadingWelcome(false);
    }
    router.refresh();
    onClose();
  }

  // Dismissing the welcome panel refreshes the page so the header reflects the
  // signed-in state, then closes.
  function dismissWelcome() {
    router.refresh();
    onClose();
  }

  if (!mounted) return null;

  return createPortal(
    <div className="tlmodal-root" data-platform-surface="marketing">
      <div
        className="fixed inset-0 z-[200] bg-[rgba(15,23,20,0.55)] backdrop-blur-sm"
        aria-hidden="true"
        onClick={onClose}
      />
      <div
        className="fixed inset-0 z-[201] flex items-center justify-center overflow-y-auto p-4 sm:p-8"
        role="presentation"
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="login-modal-title"
          className="relative w-full max-w-[420px] rounded-[28px] p-7 sm:p-9 tlmodal-card"
          style={{
            background: "var(--plt-bg-elevated)",
            border: "1px solid var(--plt-hairline-strong)",
            boxShadow:
              "0 30px 80px -30px rgba(15,23,20,0.45), 0 2px 8px -2px rgba(15,23,20,0.08)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors"
            style={{ color: "var(--plt-muted)" }}
          >
            <span
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border transition-colors hover:bg-[var(--plt-bg-raised)]"
              style={{ borderColor: "var(--plt-hairline)" }}
            >
              <CloseGlyph />
            </span>
          </button>

          {welcome ? (
            <LoginWelcomePanel
              account={welcome}
              locale={locale}
              onDismiss={dismissWelcome}
            />
          ) : loadingWelcome ? (
            <div className="flex items-center justify-center gap-2 py-16" style={{ color: "var(--plt-muted)" }}>
              <Spinner />
              <span className="text-[0.875rem]">{t.submitting}</span>
            </div>
          ) : (
            <>
              <div className="mb-7">
                <p
                  className="plt-mono text-[0.625rem] font-semibold uppercase tracking-[0.22em]"
                  style={{ color: "var(--plt-forest)" }}
                >
                  {t.eyebrow}
                </p>
                <h2
                  id="login-modal-title"
                  className="plt-display mt-2 text-[1.625rem] font-semibold leading-[1.15] tracking-[-0.02em]"
                  style={{ color: "var(--plt-ink)" }}
                >
                  {t.title}{" "}
                  <span style={{ color: "var(--plt-forest)" }}>{t.titleAccent}</span>
                </h2>
                <p
                  className="mt-2 text-[0.875rem] leading-[1.5]"
                  style={{ color: "var(--plt-muted)" }}
                >
                  {t.sub}
                </p>
              </div>

              <LoginModalGoogleButton copy={t} onSuccess={handleAuthSuccess} />

              <div className="my-4 flex items-center gap-3">
                <div className="h-px flex-1" style={{ background: "var(--plt-hairline)" }} />
                <span
                  className="plt-mono text-[0.625rem] font-medium uppercase tracking-[0.22em]"
                  style={{ color: "var(--plt-muted)" }}
                >
                  {t.orEmail}
                </span>
                <div className="h-px flex-1" style={{ background: "var(--plt-hairline)" }} />
              </div>

              <LoginModalEmailForm
                copy={t}
                locale={locale}
                emailRef={emailRef}
                onSuccess={handleAuthSuccess}
              />

              <p
                className="mt-5 text-center text-[0.8125rem]"
                style={{ color: "var(--plt-muted)" }}
              >
                {t.noAccount}{" "}
                <Link
                  href="/get-started"
                  onClick={onClose}
                  className="font-medium underline underline-offset-4 transition-colors hover:text-[var(--plt-forest)]"
                  style={{ color: "var(--plt-ink-soft)" }}
                >
                  {t.createOne}
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function LoginModalEmailForm({
  copy,
  locale,
  emailRef,
  onSuccess,
}: {
  copy: LoginCopy;
  locale: string;
  emailRef: React.RefObject<HTMLInputElement | null>;
  onSuccess: () => void;
}) {
  const [state, formAction, pending] = useActionState<SignInModalState, FormData>(
    signInWithEmailModal,
    null,
  );

  useEffect(() => {
    if (state?.ok) onSuccess();
  }, [state, onSuccess]);

  return (
    <form action={formAction} className="space-y-3.5">
      <input type="hidden" name="locale" value={locale} />

      {state && !state.ok ? (
        <p
          role="alert"
          className="rounded-xl px-3 py-2 text-[0.8125rem]"
          style={{
            background: "rgba(180, 35, 24, 0.08)",
            color: "#9b1c14",
            border: "1px solid rgba(180, 35, 24, 0.18)",
          }}
        >
          {state.error}
        </p>
      ) : null}

      <label className="block">
        <span
          className="mb-1.5 block text-[0.75rem] font-medium"
          style={{ color: "var(--plt-ink-soft)" }}
        >
          {copy.email}
        </span>
        <input
          ref={emailRef}
          type="email"
          name="email"
          autoComplete="email"
          required
          placeholder="you@studio.com"
          className="h-12 w-full rounded-xl border bg-[var(--plt-bg)] px-4 text-[0.9375rem] outline-none transition-colors focus:border-[var(--plt-forest)] placeholder:text-[var(--plt-muted-soft)]"
          style={{ borderColor: "var(--plt-hairline-strong)", color: "var(--plt-ink)" }}
        />
      </label>

      <label className="block">
        <span
          className="mb-1.5 flex items-center justify-between text-[0.75rem] font-medium"
          style={{ color: "var(--plt-ink-soft)" }}
        >
          {copy.password}
          <Link
            href="/forgot-password"
            className="font-normal underline underline-offset-2 transition-colors hover:text-[var(--plt-forest)]"
            style={{ color: "var(--plt-muted)" }}
          >
            {copy.forgot}
          </Link>
        </span>
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          required
          placeholder="••••••••"
          className="h-12 w-full rounded-xl border bg-[var(--plt-bg)] px-4 text-[0.9375rem] outline-none transition-colors focus:border-[var(--plt-forest)] placeholder:text-[var(--plt-muted-soft)]"
          style={{ borderColor: "var(--plt-hairline-strong)", color: "var(--plt-ink)" }}
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="group relative mt-1 inline-flex w-full items-center justify-center gap-2 rounded-full px-6 py-3 text-[0.9375rem] font-medium leading-none tracking-[-0.005em] transition-[background,transform,box-shadow] duration-200 disabled:cursor-wait disabled:opacity-80"
        style={{
          background: "var(--plt-forest)",
          color: "var(--plt-forest-on)",
          boxShadow: "var(--plt-shadow-forest)",
        }}
      >
        <span>{pending ? copy.submitting : copy.submit}</span>
        {pending ? <Spinner /> : <ArrowGlyph />}
      </button>
    </form>
  );
}

/**
 * Server-initiated Google popup, refreshing IN PLACE on success (no redirect
 * to the app host). Mirrors the talent modal's popup mechanics; the callback
 * postMessage's `destination` is intentionally ignored — we stay on the apex.
 */
function LoginModalGoogleButton({
  copy,
  onSuccess,
}: {
  copy: LoginCopy;
  onSuccess: () => void;
}) {
  const popupRef = useRef<Window | null>(null);
  const closeWatcherRef = useRef<number | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function handleMessage(event: MessageEvent<AuthPopupMessage>) {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== AUTH_POPUP_MESSAGE_TYPE) return;
      setPending(false);
      setError(event.data.success ? null : event.data.error ?? copy.googleFailed);
      if (closeWatcherRef.current) {
        window.clearInterval(closeWatcherRef.current);
        closeWatcherRef.current = null;
      }
      popupRef.current?.close();
      popupRef.current = null;
      if (event.data.success) onSuccess();
    }
    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
      if (closeWatcherRef.current) window.clearInterval(closeWatcherRef.current);
    };
  }, [copy.googleFailed, onSuccess]);

  function handleClick() {
    setError(null);
    const W = 520;
    const H = 640;
    const left = Math.max(window.screenX + (window.outerWidth - W) / 2, 0);
    const top = Math.max(window.screenY + (window.outerHeight - H) / 2, 0);
    const startUrl = new URL("/auth/google", window.location.origin);
    startUrl.searchParams.set("popup", "1");
    const popup = window.open(
      startUrl.toString(),
      "google-auth-popup",
      `width=${W},height=${H},left=${left},top=${top},popup=yes,resizable=yes,scrollbars=yes`,
    );
    if (!popup) {
      setError(copy.popupBlocked);
      return;
    }
    popupRef.current = popup;
    setPending(true);
    closeWatcherRef.current = window.setInterval(() => {
      if (!popupRef.current || popupRef.current.closed) {
        if (closeWatcherRef.current) {
          window.clearInterval(closeWatcherRef.current);
          closeWatcherRef.current = null;
        }
        popupRef.current = null;
        setPending(false);
      }
    }, 500);
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="group inline-flex w-full items-center justify-center gap-2.5 rounded-full px-5 py-3 text-[0.9375rem] font-medium leading-none tracking-[-0.005em] transition-[background,border-color,box-shadow] duration-200 disabled:cursor-wait disabled:opacity-70"
        style={{
          background: "var(--plt-bg-raised)",
          border: "1px solid var(--plt-hairline-strong)",
          color: "var(--plt-ink)",
        }}
      >
        {pending ? <Spinner /> : <GoogleGlyph />}
        <span>{pending ? copy.googleOpening : copy.google}</span>
      </button>
      {error ? (
        <p
          className="rounded-xl px-3 py-2 text-[0.75rem]"
          style={{
            background: "rgba(180, 35, 24, 0.08)",
            color: "#9b1c14",
            border: "1px solid rgba(180, 35, 24, 0.18)",
          }}
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
