"use client";

/**
 * Button — the ONE editor-chrome button primitive (W2-C2).
 *
 * Before this, ~40 locally-defined `*Button` components across the edit chrome
 * each hand-rolled the same primary / secondary / ghost styling, and two of them
 * (the command dock + the inspector rail) copy-pasted an identical
 * `onMouseEnter` / `onMouseLeave` inline-style hover MUTATION. That pattern is a
 * bug magnet (hover state desyncs from React, gets left stuck on disable) and it
 * duplicated the token values by hand.
 *
 * This primitive replaces that: variants read the ONE token kit (`CHROME`), and
 * hover / disabled / active are pure CSS (`:hover`, `:disabled`,
 * `[aria-pressed]`) injected ONCE from the token values — no per-instance JS
 * style mutation. The vertical nav-rail items (dock + inspector rail) keep their
 * bespoke icon-over-label layout but share the `.ec-rail-item` hover class from
 * the same stylesheet, so the copy-pasted mutation is gone.
 *
 * Variants:
 *   - primary    accent fill, white text — the drawer "Save / Apply" CTA
 *   - secondary  white well + control border — the drawer "Cancel" sibling
 *   - ghost      transparent, tints on hover — icon toolbuttons, nav items
 *   - subtle     faint paper fill — low-emphasis inline actions
 *   - danger     rose — destructive confirms
 *
 * `loading` shows a spinner, sets `aria-busy`, and disables the button so every
 * async action keeps its explicit pending state (owner rule).
 */

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

import { CHROME, CHROME_RADII } from "./tokens";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "subtle"
  | "danger";

export type ButtonSize = "sm" | "md";

const STYLE_ELEMENT_ID = "ec-button-styles";

/**
 * Build the chrome-button stylesheet from the token kit. Kept as a function of
 * `CHROME` so there is exactly one source for the hex values — the primitive
 * never re-hardcodes a color a token already owns.
 */
function buildButtonStylesheet(): string {
  const ghostHoverBg = "rgba(124, 58, 237, 0.06)";
  const ghostActiveBg = "rgba(124, 58, 237, 0.10)";
  return `
@keyframes ec-btn-spin { to { transform: rotate(360deg); } }
.ec-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-weight: 500;
  line-height: 1;
  border: 1px solid transparent;
  border-radius: ${CHROME_RADII.sm}px;
  cursor: pointer;
  white-space: nowrap;
  user-select: none;
  transition: background-color 160ms cubic-bezier(0.2,0,0,1),
    color 160ms cubic-bezier(0.2,0,0,1),
    border-color 160ms cubic-bezier(0.2,0,0,1),
    box-shadow 160ms cubic-bezier(0.2,0,0,1);
}
.ec-btn:focus-visible {
  outline: 2px solid ${CHROME.accent};
  outline-offset: 2px;
}
.ec-btn:disabled { cursor: not-allowed; }
.ec-btn--sm { height: 26px; padding: 0 10px; font-size: 11px; }
.ec-btn--md { height: 30px; padding: 0 14px; font-size: 12px; }
.ec-btn--icon { padding: 0; }
.ec-btn--icon.ec-btn--sm { width: 26px; }
.ec-btn--icon.ec-btn--md { width: 30px; }

/* primary — accent CTA */
.ec-btn--primary {
  background: ${CHROME.accent};
  color: #fff;
  font-weight: 600;
  box-shadow: 0 1px 2px rgba(0,0,0,0.10);
}
.ec-btn--primary:hover:not(:disabled) { background: ${CHROME.accent2}; }
.ec-btn--primary:disabled { background: ${CHROME.muted2}; box-shadow: none; }

/* secondary — white well + control edge.
 * KIT-control-family retone: edge cools from khaki CHROME.controlBorder
 * (#cfc7b6) to CHROME.lineStrong, matching NumberUnit / InspectorSelect /
 * SelectDropdown / kit/segmented.tsx. This is the DEFAULT Button variant, so
 * the retone reaches every bare <Button> in the editor. Hover background
 * cools from the parchment CHROME.paper2 (#f3f0e8) to a whisper-of-ink
 * neutral tint; hover border steps to CHROME.lineStrongHover — one deeper
 * stop of the SAME cool ink instead of the old khaki controlBorderStrong. */
.ec-btn--secondary {
  background: ${CHROME.surface};
  color: ${CHROME.text2};
  border-color: ${CHROME.lineStrong};
}
.ec-btn--secondary:hover:not(:disabled) {
  background: rgba(24, 24, 27, 0.05);
  border-color: ${CHROME.lineStrongHover};
}
.ec-btn--secondary:disabled { color: ${CHROME.muted2}; opacity: 0.6; }

/* ghost — transparent, tints on hover; active via aria-pressed */
.ec-btn--ghost { background: transparent; color: ${CHROME.muted}; }
.ec-btn--ghost:hover:not(:disabled) {
  background: ${ghostHoverBg};
  color: ${CHROME.ink2};
}
.ec-btn--ghost[aria-pressed="true"] {
  background: ${ghostActiveBg};
  color: ${CHROME.accent};
}
.ec-btn--ghost:disabled { color: ${CHROME.muted3}; }

/* subtle — faint paper fill */
.ec-btn--subtle { background: ${CHROME.paper2}; color: ${CHROME.text2}; }
.ec-btn--subtle:hover:not(:disabled) { background: ${CHROME.paper3}; }
.ec-btn--subtle:disabled { color: ${CHROME.muted2}; opacity: 0.6; }

/* danger — rose destructive */
.ec-btn--danger {
  background: ${CHROME.roseBg};
  color: ${CHROME.rose};
  border-color: ${CHROME.roseLine};
}
.ec-btn--danger:hover:not(:disabled) { background: ${CHROME.rose}; color: #fff; }
.ec-btn--danger:disabled { opacity: 0.6; }

/*
 * Vertical nav-rail item (command dock + inspector rail). The icon-over-label
 * LAYOUT stays local to each rail, but the hover / active TINT lives here so the
 * two rails can't drift and no JS re-implements the mutation. Active is flagged
 * with data-active="true".
 */
.ec-rail-item { background: transparent; color: ${CHROME.muted}; }
.ec-rail-item:not([data-active="true"]):hover {
  background: ${ghostHoverBg};
  color: ${CHROME.ink2};
}
.ec-rail-item[data-active="true"] {
  background: ${ghostActiveBg};
  color: ${CHROME.accent};
}
.ec-rail-item:disabled { cursor: not-allowed; opacity: 0.4; }
`;
}

/**
 * Inject the chrome-button stylesheet once per document. Idempotent — safe to
 * call from every rail item / button on mount. Guarded for SSR.
 */
export function ensureButtonStyles(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ELEMENT_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ELEMENT_ID;
  el.textContent = buildButtonStylesheet();
  document.head.appendChild(el);
}

// Inject on module load in the browser so the classes are present before the
// first paint of any consumer.
ensureButtonStyles();

/**
 * Pure variant → class mapping. Exported for unit testing so the class contract
 * (which drives the injected CSS) is verified without a DOM.
 */
export function buttonClassName(
  variant: ButtonVariant,
  size: ButtonSize,
  opts: { iconOnly?: boolean; className?: string } = {},
): string {
  const parts = [
    "ec-btn",
    `ec-btn--${variant}`,
    `ec-btn--${size}`,
  ];
  if (opts.iconOnly) parts.push("ec-btn--icon");
  if (opts.className) parts.push(opts.className);
  return parts.join(" ");
}

export interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Square icon-only shape (no horizontal padding). */
  iconOnly?: boolean;
  /** Shows a spinner, sets aria-busy, and disables the button. */
  loading?: boolean;
  /** Optional leading icon (rendered before children). */
  leadingIcon?: ReactNode;
  children?: ReactNode;
}

/** The single editor-chrome button. See file header. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "secondary",
    size = "md",
    iconOnly = false,
    loading = false,
    leadingIcon,
    disabled,
    className,
    children,
    type = "button",
    ...rest
  },
  ref,
) {
  const isDisabled = disabled || loading;
  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={buttonClassName(variant, size, { iconOnly, className })}
      {...rest}
    >
      {loading ? <Spinner /> : leadingIcon}
      {children}
    </button>
  );
});

function Spinner() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      style={{ animation: "ec-btn-spin 0.7s linear infinite" }}
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeOpacity="0.25"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
