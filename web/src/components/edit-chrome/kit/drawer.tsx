"use client";

/**
 * Drawer — the unified chrome wrapper used by every editor drawer.
 *
 * Inspector, Publish, Page Settings, Revisions, Library, Theme, Assets,
 * Comments, Schedule — they all wear the same shape: section icon +
 * title + savechip → meta line → tools group (expand-cycle /
 * fullscreen / close) → optional pill tabs → paper-tinted body →
 * optional footer with primary action.
 *
 * This is the single answer to "every drawer should feel like the same
 * product." Every drawer in the editor MUST use this primitive — diverging
 * is a bug.
 *
 * **Sprint 2 unification contract (2026-04-28):**
 *   - **One heading style.** 15 px / 600 / -0.01em / `CHROME.ink`. No
 *     display-serif variant. Hierarchy comes from spacing + structure,
 *     not typographic personality. The retired `titleStyle` prop has been
 *     removed; type-system catches stragglers.
 *   - **No decorative eyebrow.** The `eyebrow` prop still exists for
 *     back-compat but new call sites omit it. The title row is the
 *     heading.
 *   - **Single body padding.** `DrawerBody` defaults to `14px 14px 24px`.
 *     Drawers should use the default — explicit padding only when there's
 *     a real content reason (e.g. inspector adds bottom room for tabs).
 *   - **Single footer chrome.** `DrawerFoot` renders the same gradient +
 *     border across all drawers.
 *   - **Single tool cluster.** `DrawerHead`'s `onExpand`/`onFullscreen`/
 *     `onClose` render the same 3-button cluster. No bespoke close
 *     buttons in drawer bodies.
 *
 * Layout intent (matches mockup `:root` and `.drawer` rules):
 *   position: fixed
 *   top:      52px (= editor topbar height)
 *   right:    0
 *   bottom:   0
 *   width:    DRAWER_WIDTHS[kind] (or override via prop)
 *   bg:       paper-2 (warm tint, not stark white)
 *   border-l: --line
 *   shadow:   layered drawer shadow (inner hairline + soft outer falloff)
 *
 * The body is paper-tinted; cards float on top in `surface` (white). This
 * gives real visual hierarchy — drawer body, then card, then field — so
 * the operator can read the structure at a glance.
 *
 * The expand/fullscreen/close tools cycle through three width states:
 *   - default    → DRAWER_WIDTHS[kind]
 *   - expanded   → DRAWER_WIDTHS[kind+"Expanded"] when defined
 *   - fullscreen → 100vw
 * Consumers pass `onExpand` / `onFullscreen` / `onClose`; this component
 * doesn't manage state — that lives in the consumer (or in EditContext).
 */

import type { ReactNode } from "react";

import {
  CHROME,
  CHROME_RADII,
  CHROME_SHADOWS,
  DRAWER_WIDTHS,
  type DrawerKind,
} from "./tokens";

// ── Drawer ──────────────────────────────────────────────────────────────────

interface DrawerProps {
  /** Determines default width and visual variant. */
  kind: DrawerKind;
  /** Override the width. Used by the expand/fullscreen cycle. */
  width?: number | "fullscreen";
  /**
   * When false, translates the drawer off-screen to the right.
   * Defaults to true (visible). Slide animation is 200ms ease-out.
   */
  open?: boolean;
  /** Optional data attribute for QA / e2e tests. */
  testId?: string;
  /** Z-index. Defaults to 80 (above selection layer, below modals). */
  zIndex?: number;
  /**
   * Top offset in px. Defaults to 52 (editor topbar height). Override
   * when the drawer is rendered without the topbar (e.g. in storybook).
   */
  topPx?: number;
  className?: string;
  children: ReactNode;
}

export function Drawer({
  kind,
  width,
  open = true,
  testId,
  zIndex = 80,
  topPx = 52,
  className,
  children,
}: DrawerProps) {
  const resolvedWidth =
    width === "fullscreen"
      ? "100vw"
      : typeof width === "number"
        ? `${width}px`
        : `${DRAWER_WIDTHS[kind]}px`;
  return (
    <aside
      data-edit-drawer={kind}
      data-testid={testId}
      className={`fixed flex flex-col font-sans ${className ?? ""}`}
      style={{
        top: topPx,
        bottom: 0,
        right: 0,
        width: resolvedWidth,
        background: CHROME.paper2,
        borderLeft: `1px solid ${CHROME.line}`,
        boxShadow: CHROME_SHADOWS.drawer,
        zIndex,
        transform: open ? "translateX(0)" : "translateX(100%)",
        transition:
          "width 220ms cubic-bezier(0.32, 0.72, 0, 1), transform 200ms ease-out",
      }}
    >
      {children}
    </aside>
  );
}

// ── DrawerHead ──────────────────────────────────────────────────────────────

interface DrawerHeadProps {
  /**
   * Caps eyebrow above the title row.
   *
   * Deprecated as of the 2026-04-28 compression sprint. Decorative
   * "Inspector / Publish / Theme" labels have been retired in favor of a
   * single-line title — the title row is the heading. New call sites
   * should omit this prop. When absent, no eyebrow row renders.
   */
  eyebrow?: string;
  /** The display name (operator's chosen label). */
  title: string;
  /** Section type icon (or any decorative glyph). */
  icon?: ReactNode;
  /** Right-aligned status pill (Saved / Saving / count chip). */
  saveChip?: ReactNode;
  /** Sub-line under the title row (e.g. "Hero section · last edit 2m ago"). */
  meta?: ReactNode;
  /** Tool callbacks. Tools render only for handlers that are provided. */
  onExpand?: () => void;
  onFullscreen?: () => void;
  onClose?: () => void;
}

export function DrawerHead({
  eyebrow,
  title,
  icon,
  saveChip,
  meta,
  onExpand,
  onFullscreen,
  onClose,
}: DrawerHeadProps) {
  return (
    <header
      className="flex items-start gap-2.5 px-[18px] py-[14px]"
      style={{
        background: CHROME.surface,
        borderBottom: `1px solid ${CHROME.line}`,
      }}
    >
      <div className="min-w-0 flex-1">
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <div className={`${eyebrow ? "mt-1.5" : ""} flex items-center gap-2.5`}>
          {icon ? (
            <span
              className="inline-flex size-[30px] shrink-0 items-center justify-center"
              style={{
                color: CHROME.ink,
                background: `linear-gradient(180deg, ${CHROME.paper}, ${CHROME.paper2})`,
                border: `1px solid ${CHROME.lineMid}`,
                boxShadow: CHROME_SHADOWS.inputInset,
                borderRadius: 7,
              }}
            >
              {icon}
            </span>
          ) : null}
          <span
            className="min-w-0 flex-1 truncate"
            style={{
              // Sprint 2 — single canonical drawer heading style. Display
              // serif was retired (multi-personality typography read as
              // inconsistency, not "important moment"). Hierarchy now comes
              // from spacing + structure, not a separate font.
              color: CHROME.ink,
              fontSize: 15,
              fontWeight: 600,
              letterSpacing: "-0.01em",
            }}
          >
            {title}
          </span>
          {saveChip ? <span className="shrink-0">{saveChip}</span> : null}
        </div>
        {meta ? (
          <div
            className="mt-1 ml-[40px] truncate"
            style={{ fontSize: 11, color: CHROME.muted }}
          >
            {meta}
          </div>
        ) : null}
      </div>
      <DrawerTools
        onExpand={onExpand}
        onFullscreen={onFullscreen}
        onClose={onClose}
      />
    </header>
  );
}

// ── DrawerTools (the three-button cluster: expand / fullscreen / close) ─────

interface DrawerToolsProps {
  onExpand?: () => void;
  onFullscreen?: () => void;
  onClose?: () => void;
}

export function DrawerTools({
  onExpand,
  onFullscreen,
  onClose,
}: DrawerToolsProps) {
  if (!onExpand && !onFullscreen && !onClose) return null;
  return (
    <div
      className="inline-flex shrink-0 items-center gap-0.5 p-[3px]"
      style={{
        background: CHROME.paper,
        border: `1px solid ${CHROME.line}`,
        borderRadius: 8,
      }}
    >
      {onExpand ? (
        <ToolButton onClick={onExpand} title="Expand" ariaLabel="Expand drawer">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <polyline points="15 3 21 3 21 9" />
            <polyline points="9 21 3 21 3 15" />
            <line x1="21" y1="3" x2="14" y2="10" />
            <line x1="3" y1="21" x2="10" y2="14" />
          </svg>
        </ToolButton>
      ) : null}
      {onFullscreen ? (
        <ToolButton
          onClick={onFullscreen}
          title="Fullscreen"
          ariaLabel="Fullscreen drawer"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 7V3h4M21 7V3h-4M3 17v4h4M21 17v4h-4" />
          </svg>
        </ToolButton>
      ) : null}
      {onClose ? (
        <ToolButton onClick={onClose} title="Close" ariaLabel="Close drawer">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </ToolButton>
      ) : null}
    </div>
  );
}

function ToolButton({
  onClick,
  title,
  ariaLabel,
  children,
}: {
  onClick: () => void;
  title: string;
  ariaLabel: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
      className="inline-flex size-[30px] cursor-pointer items-center justify-center rounded-[6px] transition-colors hover:shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
      style={{
        background: "transparent",
        color: CHROME.muted,
        border: "none",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = CHROME.surface;
        e.currentTarget.style.color = CHROME.ink;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = CHROME.muted;
      }}
    >
      {children}
    </button>
  );
}

// ── DrawerTabs / DrawerTab ─────────────────────────────────────────────────
//
// 2026-04-30 — Modernization pass. Old pill-segmented bar (with a
// raised-card active state) read as a small "settings panel" widget,
// not a primary builder navigator. Replaced with a flush underline-
// indicator pattern (Linear / Vercel / Stripe / Framer): tabs are
// plain text labels, the active one carries a 1.5px ink-tone underline
// flush with the bottom border. No card, no segmented bg, no shadow —
// the interaction surface IS the canvas/header line below.
//
// The whole strip is given `min-w-0 overflow-x-auto` so it never
// pushes the dock wider than its width — the right-edge "broken" look
// the operator reported was from cards inheriting overflow when a tab
// label wrapped (e.g. "Navigation" on a narrow dock).

interface DrawerTabsProps {
  className?: string;
  children: ReactNode;
}

export function DrawerTabs({ className, children }: DrawerTabsProps) {
  return (
    <div
      role="tablist"
      className={`flex min-w-0 items-stretch gap-5 overflow-x-auto px-[18px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className ?? ""}`}
    >
      {children}
    </div>
  );
}

interface DrawerTabProps {
  active?: boolean;
  /** Small dot to flag overrides / unsaved per tab. */
  dot?: boolean;
  onClick?: () => void;
  children: ReactNode;
}

export function DrawerTab({
  active = false,
  dot = false,
  onClick,
  children,
}: DrawerTabProps) {
  // The active underline is rendered as a child <span> rather than a
  // border so we can tune thickness, offset, and animation
  // independently of the parent's box model. The 2px height + slight
  // negative bottom margin tucks it under the strip's hairline so
  // there's no double-line moiré.
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className="group relative inline-flex shrink-0 items-center gap-1.5 bg-transparent px-0.5 pb-2.5 pt-2 transition-colors"
      style={{
        fontSize: 13,
        fontWeight: active ? 600 : 500,
        letterSpacing: "-0.005em",
        whiteSpace: "nowrap",
        cursor: "pointer",
        border: "none",
        color: active ? CHROME.ink : CHROME.muted,
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.color = CHROME.ink;
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.color = CHROME.muted;
      }}
    >
      {children}
      {dot ? (
        <span
          aria-hidden
          className="inline-block size-1.5 rounded-full"
          style={{ background: CHROME.blue }}
        />
      ) : null}
      <span
        aria-hidden
        className="absolute inset-x-0 -bottom-px h-[1.5px] rounded-full transition-[opacity,background-color] duration-150"
        style={{
          background: active ? CHROME.ink : "transparent",
          opacity: active ? 1 : 0,
        }}
      />
    </button>
  );
}

// ── DrawerBody / DrawerFoot ─────────────────────────────────────────────────

interface DrawerBodyProps {
  className?: string;
  /** Override default padding (14px). */
  padding?: number | string;
  children: ReactNode;
}

export function DrawerBody({
  className,
  padding = "14px 14px 24px",
  children,
}: DrawerBodyProps) {
  return (
    <div
      data-edit-drawer-body
      className={`flex-1 overflow-y-auto ${className ?? ""}`}
      style={{ padding }}
    >
      {children}
    </div>
  );
}

interface DrawerFootProps {
  className?: string;
  /** Left-aligned secondary content (meta text, secondary action). */
  start?: ReactNode;
  /** Right-aligned primary action group. */
  end?: ReactNode;
  children?: ReactNode;
}

export function DrawerFoot({
  className,
  start,
  end,
  children,
}: DrawerFootProps) {
  return (
    <div
      data-edit-drawer-foot
      className={`flex items-center justify-between gap-3 px-[18px] py-3.5 ${className ?? ""}`}
      style={{
        background: `linear-gradient(180deg, ${CHROME.paper2}, ${CHROME.paper3})`,
        borderTop: `1px solid ${CHROME.line}`,
      }}
    >
      {/* If `children` is provided, it takes over the whole footer. */}
      {children ?? (
        <>
          <div className="min-w-0 flex-1">{start}</div>
          <div className="flex shrink-0 items-center gap-2">{end}</div>
        </>
      )}
    </div>
  );
}

// ── Eyebrow (caps · tracking · muted) ───────────────────────────────────────

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div
      className="inline-flex items-center gap-2 uppercase"
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.18em",
        color: CHROME.muted2,
      }}
    >
      <span
        aria-hidden
        className="inline-block size-1.5 rounded-full"
        // Sprint 3.2 — eyebrow dot tones down to muted so it reads as a
        // section marker rather than a punctuation chip.
        style={{ background: CHROME.muted2 }}
      />
      {children}
    </div>
  );
}
