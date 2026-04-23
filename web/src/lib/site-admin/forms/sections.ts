/**
 * Phase 5 / M4 — section form schemas.
 *
 * Split across mutation paths (matches navigation + pages discipline):
 *   1. sectionUpsertSchema          — create / update draft
 *   2. sectionPublishSchema         — publish or re-publish (CAS only)
 *   3. sectionArchiveSchema         — archive (CAS only)
 *   4. sectionDeleteSchema          — delete (CAS; DB RESTRICT-FK blocks in-use)
 *   5. sectionRestoreRevisionSchema — rollback to a specific revision row
 *
 * Props discipline (the critical M4 gate):
 *   - `props_jsonb` is NEVER accepted as untyped JSON at this layer.
 *   - `validateSectionProps(typeKey, schemaVersion, props)` delegates to the
 *     section registry's `schemasByVersion[version]`. If the type key isn't
 *     registered, or if there is no schema for the claimed version, the
 *     upsert refinement fails with code `UNKNOWN_SECTION_TYPE` or
 *     `UNKNOWN_SCHEMA_VERSION` — server ops map those to user-visible errors.
 *   - This parallels the template discipline in forms/pages.ts: form shape
 *     is strict, and the sub-shape is registry-governed.
 *
 * Name uniqueness (guardrail §3.7):
 *   - DB enforces unique (tenant_id, name) via `cms_sections_tenant_name_key`.
 *   - Layer-1 validation here trims + caps length; reserved name discipline
 *     is not required (section names never become public URLs).
 *
 * Status tuple mirrors the DB `cms_section_status` ENUM and drives the
 * admin list badge helper at `components/admin/section-status-badge.tsx`
 * (sibling to page-status-badge.tsx; added in M4.5).
 */

import { z } from "zod";
import { pgUuidSchema } from "../validators";

import { getSectionType, SECTION_REGISTRY } from "../sections/registry";

// ---- constants ------------------------------------------------------------

/** Agency names are human-entered and indexed; a 140-char cap matches titles. */
export const SECTION_NAME_MAX = 140;

/**
 * Canonical section-status tuple. Mirrors the DB enum cms_section_status.
 * Drives the admin badge helper so status strings never leak as bare literals.
 */
export const SECTION_STATUSES = ["draft", "published", "archived"] as const;
export type SectionStatusLiteral = (typeof SECTION_STATUSES)[number];

/** All registered section type keys — agency picker groups by businessPurpose. */
export const ALL_SECTION_TYPE_KEYS = Object.keys(
  SECTION_REGISTRY,
) as ReadonlyArray<keyof typeof SECTION_REGISTRY>;

export const sectionTypeKeySchema = z.enum(
  ALL_SECTION_TYPE_KEYS as unknown as [string, ...string[]],
);

// ---- name -----------------------------------------------------------------

/**
 * Section instance name. Human-readable; unique per tenant at the DB layer.
 * Trimmed; empty rejected; 140 cap matches SECTION_NAME_MAX.
 */
export const sectionNameSchema = z
  .string()
  .trim()
  .min(1, "Name is required")
  .max(SECTION_NAME_MAX, `Name must be ${SECTION_NAME_MAX} characters or fewer`);

// ---- props delegation -----------------------------------------------------

/**
 * Validate a props payload against the section registry. The DB trigger
 * `cms_sections_props_media_ref_check` is the second line of defence; this
 * Zod call is the first.
 *
 * Returns a discriminated result so callers can surface a precise error code
 * (server ops translate to Phase5Result `code`):
 *   - `UNKNOWN_SECTION_TYPE`      — type_key not in SECTION_REGISTRY
 *   - `UNKNOWN_SCHEMA_VERSION`    — registry has no schema for that version
 *   - `PROPS_INVALID`             — Zod rejected the payload shape
 */
export type PropsValidateResult =
  | { ok: true; props: unknown }
  | {
      ok: false;
      code: "UNKNOWN_SECTION_TYPE" | "UNKNOWN_SCHEMA_VERSION" | "PROPS_INVALID";
      message: string;
      issues?: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>;
    };

export function validateSectionProps(
  typeKey: string,
  schemaVersion: number,
  props: unknown,
): PropsValidateResult {
  const entry = getSectionType(typeKey);
  if (!entry) {
    return {
      ok: false,
      code: "UNKNOWN_SECTION_TYPE",
      message: `Section type "${typeKey}" is not registered.`,
    };
  }
  const schema = entry.schemasByVersion[schemaVersion];
  if (!schema) {
    return {
      ok: false,
      code: "UNKNOWN_SCHEMA_VERSION",
      message: `Section type "${typeKey}" has no schema at version ${schemaVersion}.`,
    };
  }
  const parsed = schema.safeParse(props);
  if (!parsed.success) {
    return {
      ok: false,
      code: "PROPS_INVALID",
      message: "Section props failed validation.",
      issues: parsed.error.issues.map((i) => ({
        path: i.path,
        message: i.message,
      })),
    };
  }
  return { ok: true, props: parsed.data };
}

// ---- main upsert shape ----------------------------------------------------

/**
 * Create + update share one shape. Distinguished by `id`. `expectedVersion=0`
 * accompanies create (matches M1/M2/M3).
 *
 * Props are received as validated JSON (server-side: already parsed from
 * the form body into an object, not a JSON string). The superRefine gate
 * runs `validateSectionProps` against the registry; failure raises a
 * custom issue whose `params.code` is one of the three discriminants above
 * so server ops can map it to the correct error code.
 */
export const sectionUpsertSchema = z
  .object({
    id: pgUuidSchema().nullable().optional(),
    tenantId: pgUuidSchema(),
    sectionTypeKey: sectionTypeKeySchema,
    /**
     * The registry version the editor loaded. Persisted with the row so
     * the section's migration map can replay on read if the platform
     * bumped to N+1 between edits.
     */
    schemaVersion: z.number().int().min(1),
    name: sectionNameSchema,
    /**
     * Props are a plain object. The registry schema is the real validator;
     * we only assert "object" at the outer layer here.
     */
    props: z.record(z.string(), z.unknown()),
    /** Optimistic concurrency. 0 on create; last-seen version on update. */
    expectedVersion: z.number().int().min(0),
  })
  .superRefine((value, ctx) => {
    const result = validateSectionProps(
      value.sectionTypeKey,
      value.schemaVersion,
      value.props,
    );
    if (result.ok) return;
    if (result.code === "UNKNOWN_SECTION_TYPE") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sectionTypeKey"],
        message: result.message,
        params: { code: result.code },
      });
      return;
    }
    if (result.code === "UNKNOWN_SCHEMA_VERSION") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["schemaVersion"],
        message: result.message,
        params: { code: result.code },
      });
      return;
    }
    // PROPS_INVALID — surface each issue under the props.* path so the
    // editor can highlight fields.
    for (const issue of result.issues ?? []) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["props", ...issue.path],
        message: issue.message,
        params: { code: "PROPS_INVALID" },
      });
    }
  });

export type SectionUpsertInput = z.input<typeof sectionUpsertSchema>;
export type SectionUpsertValues = z.output<typeof sectionUpsertSchema>;

// ---- lifecycle mutation shapes (CAS only) ---------------------------------

export const sectionPublishSchema = z.object({
  id: pgUuidSchema(),
  tenantId: pgUuidSchema(),
  expectedVersion: z.number().int().min(0),
});

export type SectionPublishInput = z.input<typeof sectionPublishSchema>;
export type SectionPublishValues = z.output<typeof sectionPublishSchema>;

export const sectionArchiveSchema = z.object({
  id: pgUuidSchema(),
  tenantId: pgUuidSchema(),
  expectedVersion: z.number().int().min(0),
});

export type SectionArchiveInput = z.input<typeof sectionArchiveSchema>;
export type SectionArchiveValues = z.output<typeof sectionArchiveSchema>;

export const sectionDeleteSchema = z.object({
  id: pgUuidSchema(),
  tenantId: pgUuidSchema(),
  expectedVersion: z.number().int().min(0),
});

export type SectionDeleteInput = z.input<typeof sectionDeleteSchema>;
export type SectionDeleteValues = z.output<typeof sectionDeleteSchema>;

// ---- duplicate ------------------------------------------------------------

/**
 * Duplicate a section. Loads the source row, writes a NEW row with a fresh
 * id + operator-supplied name, copies `section_type_key` / `schema_version`
 * / `props_jsonb`, and forces `status = 'draft'` + `version = 1`.
 *
 * The new name must be unique per tenant (the DB uniqueness index enforces
 * it; the op surfaces 23505 as VALIDATION_FAILED with a name fieldError).
 * The default suggested name is `"<source.name> (copy)"` but the operator
 * is free to override — the schema just validates shape + length.
 *
 * Does NOT bust cache — a brand-new draft has no public effect.
 */
export const sectionDuplicateSchema = z.object({
  sourceId: pgUuidSchema(),
  tenantId: pgUuidSchema(),
  newName: sectionNameSchema,
});

export type SectionDuplicateInput = z.input<typeof sectionDuplicateSchema>;
export type SectionDuplicateValues = z.output<typeof sectionDuplicateSchema>;

// ---- restore-from-revision ------------------------------------------------

export const sectionRestoreRevisionSchema = z.object({
  sectionId: pgUuidSchema(),
  tenantId: pgUuidSchema(),
  revisionId: pgUuidSchema(),
  expectedVersion: z.number().int().min(0),
});

export type SectionRestoreRevisionInput = z.input<
  typeof sectionRestoreRevisionSchema
>;
export type SectionRestoreRevisionValues = z.output<
  typeof sectionRestoreRevisionSchema
>;
