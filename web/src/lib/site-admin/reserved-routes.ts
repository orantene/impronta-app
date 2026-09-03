/**
 * Phase 5 — reserved-route registry (layer 1 of 3).
 *
 * The 3 enforcement layers are:
 *   1. This registry (Zod + code gate at save).
 *   2. public.platform_reserved_slugs + cms_pages_reserved_slug_guard trigger.
 *   3. Middleware log on any production request reaching a reserved path.
 *
 * New reserved slugs should be added HERE first, then mirrored into the DB
 * table via a platform-admin action or a follow-up migration.
 *
 * ── Why this list grew (clean public URLs, 2026-08-28) ─────────────────────
 * Customer-facing builder pages moved from `/p/<slug>` to `/<slug>`. Before
 * that move a tenant page slug lived inside its own `/p` namespace and could
 * only ever collide with another page. Now every page slug shares the ROOT
 * namespace with the platform's own routes, so a page called "login" would be
 * permanently unreachable: the surface allow-list resolves `/login` to the
 * auth route before the CMS clean-URL rewrite is ever considered.
 *
 * Three families are reserved:
 *
 *   a) Platform internals — the original list (admin, api, _next, …).
 *   b) Root segments that RESOLVE on a tenant host. Derived, not guessed:
 *      `reserved-routes.collisions.static.test.ts` walks `src/app` and asserts
 *      that every top-level route segment which `isPathAllowedForHostKind`
 *      admits on an agency host appears below. That tripwire is what stops
 *      this list drifting the next time somebody adds a route.
 *   c) Every platform locale code. `/es/<slug>` is the Spanish grammar for
 *      `/<slug>`, so a page slugged "es" makes `/es` ambiguous with the whole
 *      locale-prefixed tree.
 *
 * `contact` is deliberately NOT reserved: `/contact` was removed from the
 * agency storefront allow-list precisely so tenants could own it as a CMS
 * page (see AGENCY_STOREFRONT_PREFIXES).
 */

import { z } from "zod";

import { STATIC_LOCALES, localeMetadata } from "@/i18n/config";

/**
 * Every locale code the platform knows about, lowercased to slug form
 * ("pt-BR" → "pt-br"). Derived from the i18n registry rather than hardcoded so
 * adding a language to `localeMetadata` also reserves its URL prefix.
 *
 * The runtime locale list lives in `app_locales` and can in principle exceed
 * this compile-time set; the DB trigger (layer 2) is seeded from the same
 * derived list, and any locale added at runtime must be added here too — the
 * collisions tripwire test documents that contract.
 */
export const PLATFORM_LOCALE_SLUGS: readonly string[] = Array.from(
  new Set(
    [...STATIC_LOCALES, ...Object.keys(localeMetadata)].map((code) =>
      code.trim().toLowerCase(),
    ),
  ),
).sort();

export const PLATFORM_RESERVED_SLUGS = [
  "admin",
  "api",
  "auth",
  "onboarding",
  "t",
  // Public parent segment for path-based workspaces (tulala.digital/w/<slug>).
  // Reserved so a workspace can never claim "w" and shadow the parent.
  "w",
  "sitemap.xml",
  "robots.txt",
  "_next",
  "favicon.ico",
  "error",
  "not-found",

  // ── Clean-URL era: root segments that resolve on a tenant host ───────────
  // Auth surface (AUTH_PREFIXES).
  "login",
  "register",
  "join",
  "claim",
  "forgot-password",
  "update-password",
  // Workspace surfaces reachable from a tenant's own host (APP_WORKSPACE_*).
  "account",
  "client",
  "talent",
  "invite",
  "team-invite",
  "template-preview",
  "platform",
  "share",
  // Public storefront surfaces (AGENCY_STOREFRONT_PREFIXES).
  "directory",
  "models",
  "posts",
  // Appointments booking page. Seeded as system-owned in PR-6; reserved so a
  // tenant cannot author a colliding CMS page that would never open.
  "book",
  // The legacy CMS namespace itself. Still serves (it 301s to the clean form),
  // so a page slugged "p" would fight its own redirect.
  "p",
  // Guest full-window conversation (/c/<inquiryId>).
  "c",
  // Customer home (F5). Resolves on every tenant host, so a CMS page slugged
  // "me" could never open. Mirrored in 20261229000500_reserve_me_slug.sql.
  "me",
  // Host-agnostic surfaces that resolve on EVERY host kind.
  "checkout",
  "embed",
  "embed.js",
  "unsubscribe",
  "review",
  "offline",
  "prototypes",
  "opengraph-image",
  "twitter-image",
  // Deep-link association files. Like `sitemap.xml`, the page-slug regex can
  // never produce this shape; listed so the derived collision tripwire has a
  // complete answer rather than a documented exception.
  ".well-known",

  // ── Locale prefixes ─────────────────────────────────────────────────────
  ...PLATFORM_LOCALE_SLUGS,
] as const;

export type PlatformReservedSlug = (typeof PLATFORM_RESERVED_SLUGS)[number];

const RESERVED_SET = new Set<string>(PLATFORM_RESERVED_SLUGS);

/**
 * A slug the operator can probably have instead. Deliberately dumb and
 * predictable: `-page` is never itself reserved (no reserved word ends in
 * `-page`), so the suggestion is always accepted if they take it.
 */
export function suggestAlternativeSlug(reserved: string): string {
  return `${reserved}-page`;
}

/**
 * The creation-time error an operator reads. Names the offending word, says
 * WHY in plain language, and hands over a slug that will work — a bare
 * "reserved" rejection left people retrying variants blind.
 */
export function reservedSlugMessage(reserved: string): string {
  return `"${reserved}" is reserved by Tulala, so a page at /${reserved} could never open. Try "${suggestAlternativeSlug(reserved)}" instead.`;
}

/**
 * Rejects tenant-authored slugs whose first path segment collides with a
 * platform-reserved slug. Composable with other page-slug Zod validators.
 */
export const tenantSlugRefinement = (
  slug: string,
  ctx: z.RefinementCtx,
): void => {
  const normalized = slug.replace(/^\/+/, "");
  const first = normalized.split("/")[0] ?? "";
  if (RESERVED_SET.has(first)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: reservedSlugMessage(first),
    });
  }
};

export function isReservedSlug(slug: string): boolean {
  const normalized = slug.replace(/^\/+/, "");
  const first = normalized.split("/")[0] ?? "";
  return RESERVED_SET.has(first);
}
