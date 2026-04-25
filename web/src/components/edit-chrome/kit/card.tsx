"use client";

/**
 * Card — the floating module within a drawer body.
 *
 * The drawer body is paper-tinted (`--paper-2`); cards float on top in
 * `--surface` (white) with a subtle shadow + 1px hairline border. This
 * three-layer hierarchy (drawer body → card → field) is the single
 * biggest source of visual life in the editor — without it, drawers
 * read as one flat sheet of inputs.
 *
 * Anatomy (matches mockup `.card` / `.card-head` / `.card-body`):
 *
 *   ┌─ Card ───────────────────────────────────────┐
 *   │ CardHead — icon · CAPS TITLE · sub · action  │
 *   ├──────────────────────────────────────────────┤
 *   │ CardBody — actual fields                     │
 *   └──────────────────────────────────────────────┘
 *
 * `tight` and `flush` body padding variants exist for media-heavy
 * cards (where the visual takes the whole tile) and for cards that
 * embed their own list rows with their own spacing.
 *
 * `state` prop highlights the card with a coloured border + shadow
 * — used by the Responsive tab to accent the active breakpoint, and
 * by the inline-edit affordance to mirror the canvas focus.
 */

import type { ReactNode } from "react";

import { CHROME, CHROME_SHADOWS } from "./tokens";

type CardState = "default" | "active" | "warn" | "muted";

interface CardProps {
  /** Optional emphasised state. */
  state?: CardState;
  /** Adds a subtle hover lift. Use for clickable cards. */
  interactive?: boolean;
  className?: string;
  children: ReactNode;
}

export function Card({
  state = "default",
  interactive = false,
  className,
  children,
}: CardProps) {
  const accent = stateAccent(state);
  return (
    <section
      className={`mb-2.5 overflow-hidden ${className ?? ""}`}
      style={{
        background: state === "muted" ? CHROME.paper2 : CHROME.surface,
        border: `1px solid ${accent.border}`,
        borderRadius: 10,
        boxShadow: accent.shadow,
        transition: interactive
          ? "transform 120ms, border-color 120ms, box-shadow 120ms"
          : undefined,
      }}
    >
      {children}
    </section>
  );
}

interface CardHeadProps {
  /** Small leading glyph in a paper-tinted tile. */
  icon?: ReactNode;
  /** UPPERCASE TITLE — matches `.card-title`. */
  title: string;
  /** Caption-tone subtitle on the right of the title. */
  sub?: ReactNode;
  /** Right-aligned action button (e.g. "Reset", "Library", "Open full"). */
  action?: ReactNode;
  /** Override icon tile colour scheme — used by accent states. */
  iconAccent?: "default" | "blue" | "green" | "amber" | "rose" | "violet";
  className?: string;
}

export function CardHead({
  icon,
  title,
  sub,
  action,
  iconAccent = "default",
  className,
}: CardHeadProps) {
  const iconStyle = iconAccentStyle(iconAccent);
  return (
    <header
      className={`flex items-center gap-2 px-[13px] pb-[9px] pt-[11px] ${className ?? ""}`}
      style={{
        borderBottom: `1px solid ${CHROME.line}`,
        background:
          "linear-gradient(180deg, rgba(0,0,0,0.012), transparent)",
      }}
    >
      {icon ? (
        <span
          className="inline-flex size-[22px] shrink-0 items-center justify-center"
          style={{
            background: iconStyle.bg,
            color: iconStyle.fg,
            border: `1px solid ${iconStyle.border}`,
            borderRadius: 5,
          }}
        >
          {icon}
        </span>
      ) : null}
      <span
        className="flex-1 truncate uppercase"
        style={{
          fontSize: 11.5,
          fontWeight: 700,
          letterSpacing: "0.04em",
          color:
            iconAccent === "default" || iconAccent === "blue"
              ? iconStyle.fg
              : CHROME.text,
        }}
      >
        {title}
      </span>
      {sub ? (
        <span
          className="shrink-0 truncate"
          style={{
            fontSize: 10.5,
            color: CHROME.muted2,
            fontWeight: 500,
            letterSpacing: "-0.005em",
          }}
        >
          {sub}
        </span>
      ) : null}
      {action ? <span className="shrink-0">{action}</span> : null}
    </header>
  );
}

interface CardBodyProps {
  /** Padding variant. `tight` = 10px (media tiles), `flush` = 0 (embed lists). */
  padding?: "default" | "tight" | "flush";
  className?: string;
  children: ReactNode;
}

export function CardBody({
  padding = "default",
  className,
  children,
}: CardBodyProps) {
  const px =
    padding === "default" ? 13 : padding === "tight" ? 10 : 0;
  return (
    <div className={className} style={{ padding: px }}>
      {children}
    </div>
  );
}

interface CardActionProps {
  /** Visual accent — `accent` is the blue link tone, default is muted. */
  accent?: "default" | "accent";
  onClick?: () => void;
  className?: string;
  children: ReactNode;
}

export function CardAction({
  accent = "default",
  onClick,
  className,
  children,
}: CardActionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 transition-colors ${className ?? ""}`}
      style={{
        background: "transparent",
        border: "none",
        fontSize: 11,
        fontWeight: accent === "accent" ? 600 : 500,
        color: accent === "accent" ? CHROME.blue : CHROME.muted,
      }}
      onMouseEnter={(e) => {
        if (accent === "default") {
          e.currentTarget.style.background = CHROME.paper2;
          e.currentTarget.style.color = CHROME.ink;
        }
      }}
      onMouseLeave={(e) => {
        if (accent === "default") {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = CHROME.muted;
        }
      }}
    >
      {children}
    </button>
  );
}

// ── helpers ─────────────────────────────────────────────────────────────────

function stateAccent(state: CardState) {
  switch (state) {
    case "active":
      return {
        border: CHROME.blue,
        shadow: `0 0 0 3px ${CHROME.blueBg}, ${CHROME_SHADOWS.cardHi}`,
      };
    case "warn":
      return {
        border: CHROME.amberLine,
        shadow: `0 0 0 1px ${CHROME.amberBg}, ${CHROME_SHADOWS.card}`,
      };
    case "muted":
      return {
        border: CHROME.line,
        shadow: "none",
      };
    case "default":
    default:
      return {
        border: CHROME.line,
        shadow: CHROME_SHADOWS.card,
      };
  }
}

function iconAccentStyle(accent: NonNullable<CardHeadProps["iconAccent"]>) {
  switch (accent) {
    case "blue":
      return { bg: CHROME.blueBg, fg: CHROME.blue, border: CHROME.blueLine };
    case "green":
      return { bg: CHROME.greenBg, fg: CHROME.green, border: CHROME.greenLine };
    case "amber":
      return { bg: CHROME.amberBg, fg: CHROME.amber, border: CHROME.amberLine };
    case "rose":
      return { bg: CHROME.roseBg, fg: CHROME.rose, border: CHROME.roseLine };
    case "violet":
      return {
        bg: CHROME.violetBg,
        fg: CHROME.violet,
        border: CHROME.violetLine,
      };
    case "default":
    default:
      return { bg: CHROME.paper2, fg: CHROME.ink, border: CHROME.line };
  }
}
