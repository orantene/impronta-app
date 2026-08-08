/**
 * Auth Shell v2 — the shared visual language for every (auth) route.
 *
 * WHY this module exists: the standalone auth pages and the marketing
 * get-started / sign-in MODAL were two different designs. The modal
 * (`components/marketing/login-modal.tsx`, `talent-register-modal-parts.tsx`)
 * is the design the owner signed off on; `/register`, `/forgot-password`,
 * `/update-password`, `/talent/register`, `/client/register` were still
 * rendering bare shadcn semantics (`text-muted-foreground`, `bg-card`,
 * `border-input`) on a `site-theme-platform` surface, which is the documented
 * white-on-white trap AND looked like an unstyled form.
 *
 * Everything here is deliberately a byte-for-byte match of the modal's
 * measurements so the popup and the standalone pages read as one product:
 *
 *   card      rounded-[28px] · p-7 sm:p-9 · --plt-bg-elevated · hairline-strong
 *   input     h-12 · rounded-2xl · 0.9375rem · 3px forest focus ring
 *   primary   rounded-full · py-3 · --plt-forest on --plt-forest-on
 *   divider   hairline rule + plt-mono 0.625rem uppercase 0.22em
 *
 * No hooks and no `"use client"`: both server pages and client forms import
 * from here (a client form that imports it just bundles it client-side).
 */

import type { CSSProperties, ReactNode } from "react";

/* ─────────────────────────── card + headings ─────────────────────────── */

/**
 * The elevated form card. Same geometry as the marketing modal dialog, one
 * step softer on the shadow because a page card is not floating over a
 * scrim.
 */
export function AuthCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-[28px] p-7 sm:p-9 ${className}`}
      style={{
        background: "var(--plt-bg-elevated)",
        border: "1px solid var(--plt-hairline-strong)",
        boxShadow:
          "0 24px 60px -28px rgba(15,23,20,0.32), 0 2px 6px -2px rgba(15,23,20,0.06)",
      }}
    >
      {children}
    </div>
  );
}

/**
 * Eyebrow + headline + description above the card. Every route keeps its own
 * headline/description copy (including the claim + invite variants) and just
 * passes it here.
 */
export function AuthHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="mb-6 text-center sm:mb-7">
      {eyebrow ? (
        <p
          className="plt-mono text-[0.625rem] font-semibold uppercase tracking-[0.22em]"
          style={{ color: "var(--plt-forest)" }}
        >
          {eyebrow}
        </p>
      ) : null}
      <h1
        className="plt-display mt-2 text-[1.75rem] font-semibold leading-[1.15] tracking-[-0.02em] sm:text-[2rem]"
        style={{ color: "var(--plt-ink)" }}
      >
        {title}
      </h1>
      {description ? (
        <p
          className="mx-auto mt-2.5 max-w-[380px] text-[0.9375rem] leading-[1.55]"
          style={{ color: "var(--plt-muted)" }}
        >
          {description}
        </p>
      ) : null}
    </div>
  );
}

/** The "or" rule between the Google button and the email form. */
export function AuthDivider({ label }: { label: string }) {
  return (
    <div className="my-4 flex items-center gap-3">
      <div className="h-px flex-1" style={{ background: "var(--plt-hairline)" }} />
      <span
        className="plt-mono text-[0.625rem] font-medium uppercase tracking-[0.22em]"
        style={{ color: "var(--plt-muted)" }}
      >
        {label}
      </span>
      <div className="h-px flex-1" style={{ background: "var(--plt-hairline)" }} />
    </div>
  );
}

/* ───────────────────────────── notices ──────────────────────────────── */

type NoticeTone = "error" | "info" | "success";

const NOTICE_STYLES: Record<NoticeTone, CSSProperties> = {
  error: {
    background: "rgba(180, 35, 24, 0.08)",
    color: "#9b1c14",
    border: "1px solid rgba(180, 35, 24, 0.18)",
  },
  info: {
    background: "rgba(15, 23, 20, 0.05)",
    color: "var(--plt-ink-soft)",
    border: "1px solid var(--plt-hairline-strong)",
  },
  success: {
    background: "color-mix(in srgb, var(--plt-forest) 8%, transparent)",
    color: "var(--plt-ink)",
    border: "1px solid color-mix(in srgb, var(--plt-forest) 22%, transparent)",
  },
};

/** One styled notice for every auth error / status line. */
export function AuthNotice({
  tone,
  children,
  align = "left",
  className = "",
}: {
  tone: NoticeTone;
  children: ReactNode;
  align?: "left" | "center";
  className?: string;
}) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-xl px-3 py-2 text-[0.8125rem] leading-[1.5] ${
        align === "center" ? "text-center" : ""
      } ${className}`}
      style={NOTICE_STYLES[tone]}
    >
      {children}
    </p>
  );
}

/* ───────────────────────────── fields ──────────────────────────────── */

export const AUTH_INPUT_CLASS =
  "flex h-12 w-full rounded-2xl px-4 text-[0.9375rem] leading-none outline-none transition-[border-color,box-shadow] placeholder:text-[var(--plt-muted-soft)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--plt-forest)_18%,transparent)]";

export const AUTH_INPUT_STYLE: CSSProperties = {
  backgroundColor: "var(--plt-bg)",
  border: "1px solid var(--plt-hairline-strong)",
  color: "var(--plt-ink)",
};

/** Label row (+ optional right-hand slot, e.g. "Forgot password?") + control. */
export function AuthField({
  label,
  htmlFor,
  rightSlot,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  rightSlot?: ReactNode;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label
          htmlFor={htmlFor}
          className="plt-mono block text-[0.6875rem] font-semibold uppercase tracking-[0.16em]"
          style={{ color: "var(--plt-muted)" }}
        >
          {label}
        </label>
        {rightSlot}
      </div>
      {children}
      {hint ? (
        <p
          className="mt-1.5 text-[0.75rem] leading-[1.45]"
          style={{ color: "var(--plt-muted)" }}
        >
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/* ───────────────────────────── buttons ─────────────────────────────── */

/** Full-width forest primary — identical to the modal's submit button. */
export function AuthSubmitButton({
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
      aria-busy={pending}
      className="group mt-1 inline-flex w-full items-center justify-center gap-2 rounded-full px-6 py-3 text-[0.9375rem] font-medium leading-none tracking-[-0.005em] transition-[background,transform,box-shadow] duration-200 disabled:cursor-wait disabled:opacity-80"
      style={{
        background: "var(--plt-forest)",
        color: "var(--plt-forest-on)",
        boxShadow: "var(--plt-shadow-forest)",
      }}
    >
      <span>{pending ? busy : idle}</span>
      {pending ? <AuthSpinner /> : <AuthArrowGlyph />}
    </button>
  );
}

/* ───────────────────────────── glyphs ─────────────────────────────── */

export function AuthArrowGlyph() {
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

export function AuthSpinner() {
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
