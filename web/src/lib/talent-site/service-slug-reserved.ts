/**
 * TUL-1272 C1: the ONE list of words a custom service slug may never take.
 *
 * A custom service slug lives at the root of a talent or business host (`/<slug>`), the same
 * namespace as the platform's own routes, site pages, policy pages and locale prefixes. A service
 * slugged "book" or "es" would be unreachable or would shadow a real route, so the stored-slug
 * normalizer (`normalizeStoredServiceSlug`) reads it as "no custom slug" and the write path
 * (`planServiceSlugWrite`) refuses it.
 *
 * Sources, so the list cannot drift silently:
 *   - PLATFORM_RESERVED_SLUGS: host-routing reserved words + every locale code. Its own
 *     collisions tripwire walks `src/app` for agency-host routes.
 *   - RESERVED_PAGE_SLUGS: talent-site system and policy page slugs.
 *   - APP_ROOT_SEGMENTS below: every static top-level route segment under `src/app`,
 *     `src/app/(public)` and `src/app/(auth)`. `service-slug-reserved.test.ts` walks those
 *     folders and fails when a new top-level route is missing here.
 *   - SERVICE_EXTRA_RESERVED: service-surface words and well-known files.
 */
import { PLATFORM_RESERVED_SLUGS } from "@/lib/site-admin/reserved-routes";
import { RESERVED_PAGE_SLUGS } from "@/lib/talent-site/server/site-page-management-core";

/** Static top-level route segments (root, (public), (auth)) that a slug could collide with. */
export const APP_ROOT_SEGMENTS = [
  "account",
  "admin",
  "api",
  "auth",
  "blog",
  "book",
  "c",
  "checkout",
  "claim",
  "client",
  "contact",
  "desk",
  "dev",
  "developers",
  "directory",
  "embed",
  "embed.js",
  "events",
  "fonts",
  "forgot-password",
  "indexnow-key.txt",
  "invite",
  "join",
  "link",
  "llms.txt",
  "login",
  "manage",
  "me",
  "models",
  "offline",
  "onboarding",
  "p",
  "pay",
  "posts",
  "q",
  "r",
  "register",
  "review",
  "share",
  "start",
  "t",
  "talent",
  "team-invite",
  "template-preview",
  "ticket",
  "unsubscribe",
  "update-password",
  "visit",
] as const;

/** Service-surface words, host-routing words and well-known files not covered above. */
export const SERVICE_EXTRA_RESERVED = [
  "about",
  "assets",
  "booking",
  "cart",
  "eventos",
  "favicon.ico",
  "home",
  "index",
  "logout",
  "menu",
  "reservar",
  "robots.txt",
  "search",
  "servicio",
  "servicios",
  "services",
  "signin",
  "signup",
  "sitemap.xml",
  "static",
  "w",
  "www",
  "_next",
] as const;

export const RESERVED_SERVICE_SLUGS: ReadonlySet<string> = new Set(
  [...PLATFORM_RESERVED_SLUGS, ...RESERVED_PAGE_SLUGS, ...APP_ROOT_SEGMENTS, ...SERVICE_EXTRA_RESERVED].map((s) =>
    s.trim().toLowerCase(),
  ),
);

export function isReservedServiceSlug(slug: string): boolean {
  return RESERVED_SERVICE_SLUGS.has(slug.trim().toLowerCase());
}
