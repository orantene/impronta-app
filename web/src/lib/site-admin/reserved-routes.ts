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
 */

import { z } from "zod";

export const PLATFORM_RESERVED_SLUGS = [
  "admin",
  "api",
  "auth",
  "onboarding",
  "t",
  "sitemap.xml",
  "robots.txt",
  "_next",
  "favicon.ico",
  "error",
  "not-found",
] as const;

export type PlatformReservedSlug = (typeof PLATFORM_RESERVED_SLUGS)[number];

const RESERVED_SET = new Set<string>(PLATFORM_RESERVED_SLUGS);

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
      message: `Slug "${first}" is reserved by the platform`,
    });
  }
};

export function isReservedSlug(slug: string): boolean {
  const normalized = slug.replace(/^\/+/, "");
  const first = normalized.split("/")[0] ?? "";
  return RESERVED_SET.has(first);
}
