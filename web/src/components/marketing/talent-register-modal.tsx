"use client";

/**
 * Talent Registration Modal — branded, premium signup card.
 *
 * Cross-component trigger: any client component can call
 * `window.dispatchEvent(new CustomEvent(TALENT_MODAL_EVENT))` or render a
 * `<TalentModalTrigger>` to open the modal that lives in the header.
 *
 * Design notes:
 * - Uses Tulala platform tokens (`--plt-*`) so it sits inside the marketing
 *   site without theme jarring.
 * - Portals to `document.body` so the header's `backdrop-filter` doesn't
 *   create a containing block that breaks fixed positioning.
 * - Wraps the existing `signUpWithEmail` server action — no duplicated
 *   auth logic. Post-signup destination defaults to `/onboarding/talent-location`
 *   so the role-selection step is bypassed.
 */

import { useActionState, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { signUpWithEmail, type AuthActionState } from "@/app/auth/actions";
import { AUTH_POPUP_MESSAGE_TYPE, type AuthPopupMessage } from "@/lib/auth-popup";

export const TALENT_MODAL_EVENT = "tulala:open-talent-modal" as const;

/**
 * Tenant Registration Engine re-uses this modal. `tenant-register-modal-host.tsx`
 * imports these symbols, but the change that added the host landed without them,
 * which breaks the Turbopack production build (a missing named export is fatal,
 * unlike a webpack-dev warning). Defined here so the build resolves. The talent
 * flow ignores `tenant`; the full tenant-branded apply step ships with the
 * registration engine.
 */
export const TENANT_REGISTER_MODAL_EVENT =
  "tulala:open-tenant-register-modal" as const;

export type TenantRegisterContext = {
  slug: string;
  displayName: string;
  logoSvg: string | null;
  ctaLabel?: string;
  isAuthedTalent: boolean;
  ssoSignInUrl?: string;
};

const DEFAULT_NEXT_PATH = "/onboarding/talent-location";

/** Render a button that opens the talent register modal from anywhere. */
export function TalentModalTrigger({
  children,
  className,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <button
      type="button"
      className={className}
      style={style}
      onClick={() =>
        window.dispatchEvent(new CustomEvent(TALENT_MODAL_EVENT))
      }
    >
      {children}
    </button>
  );
}

interface TalentRegisterModalProps {
  onClose: () => void;
  /** Tenant-branded context (Tenant Registration Engine). Optional and currently
   *  ignored by the talent flow; accepted so the storefront host can pass it. */
  tenant?: TenantRegisterContext;
}

export function TalentRegisterModal({ onClose }: TalentRegisterModalProps) {
  const [mounted, setMounted] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const emailRef = useRef<HTMLInputElement | null>(null);

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
    // Defer focus a tick so the field is mounted.
    const t = window.setTimeout(() => emailRef.current?.focus(), 60);
    return () => {
      document.removeEventListener("keydown", handleKey);
      window.clearTimeout(t);
    };
  }, [onClose]);

  if (!mounted) return null;

  // Portal out of the header so backdrop-filter doesn't break fixed positioning.
  // `data-platform-surface="marketing"` re-scopes the `--plt-*` / `--tl-*`
  // tokens to this subtree, since portaling escapes the marketing layout
  // wrapper that normally defines them.
  return createPortal(
    <div className="tlmodal-root" data-platform-surface="marketing">
      {/* ── Backdrop ── */}
      <div
        className="fixed inset-0 z-[200] bg-[rgba(15,23,20,0.55)] backdrop-blur-sm"
        aria-hidden="true"
        onClick={onClose}
      />

      {/* ── Dialog wrapper centers the card on all viewports ── */}
      <div
        className="fixed inset-0 z-[201] flex items-center justify-center overflow-y-auto p-4 sm:p-8"
        role="presentation"
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="talent-modal-title"
          className="relative w-full max-w-[440px] rounded-[28px] p-7 sm:p-9 tlmodal-card"
          style={{
            background: "var(--plt-bg-elevated)",
            border: "1px solid var(--plt-hairline-strong)",
            boxShadow:
              "0 30px 80px -30px rgba(15,23,20,0.45), 0 2px 8px -2px rgba(15,23,20,0.08)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close button */}
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

          {/* Header */}
          <div className="mb-7">
            <p
              className="plt-mono text-[0.625rem] font-semibold uppercase tracking-[0.22em]"
              style={{ color: "var(--plt-forest)" }}
            >
              Join as talent · free
            </p>
            <h2
              id="talent-modal-title"
              className="plt-display mt-2 text-[1.625rem] font-semibold leading-[1.15] tracking-[-0.02em]"
              style={{ color: "var(--plt-ink)" }}
            >
              Your talent page,{" "}
              <span style={{ color: "var(--plt-forest)" }}>live in minutes.</span>
            </h2>
            <p
              className="mt-2 text-[0.875rem] leading-[1.5]"
              style={{ color: "var(--plt-muted)" }}
            >
              Show your work, share one link, and let bookings come to you.
            </p>
          </div>

          {/* Body */}
          <ModalForm onSuccessClose={onClose} />

          {/* Trust strip */}
          <ul
            className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[0.75rem]"
            style={{ color: "var(--plt-muted)" }}
          >
            <li className="inline-flex items-center gap-1.5">
              <TrustTick /> Free forever
            </li>
            <li className="inline-flex items-center gap-1.5">
              <TrustTick /> No credit card
            </li>
            <li className="inline-flex items-center gap-1.5">
              <TrustTick /> 2-min setup
            </li>
          </ul>

          {/* Footer link */}
          <p
            className="mt-5 text-center text-[0.8125rem]"
            style={{ color: "var(--plt-muted)" }}
          >
            Already have an account?{" "}
            <Link
              href="/login"
              onClick={onClose}
              className="font-medium underline underline-offset-4 transition-colors hover:text-[var(--plt-forest)]"
              style={{ color: "var(--plt-ink-soft)" }}
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
}

/**
 * Inner form. Pulled out so React doesn't lose `useActionState` state when
 * the parent re-renders on every keystroke (it doesn't here, but keeps the
 * boundaries tidy).
 */
function ModalForm({ onSuccessClose }: { onSuccessClose: () => void }) {
  const [state, formAction, pending] = useActionState<
    AuthActionState,
    FormData
  >(signUpWithEmail, undefined);

  // If we got a confirmation message back, show the success view instead.
  if (state?.message) {
    return <ConfirmationView message={state.message} onClose={onSuccessClose} />;
  }

  return (
    <form action={formAction} className="space-y-3.5">
      <input type="hidden" name="next" value={DEFAULT_NEXT_PATH} />
      <input type="hidden" name="locale" value="en" />

      {/* Google */}
      <GoogleButton />

      {/* OR */}
      <div className="flex items-center gap-3 py-1">
        <div
          className="h-px flex-1"
          style={{ background: "var(--plt-hairline)" }}
        />
        <span
          className="plt-mono text-[0.625rem] font-medium uppercase tracking-[0.22em]"
          style={{ color: "var(--plt-muted)" }}
        >
          or with email
        </span>
        <div
          className="h-px flex-1"
          style={{ background: "var(--plt-hairline)" }}
        />
      </div>

      {state?.error ? (
        <p
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

      <FieldShell label="Email">
        <input
          type="email"
          name="email"
          autoComplete="email"
          required
          placeholder="you@studio.com"
          className="w-full bg-transparent text-[0.9375rem] leading-none outline-none placeholder:text-[var(--plt-muted-soft)]"
          style={{ color: "var(--plt-ink)" }}
        />
      </FieldShell>

      <FieldShell label="Password" hint="At least 8 characters">
        <input
          type="password"
          name="password"
          autoComplete="new-password"
          required
          minLength={8}
          placeholder="••••••••"
          className="w-full bg-transparent text-[0.9375rem] leading-none outline-none placeholder:text-[var(--plt-muted-soft)]"
          style={{ color: "var(--plt-ink)" }}
        />
      </FieldShell>

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
        <span>{pending ? "Creating your account…" : "Create my talent page"}</span>
        {!pending ? <ArrowGlyph /> : <Spinner />}
      </button>
    </form>
  );
}

function GoogleButton() {
  const router = useRouter();
  const popupRef = useRef<Window | null>(null);
  const closeWatcherRef = useRef<number | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function handleMessage(event: MessageEvent<AuthPopupMessage>) {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== AUTH_POPUP_MESSAGE_TYPE) return;
      setPending(false);
      setError(event.data.success ? null : event.data.error ?? "Google sign-in failed.");
      if (closeWatcherRef.current) {
        window.clearInterval(closeWatcherRef.current);
        closeWatcherRef.current = null;
      }
      popupRef.current?.close();
      popupRef.current = null;
      if (event.data.success) {
        router.push(event.data.destination ?? DEFAULT_NEXT_PATH);
        router.refresh();
      }
    }
    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
      if (closeWatcherRef.current) {
        window.clearInterval(closeWatcherRef.current);
      }
    };
  }, [router]);

  function handleClick() {
    setError(null);
    const W = 520;
    const H = 640;
    const left = Math.max(window.screenX + (window.outerWidth - W) / 2, 0);
    const top = Math.max(window.screenY + (window.outerHeight - H) / 2, 0);
    const startUrl = new URL("/auth/google", window.location.origin);
    startUrl.searchParams.set("popup", "1");
    startUrl.searchParams.set("next", DEFAULT_NEXT_PATH);
    const popup = window.open(
      startUrl.toString(),
      "google-auth-popup",
      `width=${W},height=${H},left=${left},top=${top},popup=yes,resizable=yes,scrollbars=yes`,
    );
    if (!popup) {
      setError("Popup blocked. Allow popups and try again.");
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
        <span>{pending ? "Opening Google…" : "Continue with Google"}</span>
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

function ConfirmationView({
  message,
  onClose,
}: {
  message: string;
  onClose: () => void;
}) {
  return (
    <div className="space-y-5 py-2 text-center">
      <div
        className="mx-auto flex h-14 w-14 items-center justify-center rounded-full"
        style={{
          background: "color-mix(in srgb, var(--plt-forest) 12%, transparent)",
          color: "var(--plt-forest)",
        }}
      >
        <MailGlyph />
      </div>
      <div className="space-y-1.5">
        <h3
          className="plt-display text-[1.125rem] font-semibold"
          style={{ color: "var(--plt-ink)" }}
        >
          Check your inbox
        </h3>
        <p
          className="text-[0.875rem] leading-[1.5]"
          style={{ color: "var(--plt-muted)" }}
        >
          {message}
        </p>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="inline-flex items-center justify-center rounded-full border px-5 py-2.5 text-[0.8125rem] font-medium transition-colors"
        style={{
          borderColor: "var(--plt-hairline-strong)",
          color: "var(--plt-ink)",
          background: "var(--plt-bg-raised)",
        }}
      >
        Got it
      </button>
    </div>
  );
}

/* ───────────────────────── Field shell ───────────────────────── */

function FieldShell({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span
        className="plt-mono mb-1.5 block text-[0.6875rem] font-semibold uppercase tracking-[0.16em]"
        style={{ color: "var(--plt-muted)" }}
      >
        {label}
      </span>
      <div
        className="flex h-12 items-center rounded-2xl px-4 transition-[border-color,box-shadow] focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--plt-forest)_18%,transparent)]"
        style={{
          background: "var(--plt-bg)",
          border: "1px solid var(--plt-hairline-strong)",
        }}
      >
        {children}
      </div>
      {hint ? (
        <span
          className="mt-1 block text-[0.6875rem]"
          style={{ color: "var(--plt-muted)" }}
        >
          {hint}
        </span>
      ) : null}
    </label>
  );
}

/* ───────────────────────── Glyphs ───────────────────────── */

function CloseGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M1 1L13 13M13 1L1 13"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

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

function GoogleGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.15-4.53H2.18v2.84A10.99 10.99 0 0 0 12 23Z"
        fill="#34A853"
      />
      <path
        d="M5.85 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18A10.99 10.99 0 0 0 1 12c0 1.78.43 3.47 1.18 4.93l3.67-2.83Z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A10.99 10.99 0 0 0 2.18 7.07l3.67 2.83C6.71 7.31 9.14 5.38 12 5.38Z"
        fill="#EA4335"
      />
    </svg>
  );
}

function MailGlyph() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="3"
        y="5"
        width="18"
        height="14"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M4 7l8 6 8-6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrustTick() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="6.25" stroke="var(--plt-forest)" strokeWidth="1.2" />
      <path
        d="M4.5 7.25L6.2 9L9.5 5.5"
        stroke="var(--plt-forest)"
        strokeWidth="1.4"
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
