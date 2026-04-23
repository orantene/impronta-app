/**
 * Creator Circuit — navigation + CTAs (single source of truth).
 */

export const BASE = "/prototypes/creator-circuit";

export const NAV = [
  { label: "Discover", href: `${BASE}` },
  { label: "Creators", href: `${BASE}/creators` },
  { label: "For Brands", href: `${BASE}/for-brands` },
  { label: "For Creators", href: `${BASE}/for-creators` },
  { label: "About", href: `${BASE}/about` },
] as const;

export const CTA_PRIMARY = {
  label: "Start a Campaign",
  href: `${BASE}/contact`,
} as const;

export const CTA_SECONDARY = {
  label: "Join as a Creator",
  href: `${BASE}/for-creators`,
} as const;
