/**
 * Button looks for the `/account` area, shared by the server page and its
 * client islands. Must stay out of any "use client" module: a server component
 * importing a plain object from one gets a client reference, and spreading it
 * into `style` yields nothing.
 */

const INK = "var(--token-color-ink, #111)";
const ACCENT = "var(--token-color-primary, #111)";
const LINE = "var(--token-color-line, rgba(0,0,0,.14))";
const RADIUS = "var(--site-radius-base, 8px)";

export const btnPrimary = {
  minHeight: 44, padding: "0 18px", borderRadius: RADIUS, border: `1px solid ${ACCENT}`,
  background: ACCENT, color: "var(--token-color-on-primary, #fff)", font: "inherit", fontWeight: 600, cursor: "pointer",
} as const;
export const btnSecondary = {
  minHeight: 44, padding: "0 18px", borderRadius: RADIUS, border: `1px solid ${LINE}`,
  background: "transparent", color: INK, font: "inherit", fontWeight: 600, cursor: "pointer",
} as const;
