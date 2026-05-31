"use client";

/**
 * Talent Registration Modal — branded, premium, fully in-place signup.
 *
 * Two surfaces, one component:
 *  - Marketing (default): Tulala-branded (`--plt-*`), opens on tulala.digital.
 *  - Tenant (when `tenant` is passed): re-themed to the workspace's storefront
 *    tokens + logo, opened on a tenant site. Registration is scoped to the
 *    tenant via `next=/<slug>/talent` so the join policy applies, and an
 *    "already have a Tulala account → apply" path uses the shared session.
 *
 * Flow (new person): Account → Profile → Success ("you're in" / "request sent").
 *
 * Leaf parts (GoogleButton, ConfirmationView, SubmitButton, ErrorNote, StepDot,
 * FieldShell) live in `./talent-register-modal-parts` to keep this file under
 * the 800-line cap. The tenant theme is applied by remapping the `--plt-*` vars
 * onto storefront `--token-color-*` tokens inline on the root.
 */

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";

import {
  signUpTalentInPlace,
  type TalentSignupInPlaceState,
} from "@/app/auth/actions";
import {
  completeTalentProfileInPlace,
  requestTenantRegistration,
  type TalentProfileInPlaceState,
} from "@/app/onboarding/actions";
import { getAppUrl } from "@/lib/auth-flow";
import {
  ArrowGlyph,
  CheckGlyph,
  CloseGlyph,
  MailGlyph,
  Spinner,
  TrustTick,
} from "./talent-register-modal-glyphs";
import {
  ConfirmationView,
  ErrorNote,
  FieldShell,
  GoogleButton,
  StepDot,
  SubmitButton,
} from "./talent-register-modal-parts";

export const TALENT_MODAL_EVENT = "tulala:open-talent-modal" as const;
/** Tenant storefronts open the engine via this event (carries no payload —
 *  the mounted host owns the tenant context). */
export const TENANT_REGISTER_MODAL_EVENT = "tulala:open-tenant-register" as const;

type Step = "apply" | "account" | "profile" | "success";

type RegistrationStatus = "active" | "pending";

/**
 * Tenant context for the branded variant. Resolved server-side and handed to
 * the mounted host. Absent → the modal renders its original marketing form.
 */
export type TenantRegisterContext = {
  slug: string;
  displayName: string;
  /** Sanitized brand-mark SVG markup, or null to show the name. */
  logoSvg?: string | null;
  ctaLabel: string;
  /** True when the current visitor is already a signed-in Tulala talent. */
  isAuthedTalent: boolean;
  /**
   * On a custom domain (host-only cookies), the "sign in to apply" link routes
   * through the SSO hand-off (/auth/sso/start) so the session lands on this
   * domain. Absent on *.tulala.digital subdomains, which share the session.
   */
  ssoSignInUrl?: string;
};

/** Re-theme the modal to a tenant storefront by remapping `--plt-*` onto the
 *  storefront's design tokens. Unmapped vars fall back to platform defaults. */
const TENANT_THEME_VARS: React.CSSProperties = {
  ["--plt-forest" as string]: "var(--token-color-primary, #0F4F3E)",
  ["--plt-forest-on" as string]: "#ffffff",
  ["--plt-shadow-forest" as string]: "0 14px 32px -16px rgba(0,0,0,0.4)",
  ["--plt-ink" as string]: "var(--token-color-ink, #0B0B0D)",
  ["--plt-ink-soft" as string]: "var(--token-color-neutral, #3f3f46)",
  ["--plt-muted" as string]: "var(--token-color-muted, #6b7280)",
  ["--plt-muted-soft" as string]: "var(--token-color-muted, #9ca3af)",
  ["--plt-bg" as string]: "var(--token-color-background, #ffffff)",
  ["--plt-bg-elevated" as string]: "var(--token-color-surface-raised, #ffffff)",
  ["--plt-bg-raised" as string]: "var(--token-color-surface-raised, #f4f4f5)",
  ["--plt-hairline" as string]: "var(--token-color-line, rgba(24,24,27,0.10))",
  ["--plt-hairline-strong" as string]: "var(--token-color-line, rgba(24,24,27,0.16))",
} as React.CSSProperties;

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
  /** When present, render the tenant-branded variant scoped to this workspace. */
  tenant?: TenantRegisterContext;
}

export function TalentRegisterModal({ onClose, tenant }: TalentRegisterModalProps) {
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState<Step>(
    tenant?.isAuthedTalent ? "apply" : "account",
  );
  const [dashboardUrl, setDashboardUrl] = useState<string>(
    `${getAppUrl()}/talent`,
  );
  const [status, setStatus] = useState<RegistrationStatus>("active");
  const dialogRef = useRef<HTMLDivElement | null>(null);

  // Tenant registrations scope to /<slug>/talent so the join policy applies.
  const nextPath = tenant ? `/${tenant.slug}/talent` : undefined;

  useEffect(() => setMounted(true), []);

  // Lock body scroll while open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Close on Escape — but not on the success screen.
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && step !== "success") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose, step]);

  if (!mounted) return null;

  const header = headerCopy(step, tenant);
  const rootStyle = tenant ? TENANT_THEME_VARS : undefined;

  function onProfileComplete(url: string, regStatus?: RegistrationStatus) {
    setDashboardUrl(url);
    if (regStatus) setStatus(regStatus);
    setStep("success");
  }

  return createPortal(
    <div className="tlmodal-root" data-platform-surface="marketing" style={rootStyle}>
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

          {/* Tenant brand lockup */}
          {tenant ? <TenantBrandMark tenant={tenant} /> : null}

          {/* Step header (hidden on the success screen, which has its own) */}
          {header ? (
            <div className="mb-7 pr-8">
              {/* Progress dots — only for the new-person two-step path */}
              {step === "account" || step === "profile" ? (
                <div className="mb-3 flex items-center gap-1.5">
                  <StepDot active={step === "account"} done={step !== "account"} />
                  <StepDot active={step === "profile"} done={false} />
                </div>
              ) : null}
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
                <span style={{ color: "var(--plt-forest)" }}>{header.titleAccent}</span>
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
          {step === "apply" && tenant ? (
            <ApplyStep
              tenant={tenant}
              onApplied={(s) => {
                setStatus(s);
                setStep("success");
              }}
              onUseNewAccount={() => setStep("account")}
            />
          ) : null}
          {step === "account" ? (
            <AccountStep next={nextPath} onCreated={() => setStep("profile")} />
          ) : null}
          {step === "profile" ? (
            <ProfileStep next={nextPath} onComplete={onProfileComplete} />
          ) : null}
          {step === "success" ? (
            <SuccessView dashboardUrl={dashboardUrl} tenant={tenant} status={status} />
          ) : null}

          {/* Trust strip — new-person account step only */}
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
                href={
                  tenant
                    ? tenant.ssoSignInUrl ??
                      `${getAppUrl()}/login?next=${encodeURIComponent(`/${tenant.slug}/talent?register=1`)}`
                    : `${getAppUrl()}/login`
                }
                onClick={onClose}
                className="font-medium underline underline-offset-4 transition-colors hover:text-[var(--plt-forest)]"
                style={{ color: "var(--plt-ink-soft)" }}
              >
                {tenant ? "Sign in to apply" : "Sign in"}
              </a>
            </p>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function headerCopy(
  step: Step,
  tenant?: TenantRegisterContext,
): { eyebrow: string; title: string; titleAccent: string; sub: string } | null {
  if (step === "success") return null;
  if (tenant) {
    if (step === "apply") {
      return {
        eyebrow: "Join the roster",
        title: "Apply to",
        titleAccent: tenant.displayName + ".",
        sub: "You're signed in to Tulala — send your request in one tap.",
      };
    }
    if (step === "profile") {
      return {
        eyebrow: "Step 2 of 2 · profile",
        title: "A few details to",
        titleAccent: "finish.",
        sub: "Just the essentials — add photos and availability next.",
      };
    }
    return {
      eyebrow: "Join the roster",
      title: "Join",
      titleAccent: tenant.displayName + ".",
      sub: "Create your free Tulala talent profile and request to join the roster.",
    };
  }
  if (step === "profile") {
    return {
      eyebrow: "Step 2 of 2 · profile",
      title: "A few details to",
      titleAccent: "finish your page.",
      sub: "Just the essentials — add photos, rates and availability next.",
    };
  }
  return {
    eyebrow: "Join as talent · free",
    title: "Your talent page,",
    titleAccent: "live in minutes.",
    sub: "Show your work, share one link, and let bookings come to you.",
  };
}

function TenantBrandMark({ tenant }: { tenant: TenantRegisterContext }) {
  return (
    <div className="mb-5 flex items-center gap-2.5">
      {tenant.logoSvg ? (
        <span
          aria-hidden
          className="inline-flex h-8 max-w-[140px] items-center [&>svg]:h-8 [&>svg]:w-auto"
          style={{ color: "var(--plt-ink)" }}
          dangerouslySetInnerHTML={{ __html: tenant.logoSvg }}
        />
      ) : (
        <span
          className="plt-display text-[1.05rem] font-semibold tracking-[-0.01em]"
          style={{ color: "var(--plt-ink)" }}
        >
          {tenant.displayName}
        </span>
      )}
    </div>
  );
}

/* ─────────────────── Tenant · Apply (signed-in talent) ─────────────────── */

function ApplyStep({
  tenant,
  onApplied,
  onUseNewAccount,
}: {
  tenant: TenantRegisterContext;
  onApplied: (status: RegistrationStatus) => void;
  onUseNewAccount: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function apply() {
    setError(null);
    startTransition(async () => {
      const res = await requestTenantRegistration(tenant.slug);
      if (res.ok) onApplied(res.status);
      else setError(res.error);
    });
  }

  return (
    <div className="space-y-3.5">
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      <button
        type="button"
        onClick={apply}
        disabled={pending}
        className="group relative inline-flex w-full items-center justify-center gap-2 rounded-full px-6 py-3 text-[0.9375rem] font-medium leading-none tracking-[-0.005em] transition-[background,transform,box-shadow] duration-200 disabled:cursor-wait disabled:opacity-80"
        style={{
          background: "var(--plt-forest)",
          color: "var(--plt-forest-on)",
          boxShadow: "var(--plt-shadow-forest)",
        }}
      >
        <span>{pending ? "Sending your request…" : `Apply to ${tenant.displayName}`}</span>
        {pending ? <Spinner /> : <ArrowGlyph />}
      </button>
      <button
        type="button"
        onClick={onUseNewAccount}
        className="block w-full text-center text-[0.8125rem] underline underline-offset-4 transition-colors hover:text-[var(--plt-forest)]"
        style={{ color: "var(--plt-muted)" }}
      >
        Register a new account instead
      </button>
    </div>
  );
}

/* ───────────────────────── Step 1 · Account ───────────────────────── */

function AccountStep({
  next,
  onCreated,
}: {
  next?: string;
  onCreated: () => void;
}) {
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
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <GoogleButton next={next} onAuthed={onCreated} />

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

function ProfileStep({
  next,
  onComplete,
}: {
  next?: string;
  onComplete: (url: string, status?: RegistrationStatus) => void;
}) {
  const [state, formAction, pending] = useActionState<
    TalentProfileInPlaceState,
    FormData
  >(completeTalentProfileInPlace, undefined);

  useEffect(() => {
    if (state && "ok" in state && state.ok) {
      onComplete(state.dashboardUrl, state.registration?.status);
    }
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
      {next ? <input type="hidden" name="next" value={next} /> : null}
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

function SuccessView({
  dashboardUrl,
  tenant,
  status,
}: {
  dashboardUrl: string;
  tenant?: TenantRegisterContext;
  status: RegistrationStatus;
}) {
  const pendingOnTenant = Boolean(tenant) && status === "pending";

  const title = !tenant
    ? "Your talent page is live."
    : pendingOnTenant
      ? "Request sent."
      : `You're on ${tenant.displayName}'s roster.`;

  const body = !tenant
    ? "Welcome to Tulala. Open your dashboard to add photos, set your rates, and share your link."
    : pendingOnTenant
      ? `${tenant.displayName} will review your request. Meanwhile, set up your Tulala profile.`
      : `Welcome to ${tenant.displayName}. Open your dashboard to add photos and availability.`;

  return (
    <div className="space-y-5 py-2 text-center">
      <div
        className="mx-auto flex h-14 w-14 items-center justify-center rounded-full"
        style={{
          background: "color-mix(in srgb, var(--plt-forest) 12%, transparent)",
          color: "var(--plt-forest)",
        }}
      >
        {pendingOnTenant ? <MailGlyph /> : <CheckGlyph />}
      </div>
      <div className="space-y-1.5">
        <h3
          id="talent-modal-title"
          className="plt-display text-[1.375rem] font-semibold"
          style={{ color: "var(--plt-ink)" }}
        >
          {title}
        </h3>
        <p
          className="mx-auto max-w-[320px] text-[0.875rem] leading-[1.5]"
          style={{ color: "var(--plt-muted)" }}
        >
          {body}
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
