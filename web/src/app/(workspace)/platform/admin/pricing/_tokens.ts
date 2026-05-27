/**
 * _tokens.ts — design tokens shared across the /platform/admin/pricing
 * subtree. Mirrors the HQ palette set up in
 * `web/src/app/(workspace)/platform/admin/layout.tsx`.
 *
 * Centralized here so each pricing module doesn't redefine its own
 * version (the today/page.tsx + topbar inline pattern works fine for a
 * single file; pricing is 5 files+, hence the extract).
 */

export const HQ = {
  bg: "#0F0F11",
  card: "#16161A",
  cardSoft: "rgba(255,255,255,0.04)",
  cardElevated: "#1B1B20",
  border: "rgba(255,255,255,0.10)",
  borderSoft: "rgba(255,255,255,0.06)",
  borderHover: "rgba(255,255,255,0.18)",
  ink: "#F5F2EB",
  inkMuted: "rgba(245,242,235,0.62)",
  inkDim: "rgba(245,242,235,0.38)",
  green: "#5DD3A0",
  amber: "#E8B864",
  red: "#F36772",
  blue: "#9EB6E5",
} as const;

export const F  = '"Inter", system-ui, sans-serif';
export const FD = 'var(--font-geist-sans), "Inter", -apple-system, system-ui, sans-serif';

export const FAMILY_COLORS: Record<string, string> = {
  workspace: HQ.green,
  talent:    HQ.blue,
  client:    HQ.amber,
};
