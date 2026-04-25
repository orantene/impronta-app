/**
 * Phase 5 / M5 — homepage composer form schemas.
 *
 * Split across mutation paths (matches pages / sections / navigation discipline):
 *   1. homepageMetadataSchema        — template-schema-governed page fields
 *                                      (title / metaDescription / introTagline)
 *   2. homepageSaveDraftSchema       — save the *draft* composition (metadata
 *                                      + slot → section_id list). CAS on the
 *                                      cms_pages.version.
 *   3. homepagePublishSchema         — promote draft → live (CAS only). All
 *                                      gates live in the server op.
 *   4. homepageRestoreRevisionSchema — rollback to a specific revision row;
 *                                      lands as draft.
 *
 * Composer discipline (the critical M5 gate):
 *   - Homepage is a SYSTEM-OWNED cms_pages row (is_system_owned = TRUE,
 *     system_template_key = 'homepage'). It is seeded on demand via
 *     `ensureHomepageRow`, never created from this form.
 *   - The composer mutates:
 *       (a) template-schema-governed page fields (title + meta + tagline),
 *       (b) the DRAFT slot composition in cms_page_sections (is_draft=TRUE).
 *     Live composition (is_draft=FALSE) and `published_homepage_snapshot`
 *     are ONLY written by `publishHomepage`, preserving the M4 publish
 *     discipline across surfaces (§9.3 / §9.4 guardrails).
 *
 * Slot discipline:
 *   - Slot keys are drawn from `homepageMeta.slots[*].key`. New slots ship
 *     via a PR to the template meta, not via this form.
 *   - Required slots must carry at least one section entry at publish time
 *     (checked in the server op, not Zod — draft saves of an empty required
 *     slot are allowed so the operator can stage work).
 *   - `allowedSectionTypes` (e.g. `['hero']` on the hero slot) is enforced
 *     by the server op on save + publish against the referenced sections'
 *     `section_type_key`. Zod can't check it here because the payload only
 *     carries section ids.
 *
 * Section reference discipline:
 *   - Every section referenced by the draft composition must belong to the
 *     same tenant (server op) and must be status IN ('draft', 'published')
 *     — 'archived' is rejected with VALIDATION_FAILED on save.
 *   - For PUBLISH, every referenced section must be status='published'. That
 *     gate lives in the server op; the user-visible error code is
 *     PUBLISH_NOT_READY so the operator knows which section to publish first.
 */

import { z } from "zod";
import { pgUuidSchema } from "../validators";

import { localeSchema } from "../locales";
import { homepageMeta } from "../templates/homepage/meta";

// ---- slot keys ------------------------------------------------------------

/**
 * Canonical slot-key tuple for the homepage template. Derived from the
 * template meta at module load so a new slot added to the meta is instantly
 * form-visible without touching this file. The tuple is frozen at import,
 * so test harnesses that stub the registry must do so before importing this
 * module.
 */
export const HOMEPAGE_SLOT_KEYS = homepageMeta.slots.map(
  (s) => s.key,
) as ReadonlyArray<string>;

/**
 * Required-slot subset — the server op uses this on publish. Draft saves can
 * leave required slots empty so the operator can stage work-in-progress.
 */
export const HOMEPAGE_REQUIRED_SLOT_KEYS = homepageMeta.slots
  .filter((s) => s.required)
  .map((s) => s.key) as ReadonlyArray<string>;

const homepageSlotKeyEnum =
  HOMEPAGE_SLOT_KEYS.length > 0
    ? z.enum(HOMEPAGE_SLOT_KEYS as unknown as [string, ...string[]])
    : z.string();

export const homepageSlotKeySchema = homepageSlotKeyEnum;

// ---- metadata -------------------------------------------------------------

/**
 * Page-level editorial fields. These mirror the v1 homepage template schema
 * intentionally — the server op re-parses against the current-version
 * template schema (migrating forward via `template.migrations` when the
 * platform has bumped since the page was last saved).
 *
 * Keep this loose-but-capped so operators can save drafts that don't yet
 * pass publish gates; publish is the strict boundary.
 */
/**
 * Optional-string factory: trims, caps, and normalises empty strings to
 * `undefined` so FormData submissions from the composer (which serialize
 * blank fields as empty strings) don't bypass the "absent means unset"
 * contract. Max must come after trim so length is measured against the
 * normalised value.
 */
function optionalTrimmedString(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value.length === 0 ? undefined : value))
    .optional();
}

/**
 * SEO knobs the operator sets in the composer's "Search & social" panel.
 * All optional — the renderer falls back to title/metaDescription when an
 * og field is absent. Mirrors the cms_pages columns one-to-one (og_title,
 * og_description, og_image_url, canonical_url, noindex) so the save op is
 * a direct projection.
 */
function optionalUrlString() {
  return z
    .string()
    .trim()
    .max(2048)
    .transform((value) => (value.length === 0 ? undefined : value))
    .optional()
    .refine(
      (v) =>
        v === undefined ||
        /^https?:\/\//i.test(v) ||
        v.startsWith("/"),
      { message: "Must be an absolute URL or a path starting with /" },
    );
}

export const homepageMetadataSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(140),
  metaDescription: optionalTrimmedString(280),
  introTagline: optionalTrimmedString(140),
  // SEO/OG knobs — all optional. Empty strings normalise to `undefined` so
  // the server op writes NULL into the corresponding cms_pages column.
  ogTitle: optionalTrimmedString(140),
  ogDescription: optionalTrimmedString(280),
  ogImageUrl: optionalUrlString(),
  canonicalUrl: optionalUrlString(),
  noindex: z.boolean().optional(),
});

export type HomepageMetadataInput = z.input<typeof homepageMetadataSchema>;
export type HomepageMetadataValues = z.output<typeof homepageMetadataSchema>;

// ---- slot composition -----------------------------------------------------

/**
 * One draft slot entry. Carries the target section id only; the section's
 * type, schema version, and props are all resolved server-side from the
 * cms_sections row so the client can't smuggle a stale snapshot in.
 *
 * `sortOrder` is explicit so re-ordering is a single payload; the DB's
 * unique index on (page_id, slot_key, sort_order, is_draft) enforces
 * no-collision.
 */
export const homepageSlotEntrySchema = z.object({
  sectionId: pgUuidSchema(),
  sortOrder: z.number().int().min(0),
});

/**
 * A full slot composition: slot_key → ordered entries. Slot keys are limited
 * to the template's slots (via `homepageSlotKeySchema`). An absent slot is
 * equivalent to an empty list (server op treats both the same).
 *
 * Composer UIs should always send every known slot key explicitly to keep
 * semantics obvious; missing keys are simply a client convenience.
 */
export const homepageSlotsSchema = z
  // `partialRecord` (Zod v4) keeps absent slot keys optional — `z.record`
  // now requires every enum key to be present, which would break the
  // documented "absent slot === empty list" contract above.
  .partialRecord(homepageSlotKeySchema, z.array(homepageSlotEntrySchema))
  .superRefine((slots, ctx) => {
    for (const [slotKey, entries] of Object.entries(slots)) {
      if (!entries) continue;
      // sortOrder must be unique per slot so the DB uniq index doesn't raise
      // at write time — surface it here so the operator can fix in the UI.
      const orders = new Set<number>();
      for (const entry of entries) {
        if (orders.has(entry.sortOrder)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [slotKey],
            message: `Duplicate sortOrder ${entry.sortOrder} in slot ${slotKey}`,
          });
          return;
        }
        orders.add(entry.sortOrder);
      }
    }
  });

export type HomepageSlotsInput = z.input<typeof homepageSlotsSchema>;
export type HomepageSlotsValues = z.output<typeof homepageSlotsSchema>;

// ---- save draft -----------------------------------------------------------

/**
 * Save the draft composition + draft page fields in one atomic op. CAS on
 * `cms_pages.version`. `expectedVersion = 0` is permitted on the very first
 * save right after `ensureHomepageRow` creates a v=1 row — the server op
 * normalises that.
 */
export const homepageSaveDraftSchema = z.object({
  tenantId: pgUuidSchema(),
  locale: localeSchema,
  expectedVersion: z.number().int().min(0),
  metadata: homepageMetadataSchema,
  slots: homepageSlotsSchema,
});

export type HomepageSaveDraftInput = z.input<typeof homepageSaveDraftSchema>;
export type HomepageSaveDraftValues = z.output<typeof homepageSaveDraftSchema>;

// ---- publish --------------------------------------------------------------

/**
 * CAS-only publish. All gates (required-slot filled, referenced sections
 * are published, template schema current-version parse, og-image media
 * live) live in the server op; this Zod shape is only the envelope.
 */
export const homepagePublishSchema = z.object({
  tenantId: pgUuidSchema(),
  locale: localeSchema,
  expectedVersion: z.number().int().min(0),
});

export type HomepagePublishInput = z.input<typeof homepagePublishSchema>;
export type HomepagePublishValues = z.output<typeof homepagePublishSchema>;

// ---- restore revision -----------------------------------------------------

/**
 * Roll the draft back to a prior snapshot. The server op writes a new draft
 * composition + page fields; no publish. Restored revisions land as draft
 * (same as page rollback — guardrail §5).
 */
export const homepageRestoreRevisionSchema = z.object({
  tenantId: pgUuidSchema(),
  locale: localeSchema,
  revisionId: pgUuidSchema(),
  expectedVersion: z.number().int().min(0),
});

export type HomepageRestoreRevisionInput = z.input<
  typeof homepageRestoreRevisionSchema
>;
export type HomepageRestoreRevisionValues = z.output<
  typeof homepageRestoreRevisionSchema
>;
