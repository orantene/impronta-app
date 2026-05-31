"use client";

/**
 * Talent Registration Modal — branded, premium, fully in-place signup.
 *
 * Opens anywhere on the marketing site (header, hero, CTAs) via the
 * `TALENT_MODAL_EVENT` custom event, and completes the ENTIRE talent
 * registration without leaving tulala.digital:
 *   1. Account  — email + password (or Google), via `signUpTalentInPlace`.
 *   2. Profile  — name, phone, gender, DOB, via `completeTalentProfileInPlace`.
 *   3. Success  — "your page is live" → hands off to the app-host dashboard
 *                 (the session cookie is shared across the parent domain, so
 *                 they land logged-in).
 *
 * Design notes:
 * - Uses Tulala platform tokens (`--plt-*`) so it sits inside the marketing
 *   site without theme jarring.
 * - Portals to `document.body` so the header's `backdrop-filter` doesn't
 *   create a containing block that breaks fixed positioning.
 * - The two step actions never redirect; they return structured state so the
 *   modal drives its own transitions.
 */

import { useActionState, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

import {
  signUpTalentInPlace,
  type TalentSignupInPlaceState,
} from "@/app/auth/actions";
import {
  completeTalentProfileInPlace,
  type TalentProfileInPlaceState,
} from "@/app/onboarding/actions";
import { AUTH_POPUP_MESSAGE_TYPE, type AuthPopupMessage } from "@/lib/auth-popup";
import { getAppUrl } from "@/lib/auth-flow";
import { createClient } from "@/lib/supabase/client";
import { SUPABASE_ENV_HELP } from "@/lib/supabase/config";
import {
  ArrowGlyph,
  CheckGlyph,
  CloseGlyph,
  GoogleGlyph,
  MailGlyph,
  Spinner,
  TrustTick,
} from "./talent-register-modal-glyphs";

export const TALENT_MODAL_EVENT = "tulala:open-talent-modal" as const;

const OAUTH_NEXT_PATH = "/onboarding/talent-location";

type Step = "account" | "profile" | "success";

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
      onClick={() => window.dispatchEvent(new CustomEvent(TALENT_MODAL_EVENT))}
    >
      {children}
    </button>
  );
}

interface TalentRegisterModalProps {
  onClose: () => void;
}

export function TalentRegisterModal({ onClose }: TalentRegisterModalProps) {
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState<Step>("account");
  const [dashboardUrl, setDashboardUrl] = useState<string>(
    `${getAppUrl()}/talent`,
  );
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setMounted(true), []);

  // Lock body scroll while open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Close on Escape — but not on the success screen (avoid an accidental
  // dismissal right as the account is created).
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && step !== "success") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose, step]);

  if (!mounted) return null;

  const header = HEADER_COPY[step];

  return createPortal(
    <div className="tlmodal-root" data-platform-surface="marketing">
      {/* ── Backdrop ── */}
      <div
        className="fixed inset-0 z-[200] bg-[rgba(15,23,20,0.55)] backdrop-blur-sm"
        aria-hidden="true"
        onClick={step === "success" ? undefined : onClose}
      />

      {/* ── Dialog wrapper centers the card on all viewports ── */}
      <div
        className="fixed inset-0 z-[201] flex items-start justify-center overflow-y-auto p-4 py-8 sm:items-center sm:p-8"
        role="presentation"
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="talent-modal-title"
          className="relative w-full max-w-[460px] rounded-[28px] p-7 sm:p-9 tlmodal-card"
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

          {/* Step header (hidden on the success screen, which has its own) */}
          {header ? (
            <div className="mb-7 pr-8">
              {/* Two-step progress dots */}
              <div className="mb-3 flex items-center gap-1.5">
                <StepDot active={step === "account"} done={step !== "account"} />
                <StepDot active={step === "profile"} done={false} />
              </div>
              <p
                className="plt-mono text-[0.625rem] font-semibold uppercase tracking-[0.22em]"
                style={{ color: "var(--plt-forest)" }}
              >
                {header.eyebrow}
              </p>
              <h2
                id="talent-modal-title"
                className="plt-display mt-2 text-[1.5rem] font-semibold leading-[1.15] tracking-[-0.02em] sm:text-[1.625rem]"
                style={{ color: "var(--plt-ink)" }}
              >
                {header.title}{" "}
                <span style={{ color: "var(--plt-forest)" }}>
                  {header.titleAccent}
                </span>
              </h2>
              <p
                className="mt-2 text-[0.875rem] leading-[1.5]"
                style={{ color: "var(--plt-muted)" }}
              >
                {header.sub}
              </p>
            </div>
          ) : null}

          {/* Body */}
          {step === "account" ? (
            <AccountStep onCreated={() => setStep("profile")} />
          ) : null}
          {step === "profile" ? (
            <ProfileStep
              onComplete={(url) => {
                setDashboardUrl(url);
                setStep("success");
              }}
            />
          ) : null}
          {step === "success" ? (
            <SuccessView dashboardUrl={dashboardUrl} />
          ) : null}

          {/* Trust strip — account step only */}
          {step === "account" ? (
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
          ) : null}

          {/* Footer sign-in link — account step only */}
          {step === "account" ? (
            <p
              className="mt-5 text-center text-[0.8125rem]"
              style={{ color: "var(--plt-muted)" }}
            >
              Already have an account?{" "}
              <a
                href={`${getAppUrl()}/login`}
                onClick={onClose}
                className="font-medium underline underline-offset-4 transition-colors hover:text-[var(--plt-forest)]"
                style={{ color: "var(--plt-ink-soft)" }}
              >
                Sign in
              </a>
            </p>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}

const HEADER_COPY: Record<
  Step,
  { eyebrow: string; title: string; titleAccent: string; sub: string } | null
> = {
  account: {
    eyebrow: "Join as talent · free",
    title: "Your talent page,",
    titleAccent: "live in minutes.",
    sub: "Show your work, share one link, and let bookings come to you.",
  },
  profile: {
    eyebrow: "Step 2 of 2 · profile",
    title: "A few details to",
    titleAccent: "finish your page.",
    sub: "Just the essentials — add photos, rates and availability next.",
  },
  success: null,
};

/* ───────────────────────── Step 1 · Account ───────────────────────── */

function AccountStep({ onCreated }: { onCreated: () => void }) {
  const [state, formAction, pending] = useActionState<
    TalentSignupInPlaceState,
    FormData
  >(signUpTalentInPlace, undefined);

  useEffect(() => {
    if (state && "ok" in state && state.ok) onCreated();
  }, [state, onCreated]);

  if (state && "needsConfirmation" in state) {
    return <ConfirmationView message={state.needsConfirmation} />;
  }

  const error = state && "error" in state ? state.error : null;

  return (
    <form action={formAction} className="space-y-3.5">
      <GoogleButton onAuthed={onCreated} />

      {/* OR */}
      <div className="flex items-center gap-3 py-1">
        <div className="h-px flex-1" style={{ background: "var(--plt-hairline)" }} />
        <span
          className="plt-mono text-[0.625rem] font-medium uppercase tracking-[0.22em]"
          style={{ color: "var(--plt-muted)" }}
        >
          or with email
        </span>
        <div className="h-px flex-1" style={{ background: "var(--plt-hairline)" }} />
      </div>

      {error ? <ErrorNote>{error}</ErrorNote> : null}

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

      <SubmitButton pending={pending} idle="Create my account" busy="Creating your account…" />
    </form>
  );
}

/* ───────────────────────── Step 2 · Profile ───────────────────────── */

function ProfileStep({ onComplete }: { onComplete: (url: string) => void }) {
  const [state, formAction, pending] = useActionState<
    TalentProfileInPlaceState,
    FormData
  >(completeTalentProfileInPlace, undefined);

  useEffect(() => {
    if (state && "ok" in state && state.ok) onComplete(state.dashboardUrl);
  }, [state, onComplete]);

  const error = state && "error" in state ? state.error : null;

  // Max DOB = 16 years ago (mirrors the onboarding page guard).
  const maxDob = (() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 16);
    return d.toISOString().split("T")[0];
  })();

  return (
    <form action={formAction} className="space-y-3.5">
      {error ? <ErrorNote>{error}</ErrorNote> : null}

      <FieldShell label="Display name" hint="Shown publicly on your profile">
        <input
          type="text"
          name="display_name"
          required
          placeholder="e.g. Sofia M."
          className="w-full bg-transparent text-[0.9375rem] leading-none outline-none placeholder:text-[var(--plt-muted-soft)]"
          style={{ color: "var(--plt-ink)" }}
        />
      </FieldShell>

      <div className="grid grid-cols-2 gap-3">
        <FieldShell label="First name">
          <input
            type="text"
            name="first_name"
            autoComplete="given-name"
            required
            placeholder="Sofia"
            className="w-full bg-transparent text-[0.9375rem] leading-none outline-none placeholder:text-[var(--plt-muted-soft)]"
            style={{ color: "var(--plt-ink)" }}
          />
        </FieldShell>
        <FieldShell label="Last name">
          <input
            type="text"
            name="last_name"
            autoComplete="family-name"
            required
            placeholder="Martín"
            className="w-full bg-transparent text-[0.9375rem] leading-none outline-none placeholder:text-[var(--plt-muted-soft)]"
            style={{ color: "var(--plt-ink)" }}
          />
        </FieldShell>
      </div>

      <FieldShell label="Phone" hint="Used by agencies — never shown publicly">
        <input
          type="tel"
          name="phone"
          autoComplete="tel"
          required
          placeholder="+1 555 000 0000"
          className="w-full bg-transparent text-[0.9375rem] leading-none outline-none placeholder:text-[var(--plt-muted-soft)]"
          style={{ color: "var(--plt-ink)" }}
        />
      </FieldShell>

      <div className="grid grid-cols-2 gap-3">
        <FieldShell label="Gender">
          <select
            name="gender"
            required
            defaultValue=""
            className="w-full bg-transparent text-[0.9375rem] leading-none outline-none"
            style={{ color: "var(--plt-ink)" }}
          >
            <option value="" disabled>
              Select…
            </option>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="non_binary">Non-binary</option>
            <option value="prefer_not_to_say">Prefer not to say</option>
          </select>
        </FieldShell>
        <FieldShell label="Date of birth">
          <input
            type="date"
            name="date_of_birth"
            required
            max={maxDob}
            className="w-full bg-transparent text-[0.9375rem] leading-none outline-none"
            style={{ color: "var(--plt-ink)" }}
          />
        </FieldShell>
      </div>

      <SubmitButton pending={pending} idle="Create my page" busy="Creating your page…" />
    </form>
  );
}

/* ───────────────────────── Step 3 · Success ───────────────────────── */

function SuccessView({ dashboardUrl }: { dashboardUrl: string }) {
  return (
    <div className="space-y-5 py-2 text-center">
      <div
        className="mx-auto flex h-14 w-14 items-center justify-center rounded-full"
        style={{
          background: "color-mix(in srgb, var(--plt-forest) 12%, transparent)",
          color: "var(--plt-forest)",
        }}
      >
        <CheckGlyph />
      </div>
      <div className="space-y-1.5">
        <h3
          id="talent-modal-title"
          className="plt-display text-[1.375rem] font-semibold"
          style={{ color: "var(--plt-ink)" }}
        >
          Your talent page is live.
        </h3>
        <p
          className="mx-auto max-w-[320px] text-[0.875rem] leading-[1.5]"
          style={{ color: "var(--plt-muted)" }}
        >
          Welcome to Tulala. Open your dashboard to add photos, set your rates,
          and share your link.
        </p>
      </div>
      <a
        href={dashboardUrl}
        className="group inline-flex w-full items-center justify-center gap-2 rounded-full px-6 py-3 text-[0.9375rem] font-medium leading-none tracking-[-0.005em] transition-[background,transform,box-shadow] duration-200"
        style={{
          background: "var(--plt-forest)",
          color: "var(--plt-forest-on)",
          boxShadow: "var(--plt-shadow-forest)",
        }}
      >
        <span>Go to my dashboard</span>
        <ArrowGlyph />
      </a>
    </div>
  );
}

/* ───────────────────────── Google ───────────────────────── */

function GoogleButton({ onAuthed }: { onAuthed: () => void }) {
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
      setError(
        event.data.success ? null : event.data.error ?? "Google sign-in failed.",
      );
      if (closeWatcherRef.current) {
        window.clearInterval(closeWatcherRef.current);
        closeWatcherRef.current = null;
      }
      popupRef.current?.close();
      popupRef.current = null;
      if (event.data.success) {
        // Session is now shared across the parent domain — advance to the
        // in-place profile step rather than navigating away.
        router.refresh();
        onAuthed();
      }
    }
    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
      if (closeWatcherRef.current) {
        window.clearInterval(closeWatcherRef.current);
      }
    };
  }, [router, onAuthed]);

  async function handleClick() {
    setError(null);
    const supabase = createClient();
    if (!supabase) {
      setError(SUPABASE_ENV_HELP);
      return;
    }
    const W = 520;
    const H = 640;
    const left = Math.max(window.screenX + (window.outerWidth - W) / 2, 0);
    const top = Math.max(window.screenY + (window.outerHeight - H) / 2, 0);
    const popup = window.open(
      "",
      "google-auth-popup",
      `width=${W},height=${H},left=${left},top=${top},popup=yes,resizable=yes,scrollbars=yes`,
    );
    if (!popup) {
      setError("Popup blocked. Allow popups and try again.");
      return;
    }
    popupRef.current = popup;
    setPending(true);
    // The callback must run on the app host — /auth/callback isn't allowed on
    // the marketing host. The PKCE verifier cookie is shared across the parent
    // domain (see lib/supabase/client.ts), so the exchange succeeds there.
    const cb = new URL("/auth/callback", getAppUrl());
    cb.searchParams.set("popup", "1");
    cb.searchParams.set("next", OAUTH_NEXT_PATH);
    const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: cb.toString(), skipBrowserRedirect: true },
    });
    if (oauthError || !data?.url) {
      popup.close();
      popupRef.current = null;
      setPending(false);
      setError(oauthError?.message ?? "Unable to start Google sign-in.");
      return;
    }
    popup.location.href = data.url;
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
      {error ? <ErrorNote small>{error}</ErrorNote> : null}
    </div>
  );
}

function ConfirmationView({ message }: { message: string }) {
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
    </div>
  );
}

/* ───────────────────────── Shared bits ───────────────────────── */

function SubmitButton({
  pending,
  idle,
  busy,
}: {
  pending: boolean;
  idle: string;
  busy: string;
}) {
  return (
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
      <span>{pending ? busy : idle}</span>
      {pending ? <Spinner /> : <ArrowGlyph />}
    </button>
  );
}

function ErrorNote({
  children,
  small,
}: {
  children: React.ReactNode;
  small?: boolean;
}) {
  return (
    <p
      className={`rounded-xl px-3 py-2 ${small ? "text-[0.75rem]" : "text-[0.8125rem]"}`}
      style={{
        background: "rgba(180, 35, 24, 0.08)",
        color: "#9b1c14",
        border: "1px solid rgba(180, 35, 24, 0.18)",
      }}
    >
      {children}
    </p>
  );
}

function StepDot({ active, done }: { active: boolean; done: boolean }) {
  return (
    <span
      aria-hidden
      className="h-1.5 rounded-full transition-all duration-300"
      style={{
        width: active ? "1.5rem" : "0.375rem",
        background:
          active || done ? "var(--plt-forest)" : "var(--plt-hairline-strong)",
      }}
    />
  );
}

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

