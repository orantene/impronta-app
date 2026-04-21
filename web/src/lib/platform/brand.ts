/**
 * Platform brand — the SaaS company identity.
 *
 * Kept here as a single swappable source of truth so the marketing site can
 * be rebranded (copy, metadata, wordmark, social) without chasing strings
 * through the component tree. Tenant brands (e.g. Impronta, Nova Roster) are
 * separate concerns resolved per-tenant at request time.
 */
export const PLATFORM_BRAND = {
  /** Human-readable brand name used in the wordmark, metadata, and copy. */
  name: "Rostra",
  /** Marketing surface hostname (used in demo URLs on the home page). */
  domain: "rostra.app",
  /** Display-ready tagline — one line, title-case optional. */
  tagline: "The roster operating system",
  /** One-sentence product description — used in meta tags and social cards. */
  description:
    "Rostra gives roster-based businesses a polished directory site, a structured inquiry pipeline, and exposure on a shared discovery network.",
  /** Copyright / long-form signature used in footer + legal. */
  legalName: "Rostra, Inc.",
  /** Short positioning used in trust strips and empty states. */
  positioning: "Infrastructure for roster-based businesses.",
  /** Launch stage descriptor surfaced on the site. */
  stage: "Private beta",
} as const;

/**
 * First tenant / example brand used for storefront demos on the marketing
 * site. NOT the SaaS identity — only ever referenced when we want to show
 * what a real customer looks like on Rostra.
 */
export const TENANT_EXAMPLE_BRAND = {
  name: "Impronta",
  category: "Models & talent agency",
  subdomain: "impronta",
} as const;
