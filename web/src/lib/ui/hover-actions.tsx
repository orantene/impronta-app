import type { CSSProperties, ReactNode } from "react";

/**
 * G.6 — Canonical hover-action row for list rows (inbox, roster, etc.).
 *
 * Hover/focus reveals a small action cluster anchored to the right edge.
 * Always-visible on touch (since hover doesn't exist on phones), keyboard
 * accessible via focus-within so tab users see what mouse users see.
 *
 * Markup:
 *   <Row className="group">
 *     {…row content…}
 *     <HoverActions>
 *       <IconButton aria-label="Pin">…</IconButton>
 *       <IconButton aria-label="Archive">…</IconButton>
 *     </HoverActions>
 *   </Row>
 *
 * The wrapper handles the reveal logic with inline styles + CSS variables
 * so the same component works on inbox rows that already have their own
 * complex layout (no Tailwind dependency required).
 */
export type HoverActionsProps = {
  children: ReactNode;
  /** Render even when not hovered. Useful for the active row in a list. */
  alwaysVisible?: boolean;
  /** Inline style overrides for the wrapper container. */
  style?: CSSProperties;
};

export function HoverActions({ children, alwaysVisible = false, style }: HoverActionsProps) {
  return (
    <div
      data-hover-actions
      data-always-visible={alwaysVisible ? "true" : undefined}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        marginLeft: "auto",
        // Opacity + transition handled via data attribute + parent
        // [data-row]:hover [data-hover-actions] in CSS (declared once in
        // app globals). When alwaysVisible, opacity:1 regardless.
        opacity: alwaysVisible ? 1 : "var(--hover-actions-opacity, 0)",
        transition: "opacity 120ms ease",
        pointerEvents: alwaysVisible ? "auto" : "var(--hover-actions-events, none)" as CSSProperties["pointerEvents"],
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/**
 * Shared inline-style attributes a parent row applies so HoverActions
 * inside it reveal correctly. Use as: `<div {...hoverActionRowAttrs}>`.
 *
 * Note: the actual reveal driver is a global CSS rule keyed off
 * `[data-hover-row]:hover [data-hover-actions]` — this attrs spread
 * just stamps the data attribute so the rule matches.
 */
export const hoverActionRowAttrs = {
  "data-hover-row": "true" as const,
};
