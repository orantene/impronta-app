/**
 * Tulala — The Talent Business Platform.
 *
 * Single source of truth for the SaaS brand identity (name, domain, tagline,
 * legal entity). Tenant brands (e.g. Impronta) are resolved per-request and
 * live in `@/lib/site-admin`; they must never reach for this constant.
 *
 * Shape kept stable under `PLATFORM_BRAND` for back-compat during the
 * Rostra → Tulala rename; callers should import from here going forward.
 */
export const TULALA_BRAND = {
  /** Wordmark / display name — all-lowercase per brand guide (`tulala.`). */
  name: "Tulala",
  /** Corporate entity. Used in footers, legal, contracts. */
  legalName: "Tulala Digital",
  /** Production marketing surface hostname. */
  domain: "tulala.digital",
  /** Primary positioning line — one sentence, no period in buttons. */
  tagline: "The Talent Business Platform",
  /** Used in meta tags + social cards. */
  description:
    "Tulala is the operating system for talent businesses — a branded storefront, a structured booking pipeline, and the shared discovery network that sends new work your way.",
  /** Short line for trust strips and empty states. */
  positioning: "Software for talent businesses.",
  /** Launch stage surfaced in nav / hero badges. */
  stage: "Private beta",
} as const;

export type TulalaBrand = typeof TULALA_BRAND;

/**
 * First tenant / reference storefront used for marketing demos and the
 * "Powered by tulala." footer on agency sites. NOT the SaaS identity —
 * Impronta is one Tulala-powered agency among many.
 */
export const TENANT_EXAMPLE_BRAND = {
  name: "Impronta",
  category: "Models & talent agency",
  subdomain: "impronta",
} as const;
