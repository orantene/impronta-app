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

import { withLocaleHref } from "@/i18n/pathnames";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { signUpWithEmail, type AuthActionState } from "@/app/auth/actions";
import {
  requestTenantRegistration,
  type RequestTenantRegistrationState,
} from "@/app/onboarding/actions";
import {
  AUTH_POPUP_MESSAGE_TYPE,
  type AuthPopupMessage,
  navigateToAuthPopupDestination,
} from "@/lib/auth-popup";
import { getAppUrl } from "@/lib/auth-flow";
import {
  getTalentModalCopy,
  type TalentModalCopy,
} from "./talent-register-modal-copy";
import {
  AuthDivider,
  AuthFieldShell,
  AuthGoogleButtonSurface,
  AuthNotice,
  AuthSubmitButton,
} from "@/components/auth/auth-ui";
import {
  ArrowGlyph,
  CloseGlyph,
  MailGlyph,
  Spinner,
  TrustTick,
} from "./talent-register-modal-glyphs";

export const TALENT_MODAL_EVENT = "tulala:open-talent-modal" as const;

/**
 * Tenant Registration Engine re-uses this modal. A tenant storefront mounts
 * `<TenantRegisterModalHost tenant={...}>`, which opens the modal in response to
 * this event (dispatched by `OpenTenantRegisterButton`). Kept distinct from
 * `TALENT_MODAL_EVENT` so a tenant page can host both the platform signup and
 * the workspace-scoped join CTA without cross-firing. When `tenant` is passed,
 * the modal re-themes to the storefront, scopes signup to `/<slug>/talent`, and
 * offers a one-tap apply to already-signed-in talent.
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
  /** True when the workspace is on a whitelabel plan tier (Agency / Network).
   *  When set, the modal's platform-account copy swaps "Tulala" for the
   *  workspace's own name so the join flow reads as fully the agency's. */
  whitelabel?: boolean;
};

/** The platform-account word shown in a tenant-branded register modal: the
 *  workspace's own name on a whitelabel tier, otherwise "Tulala" (everyone
 *  registers on the Tulala platform by default). */
function brandWord(tenant: TenantRegisterContext): string {
  return tenant.whitelabel ? tenant.displayName : "Tulala";
}

const DEFAULT_NEXT_PATH = "/onboarding/talent-location";

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
  /** When present, render the tenant-branded variant scoped to this workspace. */
  tenant?: TenantRegisterContext;
  /** Active locale. Drives the copy AND the `locale` stamped on the new
   *  account — this used to be hardcoded "en", so a Spanish visitor who
   *  signed up here was silently registered as an English user. */
  locale?: string;
}

export function TalentRegisterModal({
  onClose,
  tenant,
  locale = "en",
}: TalentRegisterModalProps) {
  const t = getTalentModalCopy(locale);
  const [mounted, setMounted] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const emailRef = useRef<HTMLInputElement | null>(null);

  // Tenant registrations scope post-signup to /<slug>/talent so the workspace
  // join policy applies; the platform signup keeps its onboarding destination.
  const nextPath = tenant ? `/${tenant.slug}/talent` : DEFAULT_NEXT_PATH;
  // An already-signed-in Tulala talent skips signup and applies in one tap.
  const applyMode = Boolean(tenant?.isAuthedTalent);
  const header = headerCopy(tenant, applyMode, t);

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
    <div
      className="tlmodal-root"
      data-platform-surface="marketing"
      style={tenant ? TENANT_THEME_VARS : undefined}
    >
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
            aria-label={t.close}
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

          {/* Header */}
          <div className="mb-7">
            <p
              className="plt-mono text-[0.625rem] font-semibold uppercase tracking-[0.22em]"
              style={{ color: "var(--plt-forest)" }}
            >
              {header.eyebrow}
            </p>
            <h2
              id="talent-modal-title"
              className="plt-display mt-2 text-[1.625rem] font-semibold leading-[1.15] tracking-[-0.02em]"
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

          {/* Body — signed-in talent applies in one tap; everyone else signs up. */}
          {applyMode && tenant ? (
            <TenantApplyPanel tenant={tenant} onClose={onClose} t={t} />
          ) : (
            <ModalForm onSuccessClose={onClose} next={nextPath} t={t} locale={locale} />
          )}

          {/* Trust strip + sign-in footer — signup form only, not the apply panel */}
          {!applyMode ? (
            <>
              <ul
                className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[0.75rem]"
                style={{ color: "var(--plt-muted)" }}
              >
                <li className="inline-flex items-center gap-1.5">
                  <TrustTick /> {t.trustFree}
                </li>
                <li className="inline-flex items-center gap-1.5">
                  <TrustTick /> {t.trustNoCard}
                </li>
                <li className="inline-flex items-center gap-1.5">
                  <TrustTick /> {t.trustSetup}
                </li>
              </ul>

              <p
                className="mt-5 text-center text-[0.8125rem]"
                style={{ color: "var(--plt-muted)" }}
              >
                {tenant
                  ? t.haveTenantAccount(brandWord(tenant))
                  : t.haveAccount}
                {tenant ? (
                  <a
                    href={
                      tenant.ssoSignInUrl ??
                      `${getAppUrl()}/login?next=${encodeURIComponent(
                        `/${tenant.slug}/talent?register=1`,
                      )}`
                    }
                    onClick={onClose}
                    className="font-medium underline underline-offset-4 transition-colors hover:text-[var(--plt-forest)]"
                    style={{ color: "var(--plt-ink-soft)" }}
                  >
                    {t.signInToApply}
                  </a>
                ) : (
                  <Link
                    href={withLocaleHref("/login", locale)}
                    onClick={onClose}
                    className="font-medium underline underline-offset-4 transition-colors hover:text-[var(--plt-forest)]"
                    style={{ color: "var(--plt-ink-soft)" }}
                  >
                    {t.signIn}
                  </Link>
                )}
              </p>
            </>
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ───────────────────────── Tenant variant ───────────────────────── */

function headerCopy(
  tenant: TenantRegisterContext | undefined,
  applyMode: boolean,
  t: TalentModalCopy,
): { eyebrow: string; title: string; titleAccent: string; sub: string } {
  if (tenant) {
    return {
      eyebrow: t.joinRoster,
      title: applyMode ? t.applyTo : t.join,
      titleAccent: `${tenant.displayName}.`,
      sub: applyMode
        ? t.applySignedIn(brandWord(tenant))
        : t.joinSub(brandWord(tenant)),
    };
  }
  return {
    eyebrow: t.platformEyebrow,
    title: t.platformTitle,
    titleAccent: t.platformAccent,
    sub: t.platformSub,
  };
}

/** Workspace brand lockup shown atop the tenant-branded variant. */
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

/**
 * One-tap apply for a visitor who is already a signed-in Tulala talent. Sends
 * the join request via `requestTenantRegistration`; the outcome — "active"
 * (joined) or "pending" (awaiting the workspace's approval) — is shown inline.
 */
function TenantApplyPanel({
  tenant,
  onClose,
  t,
}: {
  tenant: TenantRegisterContext;
  onClose: () => void;
  t: TalentModalCopy;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<"active" | "pending" | null>(null);

  function apply() {
    setError(null);
    startTransition(async () => {
      const res: RequestTenantRegistrationState =
        await requestTenantRegistration(tenant.slug);
      if (res.ok) setDone(res.status);
      else setError(res.error);
    });
  }

  if (done) {
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
            {done === "active" ? t.joined(tenant.displayName) : t.requestSent}
          </h3>
          <p
            className="text-[0.875rem] leading-[1.5]"
            style={{ color: "var(--plt-muted)" }}
          >
            {done === "active"
              ? t.joinedSub(brandWord(tenant))
              : t.requestSentSub(tenant.displayName)}
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
          {t.gotIt}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3.5">
      {error ? (
        <p
          className="rounded-xl px-3 py-2 text-[0.8125rem]"
          style={{
            background: "rgba(180, 35, 24, 0.08)",
            color: "#9b1c14",
            border: "1px solid rgba(180, 35, 24, 0.18)",
          }}
        >
          {error}
        </p>
      ) : null}
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
        <span>
          {pending ? t.sendingRequest : t.applyCta(tenant.displayName)}
        </span>
        {pending ? <Spinner /> : <ArrowGlyph />}
      </button>
      <p
        className="text-center text-[0.75rem]"
        style={{ color: "var(--plt-muted)" }}
      >
        {t.applyingAs(brandWord(tenant))}
      </p>
    </div>
  );
}

/**
 * Inner form. Pulled out so React doesn't lose `useActionState` state when
 * the parent re-renders on every keystroke (it doesn't here, but keeps the
 * boundaries tidy).
 */
function ModalForm({
  onSuccessClose,
  next,
  t,
  locale,
}: {
  onSuccessClose: () => void;
  next: string;
  t: TalentModalCopy;
  locale: string;
}) {
  const [state, formAction, pending] = useActionState<
    AuthActionState,
    FormData
  >(signUpWithEmail, undefined);

  // If we got a confirmation message back, show the success view instead.
  if (state?.message) {
    return <ConfirmationView message={state.message} onClose={onSuccessClose} t={t} />;
  }

  return (
    <form action={formAction} className="space-y-3.5">
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="locale" value={locale} />

      {/* Google */}
      <GoogleButton next={next} t={t} />

      {/* OR */}
      <AuthDivider label={t.orEmail} className="py-1" />

      {state?.error ? <AuthNotice tone="error">{state.error}</AuthNotice> : null}

      <AuthFieldShell label={t.email}>
        <input
          type="email"
          name="email"
          autoComplete="email"
          required
          placeholder={t.emailPlaceholder}
          className="w-full bg-transparent text-[0.9375rem] leading-none outline-none placeholder:text-[var(--plt-muted-soft)]"
          style={{ color: "var(--plt-ink)" }}
        />
      </AuthFieldShell>

      <AuthFieldShell label={t.password} hint={t.passwordHint}>
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
      </AuthFieldShell>

      <AuthSubmitButton pending={pending} idle={t.createCta} busy={t.creating} />
    </form>
  );
}

function GoogleButton({ next, t }: { next: string; t: TalentModalCopy }) {
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
      setError(event.data.success ? null : event.data.error ?? t.googleFailed);
      if (closeWatcherRef.current) {
        window.clearInterval(closeWatcherRef.current);
        closeWatcherRef.current = null;
      }
      popupRef.current?.close();
      popupRef.current = null;
      if (event.data.success) {
        navigateToAuthPopupDestination(event.data.destination ?? next, router);
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
  }, [router, next, t]);

  function handleClick() {
    setError(null);
    const W = 520;
    const H = 640;
    const left = Math.max(window.screenX + (window.outerWidth - W) / 2, 0);
    const top = Math.max(window.screenY + (window.outerHeight - H) / 2, 0);
    const startUrl = new URL("/auth/google", window.location.origin);
    startUrl.searchParams.set("popup", "1");
    startUrl.searchParams.set("next", next);
    const popup = window.open(
      startUrl.toString(),
      "google-auth-popup",
      `width=${W},height=${H},left=${left},top=${top},popup=yes,resizable=yes,scrollbars=yes`,
    );
    if (!popup) {
      setError(t.popupBlocked);
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
    <AuthGoogleButtonSurface
      pending={pending}
      label={t.google}
      pendingLabel={t.googleOpening}
      error={error}
      onClick={handleClick}
    />
  );
}

function ConfirmationView({
  message,
  onClose,
  t,
}: {
  message: string;
  onClose: () => void;
  t: TalentModalCopy;
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
          {t.checkInbox}
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
