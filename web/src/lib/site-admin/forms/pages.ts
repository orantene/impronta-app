/**
 * Phase 5 / M3 — page form schemas.
 *
 * Split across four Zod shapes to match the four mutation paths:
 *   1. pageUpsertSchema        — create / update draft (+ SEO + hero)
 *   2. pagePublishSchema       — publish or re-publish (CAS only)
 *   3. pageArchiveSchema       — archive (CAS only)
 *   4. pageDeleteSchema        — delete (CAS only; trigger blocks system pages)
 *   5. pageRestoreRevisionSchema — rollback to a specific revision row
 *
 * Reserved-route discipline (guardrail §6 / §11 — 3 layers):
 *   - Layer 1 (this file): pageSlugSchema composes `tenantSlugRefinement`.
 *   - Layer 2 (DB):        cms_pages_reserved_slug_guard trigger.
 *   - Layer 3 (middleware): public-request log.
 *
 * Template discipline:
 *   - template_key must be a registry key (`TEMPLATE_REGISTRY`). The
 *     homepage template is platform-seeded as a system-owned row and cannot
 *     be created from this form — the UI hides it; the publish gate also
 *     rejects homepage from this path.
 */

import { z } from "zod";

import { localeSchema } from "../locales";
import { tenantSlugRefinement } from "../reserved-routes";
import { TEMPLATE_REGISTRY } from "../templates/registry";
import { pgUuidSchema } from "../validators";

// ---- constants ------------------------------------------------------------

/** Max slug-path length (segments separated by /). Storefront caps URLs. */
export const PAGE_SLUG_MAX = 240;
/** Title is required, bounded. */
export const PAGE_TITLE_MAX = 140;
/** Body is bounded — long-form lives in sections (M4), not here. */
export const PAGE_BODY_MAX = 50_000;
/** Meta title/description caps align with common-sense SEO limits. */
export const PAGE_META_TITLE_MAX = 140;
export const PAGE_META_DESCRIPTION_MAX = 320;
export const PAGE_OG_TITLE_MAX = 140;
export const PAGE_OG_DESCRIPTION_MAX = 320;
export const PAGE_CANONICAL_MAX = 2048;

/**
 * Canonical page-status tuple. The DB enum mirrors these three values; the
 * UI badge helper (`web/src/components/admin/page-status-badge.tsx`) keys
 * off this list so the editor, list view, and any future dashboards stay
 * aligned without bare strings.
 */
export const PAGE_STATUSES = ["draft", "published", "archived"] as const;
export type PageStatusLiteral = (typeof PAGE_STATUSES)[number];

/**
 * Template keys the agency can create / select. Homepage is system-owned —
 * created only via platform seed (M5) and surfaced read-only here.
 */
export const AGENCY_SELECTABLE_TEMPLATE_KEYS = ["standard_page"] as const;
export const ALL_TEMPLATE_KEYS = Object.keys(TEMPLATE_REGISTRY) as ReadonlyArray<
  keyof typeof TEMPLATE_REGISTRY
>;

export const agencyTemplateKeySchema = z.enum(AGENCY_SELECTABLE_TEMPLATE_KEYS);
export const anyTemplateKeySchema = z.enum(
  ALL_TEMPLATE_KEYS as unknown as [string, ...string[]],
);

// ---- slug -----------------------------------------------------------------

/**
 * A tenant-authored slug path. Shape rules (mirror legacy `isValidSlugPath`
 * + add reserved-route refinement from reserved-routes.ts):
 *
 *   - lowercase letters, digits, hyphens, single slashes
 *   - no leading/trailing slash
 *   - no repeated slashes
 *   - first segment not reserved (tenantSlugRefinement)
 *
 * Empty slug is reserved for the homepage row (is_system_owned = TRUE,
 * system_template_key = 'homepage'); this schema does NOT accept empty —
 * the homepage flow is separate (M5).
 */
export const pageSlugSchema = z
  .string()
  .trim()
  .min(1, "Slug is required")
  .max(PAGE_SLUG_MAX, `Slug must be ${PAGE_SLUG_MAX} characters or fewer`)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/,
    "Slug may only use lowercase letters, digits, hyphens, and forward slashes",
  )
  .superRefine((value, ctx) => {
    tenantSlugRefinement(value, ctx);
  });

// ---- hero / sub-shapes ----------------------------------------------------

/**
 * Hero JSON is registry-governed on the homepage (M5 template slots); for
 * standard pages the M3 editor treats it as opaque bag of string fields.
 * Shape here is intentionally minimal — sections (M4) carry real media.
 */
export const pageHeroSchema = z
  .object({
    title: z.string().trim().max(PAGE_TITLE_MAX).optional(),
    subtitle: z.string().trim().max(PAGE_META_DESCRIPTION_MAX).optional(),
    eyebrow: z.string().trim().max(80).optional(),
  })
  .strict()
  .default({});

// ---- main upsert shape ----------------------------------------------------

/**
 * One shape for create + update. Distinguished by presence of `id`.
 * `expectedVersion = 0` must accompany create (matches M1/M2 pattern).
 */
export const pageUpsertSchema = z
  .object({
    id: pgUuidSchema().nullable().optional(),
    tenantId: pgUuidSchema(),
    locale: localeSchema,
    slug: pageSlugSchema,
    /**
     * Agency users can only pick from the agency-selectable templates.
     * A system page (homepage) is loaded with its key locked; this schema
     * does not accept homepage from the upsert path.
     */
    templateKey: agencyTemplateKeySchema,
    /**
     * The registry version the editor loaded. Persisted with the row so
     * the template's migration map can replay on read if the platform
     * bumped to N+1 between edits.
     */
    templateSchemaVersion: z.number().int().min(1),
    title: z
      .string()
      .trim()
      .min(1, "Title is required")
      .max(PAGE_TITLE_MAX, `Title must be ${PAGE_TITLE_MAX} characters or fewer`),
    body: z.string().max(PAGE_BODY_MAX, "Body is too long").default(""),
    hero: pageHeroSchema,
    metaTitle: z
      .string()
      .trim()
      .max(PAGE_META_TITLE_MAX, `Meta title must be ${PAGE_META_TITLE_MAX} characters or fewer`)
      .nullable()
      .optional(),
    metaDescription: z
      .string()
      .trim()
      .max(PAGE_META_DESCRIPTION_MAX, `Meta description must be ${PAGE_META_DESCRIPTION_MAX} characters or fewer`)
      .nullable()
      .optional(),
    ogTitle: z
      .string()
      .trim()
      .max(PAGE_OG_TITLE_MAX)
      .nullable()
      .optional(),
    ogDescription: z
      .string()
      .trim()
      .max(PAGE_OG_DESCRIPTION_MAX)
      .nullable()
      .optional(),
    ogImageMediaAssetId: pgUuidSchema().nullable().optional(),
    noindex: z.boolean().default(false),
    includeInSitemap: z.boolean().default(true),
    canonicalUrl: z
      .string()
      .trim()
      .max(PAGE_CANONICAL_MAX)
      .url("Canonical URL must be absolute")
      .nullable()
      .optional(),
    /** Optimistic concurrency. 0 on create; last-seen version on update. */
    expectedVersion: z.number().int().min(0),
  })
  .superRefine((value, ctx) => {
    // canonical_url is optional; when set it must be absolute http(s).
    if (value.canonicalUrl && !/^https?:\/\//i.test(value.canonicalUrl)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["canonicalUrl"],
        message: "Canonical URL must start with http:// or https://",
      });
    }
  });

export type PageUpsertInput = z.input<typeof pageUpsertSchema>;
export type PageUpsertValues = z.output<typeof pageUpsertSchema>;

// ---- lifecycle mutation shapes (CAS only) ---------------------------------

export const pagePublishSchema = z.object({
  id: pgUuidSchema(),
  tenantId: pgUuidSchema(),
  expectedVersion: z.number().int().min(0),
});

export type PagePublishInput = z.input<typeof pagePublishSchema>;
export type PagePublishValues = z.output<typeof pagePublishSchema>;

export const pageArchiveSchema = z.object({
  id: pgUuidSchema(),
  tenantId: pgUuidSchema(),
  expectedVersion: z.number().int().min(0),
});

export type PageArchiveInput = z.input<typeof pageArchiveSchema>;
export type PageArchiveValues = z.output<typeof pageArchiveSchema>;

export const pageDeleteSchema = z.object({
  id: pgUuidSchema(),
  tenantId: pgUuidSchema(),
  expectedVersion: z.number().int().min(0),
});

export type PageDeleteInput = z.input<typeof pageDeleteSchema>;
export type PageDeleteValues = z.output<typeof pageDeleteSchema>;

// ---- restore-from-revision ------------------------------------------------

export const pageRestoreRevisionSchema = z.object({
  pageId: pgUuidSchema(),
  tenantId: pgUuidSchema(),
  revisionId: pgUuidSchema(),
  expectedVersion: z.number().int().min(0),
});

export type PageRestoreRevisionInput = z.input<typeof pageRestoreRevisionSchema>;
export type PageRestoreRevisionValues = z.output<typeof pageRestoreRevisionSchema>;

// ---- preview start --------------------------------------------------------

/**
 * Preview shape — signed JWT lasts 15 min, cookie-bound, tenant-scoped.
 * The subject is "page:<id>" so middleware can reject previews for other
 * entity types even if the cookie is stolen cross-surface.
 */
export const pagePreviewStartSchema = z.object({
  pageId: pgUuidSchema(),
  tenantId: pgUuidSchema(),
});

export type PagePreviewStartInput = z.input<typeof pagePreviewStartSchema>;
export type PagePreviewStartValues = z.output<typeof pagePreviewStartSchema>;
