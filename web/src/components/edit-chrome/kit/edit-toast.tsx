"use client";

/**
 * EditToast — the ONE floating-toast shell for edit chrome (W2-C2).
 *
 * Before this, the four transient toasts mounted in `edit-shell.tsx`
 * (DraftSaved, ClipboardAction, TemplateApplied, MutationError) each hand-rolled
 * the SAME fixed top-center chip: identical position, container, dismiss button,
 * check/close SVGs — differing only in tone and body. Four copies of one visual
 * meant four places to fix a spacing/z-index/close-affordance bug.
 *
 * This is the single presentational shell they now share. Callers pass a `tone`,
 * the body content, an optional `action`, and `onDismiss`; the shell owns the
 * position, the tone palette (drawn from the ONE token kit — cool blue for
 * attention, never gold/rust), the icon, and the dismiss control. The toast
 * LIFECYCLE (when to show, auto-dismiss timers, coalescing) stays in EditContext
 * — this is the view, not the queue.
 *
 * Not a replacement for SaveChip (that is a persistent status pill, not a
 * transient toast) — SaveChip stays as-is.
 */

import type { ReactNode } from "react";

import { CHROME, Z_INDEX } from "./tokens";

export type EditToastTone = "neutral" | "success" | "attention" | "error";

interface TonePalette {
  bg: string;
  border: string;
  text: string;
  icon: string;
}

/**
 * Tone → palette, read from the token kit. `attention`/`error` deliberately use
 * the cool blue / rose roles — the editor chrome never uses gold/rust (owner
 * rule; enforced by no-gold-rust-chrome.static.test.ts).
 */
export function editToastPalette(tone: EditToastTone): TonePalette {
  switch (tone) {
    case "success":
      return {
        bg: CHROME.greenBg,
        border: CHROME.greenLine,
        text: CHROME.green,
        icon: CHROME.green,
      };
    case "attention":
      return {
        bg: CHROME.blueBg,
        border: CHROME.blueLine,
        text: CHROME.blue,
        icon: CHROME.blue,
      };
    case "error":
      return {
        bg: CHROME.roseBg,
        border: CHROME.roseLine,
        text: CHROME.rose,
        icon: CHROME.rose,
      };
    case "neutral":
    default:
      return {
        bg: CHROME.surface,
        border: CHROME.line,
        text: CHROME.text2,
        icon: CHROME.muted,
      };
  }
}

export interface EditToastProps {
  tone?: EditToastTone;
  /** Leading icon; defaults to a checkmark. Pass `null` for no icon. */
  icon?: ReactNode;
  /** ARIA live-region role. status = polite, alert = assertive. */
  role?: "status" | "alert";
  /** data-edit-overlay hook for e2e / QA. */
  overlayId?: string;
  /** Optional trailing action (e.g. an Undo button). */
  action?: ReactNode;
  onDismiss?: () => void;
  /** Hide the dismiss (×) control (e.g. a toast that only auto-expires). */
  hideDismiss?: boolean;
  className?: string;
  children: ReactNode;
  /** Passthrough for tone-specific attributes (e.g. data-clipboard-action). */
  [dataAttr: `data-${string}`]: string | undefined;
}

const CheckIcon = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

/** Single floating-toast shell. See file header. */
export function EditToast({
  tone = "neutral",
  icon,
  role = "status",
  overlayId,
  action,
  onDismiss,
  hideDismiss = false,
  className,
  children,
  ...dataAttrs
}: EditToastProps) {
  const palette = editToastPalette(tone);
  const resolvedIcon = icon === undefined ? CheckIcon : icon;
  return (
    <div
      data-edit-overlay={overlayId}
      role={role}
      aria-live={role === "alert" ? "assertive" : "polite"}
      aria-atomic={role === "alert" ? "true" : undefined}
      className={`pointer-events-auto fixed left-1/2 top-[66px] flex -translate-x-1/2 items-start gap-2 rounded-md border px-3 py-2 text-xs font-medium shadow-lg ${className ?? ""}`}
      style={{
        zIndex: Z_INDEX.toast,
        background: palette.bg,
        borderColor: palette.border,
        color: palette.text,
      }}
      {...dataAttrs}
    >
      {resolvedIcon ? (
        <span
          className="mt-px inline-flex shrink-0"
          style={{ color: palette.icon }}
        >
          {resolvedIcon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1 leading-snug">{children}</span>
      {action ? <span className="shrink-0">{action}</span> : null}
      {!hideDismiss && onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          className="ml-0.5 shrink-0 rounded-sm px-1 opacity-70 transition hover:opacity-100"
          style={{ color: palette.text }}
          aria-label="Dismiss"
          title="Dismiss"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      ) : null}
    </div>
  );
}
