/**
 * Phase 5 — optimistic concurrency contract.
 *
 * Every editable Phase 5 row (agency_business_identity, agency_branding,
 * cms_pages, cms_sections) carries an integer `version` column. Writes
 * follow:
 *
 *   UPDATE ... SET ..., version = expectedVersion + 1
 *   WHERE id = ? AND version = expectedVersion
 *
 * If 0 rows are touched, the caller re-reads and returns
 * { ok: false, code: 'VERSION_CONFLICT', currentVersion } so the client
 * can reconcile.
 *
 * Error codes used across Phase 5 are enumerated here so surfaces can
 * render consistent messages.
 */

export const PHASE_5_ERROR_CODES = [
  "VERSION_CONFLICT",
  "SYSTEM_PAGE_IMMUTABLE",
  "RESERVED_SLUG",
  "MEDIA_REF_BROKEN",
  "TOKEN_NOT_OVERRIDABLE",
  "PUBLISH_NOT_READY",
  "PREVIEW_EXPIRED",
  "PREVIEW_TENANT_MISMATCH",
  "FORBIDDEN",
  // M2 additions — reusable across Phase 5:
  "NOT_FOUND", // row lookup by id missed (wrong tenant / deleted)
  "VALIDATION_FAILED", // post-Zod server-side invariant failed (e.g. bad tree)
  // M4 additions:
  "SECTION_IN_USE", // delete blocked: referenced by cms_page_sections (RESTRICT FK)
] as const;

export type Phase5ErrorCode = (typeof PHASE_5_ERROR_CODES)[number];

export type Phase5Result<T> =
  | { ok: true; data: T }
  | { ok: false; code: Phase5ErrorCode; message?: string; currentVersion?: number };

export function versionConflict(currentVersion: number): Phase5Result<never> {
  return { ok: false, code: "VERSION_CONFLICT", currentVersion };
}

export function ok<T>(data: T): Phase5Result<T> {
  return { ok: true, data };
}

export function fail(code: Phase5ErrorCode, message?: string): Phase5Result<never> {
  return { ok: false, code, message };
}
