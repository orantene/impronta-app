"use client";

/**
 * Menu surface kit — THE light popover/menu language for every floating
 * control surface in the builder (right-click context menu, chip overflow
 * menus, canvas insert menus, floating action pills, drag ghosts).
 *
 * WHY THIS EXISTS (2026-08-15 owner escalation): the canvas right-click menu
 * and the floating "Remove" pill were still wearing the v1 dark-navy
 * operator-chrome treatment (CHIP_BG / RAIL_BG gradients, white-alpha text)
 * while the rest of the editor chrome — command palette, slash insert menu,
 * inspector dock, nested-blocks panel — had moved to the light control
 * language (white surface, dark text, subtle border, soft shadow). Each menu
 * carried its own bespoke style block, so surfaces drifted one at a time.
 *
 * This module is the single source of truth for that light language. Every
 * menu/pill routes through these primitives (or, for surfaces that can't be
 * componentized without churn, through the exported style constants), so the
 * dark treatment cannot creep back per-surface.
 *
 * Rules encoded here:
 *   - Surface: CHROME.surface (white), CHROME_SHADOWS.panel (includes the
 *     1px hairline ring), CHROME_RADII.md corners — same recipe as the
 *     canvas text toolbar and the light selection chip.
 *   - Items: dark text on white, subtle ink hover fill.
 *   - Destructive: CHROME.rose text + roseBg hover — NEVER gold/rust/amber.
 *   - Focus: visible accent outline on :focus-visible (keyboard nav must be
 *     legible on the light surface).
 */

import { forwardRef } from "react";

import { CHROME, CHROME_RADII, CHROME_SHADOWS } from "./tokens";

/** Hover fill for non-destructive menu items / icon buttons on white. */
export const MENU_HOVER_FILL = "rgba(24,24,27,0.05)";
/** Destructive item ink — kit rose (AA on white), never gold/rust/amber. */
export const MENU_DANGER_TEXT = CHROME.rose;
/** Destructive hover fill. */
export const MENU_DANGER_HOVER_FILL = CHROME.roseBg;
/** Muted "eyebrow" label (uppercase group headers) on the light surface. */
export const MENU_EYEBROW_COLOR = CHROME.muted2;

/**
 * The light popover panel. Spread into any floating menu container.
 * `CHROME_SHADOWS.panel` already carries the 1px hairline ring, so no
 * separate border is needed (matches the canvas text toolbar).
 */
export const MENU_SURFACE_STYLE: React.CSSProperties = {
  background: CHROME.surface,
  color: CHROME.text,
  borderRadius: CHROME_RADII.md,
  boxShadow: CHROME_SHADOWS.panel,
};

/**
 * Elevated variant for surfaces that float free of an anchor (right-click
 * menu at the cursor, drag ghosts) — same white surface, deeper shadow so it
 * separates from arbitrary storefront content underneath.
 */
export const MENU_SURFACE_ELEVATED_STYLE: React.CSSProperties = {
  ...MENU_SURFACE_STYLE,
  boxShadow: CHROME_SHADOWS.popover,
};

/**
 * Small floating pill/rail surface (hover drag grips, the Add/Remove rail,
 * class badges). Same family as the panel, tighter radius.
 */
export const FLOATING_PILL_STYLE: React.CSSProperties = {
  background: CHROME.surface,
  color: CHROME.text,
  borderRadius: CHROME_RADII.md,
  boxShadow: CHROME_SHADOWS.panel,
};

/**
 * Focus-visible ring classes for interactive children of a menu surface.
 * Outline (not box-shadow) so it wins over inline hover backgrounds.
 * The literal tracks CHROME.accent — keep in sync with `kit/tokens.ts`.
 */
export const MENU_FOCUS_RING_CLASS =
  "focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#7c3aed]";

/**
 * MenuSurface — light popover container. Defaults to `role="menu"`; pass any
 * div props (data attributes, positioning style, handlers) straight through.
 */
export const MenuSurface = forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(function MenuSurface({ role = "menu", style, children, ...rest }, ref) {
  return (
    <div ref={ref} role={role} style={{ ...MENU_SURFACE_STYLE, ...style }} {...rest}>
      {children}
    </div>
  );
});

/**
 * MenuItem — one row of a light menu. Dark text on white, subtle ink hover,
 * rose destructive variant, visible keyboard focus ring. Restyle-only twin of
 * the old dark `ContextMenuButton` (same size, weight, and behavior).
 */
export function MenuItem({
  children,
  disabled = false,
  danger = false,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={MENU_FOCUS_RING_CLASS}
      style={{
        width: "100%",
        minHeight: 30,
        display: "flex",
        alignItems: "center",
        padding: "0 9px",
        borderRadius: CHROME_RADII.sm,
        border: "none",
        background: "transparent",
        color: danger ? MENU_DANGER_TEXT : CHROME.text,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        fontSize: 12,
        fontWeight: 650,
        textAlign: "left",
      }}
      onMouseEnter={(event) => {
        if (disabled) return;
        event.currentTarget.style.background = danger
          ? MENU_DANGER_HOVER_FILL
          : MENU_HOVER_FILL;
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.background = "transparent";
      }}
    >
      {children}
    </button>
  );
}

/** Hairline separator between menu item groups. */
export function MenuSeparator() {
  return (
    <div
      aria-hidden
      style={{
        height: 1,
        margin: "4px 5px",
        background: CHROME.line,
      }}
    />
  );
}
