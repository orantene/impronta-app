/**
 * Phase 5 / M4 — unit tests for section schemas + capability grants.
 *
 * Covers the no-DB surface (DB-dependent invariants — unique (tenant_id, name),
 * RESTRICT FK from cms_page_sections, trim RPC, media_ref trigger — live in
 * the env-gated integration suite in M4 docs, not here):
 *   - sectionUpsertSchema: minimum valid create, name required, unknown type
 *     rejected, schema_version>=1 enforced, invalid props rejected with
 *     PROPS_INVALID surfaced on props.*, expectedVersion>=0, tenantId uuid
 *   - validateSectionProps direct surface: ok, UNKNOWN_SECTION_TYPE,
 *     UNKNOWN_SCHEMA_VERSION, PROPS_INVALID with issue paths
 *   - sectionPublishSchema / sectionArchiveSchema / sectionDeleteSchema:
 *     uuid id + tenant + expectedVersion; same shape
 *   - sectionRestoreRevisionSchema: sectionId + tenantId + revisionId +
 *     expectedVersion
 *   - ALL_SECTION_TYPE_KEYS tuple matches registry contents (hero only in M4)
 *   - Capability matrix:
 *       sections.edit:    editor YES, coordinator YES, admin YES, owner YES, viewer NO
 *       sections.publish: editor NO, coordinator YES, admin YES, owner YES, viewer NO
 *
 * Run with: npx tsx --test src/lib/site-admin/site-admin-m4.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ALL_SECTION_TYPE_KEYS,
  rolePhase5HasCapability,
  sectionArchiveSchema,
  sectionDeleteSchema,
  sectionDuplicateSchema,
  sectionPublishSchema,
  sectionRestoreRevisionSchema,
  sectionUpsertSchema,
  validateSectionProps,
} from "./index";

// ---- registry surface -----------------------------------------------------

test("ALL_SECTION_TYPE_KEYS is locked to ['hero'] in M4", () => {
  assert.deepEqual([...ALL_SECTION_TYPE_KEYS].sort(), ["hero"]);
});

// ---- sectionUpsertSchema --------------------------------------------------

const TENANT = "11111111-1111-4111-8111-111111111111";
const SECTION_ID = "22222222-2222-4222-8222-222222222222";
const REVISION_ID = "33333333-3333-4333-8333-333333333333";

/**
 * Minimum viable hero create. Props shape matches heroSchemaV1 — headline is
 * the only required field.
 */
const MIN_UPSERT = {
  tenantId: TENANT,
  sectionTypeKey: "hero" as const,
  schemaVersion: 1,
  name: "Homepage hero — main",
  props: { headline: "Hello world" },
  expectedVersion: 0,
};

test("sectionUpsertSchema accepts minimum valid create", () => {
  assert.equal(sectionUpsertSchema.safeParse(MIN_UPSERT).success, true);
});

test("sectionUpsertSchema accepts update with id + positive expectedVersion", () => {
  assert.equal(
    sectionUpsertSchema.safeParse({
      ...MIN_UPSERT,
      id: SECTION_ID,
      expectedVersion: 3,
    }).success,
    true,
  );
});

test("sectionUpsertSchema accepts id=null as create shorthand", () => {
  assert.equal(
    sectionUpsertSchema.safeParse({ ...MIN_UPSERT, id: null }).success,
    true,
  );
});

test("sectionUpsertSchema rejects empty name", () => {
  assert.equal(
    sectionUpsertSchema.safeParse({ ...MIN_UPSERT, name: "" }).success,
    false,
  );
});

test("sectionUpsertSchema rejects whitespace-only name (trim + min 1)", () => {
  assert.equal(
    sectionUpsertSchema.safeParse({ ...MIN_UPSERT, name: "   " }).success,
    false,
  );
});

test("sectionUpsertSchema rejects name longer than 140", () => {
  assert.equal(
    sectionUpsertSchema.safeParse({
      ...MIN_UPSERT,
      name: "a".repeat(141),
    }).success,
    false,
  );
});

test("sectionUpsertSchema rejects unknown section_type_key", () => {
  const result = sectionUpsertSchema.safeParse({
    ...MIN_UPSERT,
    sectionTypeKey: "not_registered",
  });
  assert.equal(result.success, false);
});

test("sectionUpsertSchema rejects schema_version < 1", () => {
  assert.equal(
    sectionUpsertSchema.safeParse({ ...MIN_UPSERT, schemaVersion: 0 }).success,
    false,
  );
});

test("sectionUpsertSchema rejects non-integer schema_version", () => {
  assert.equal(
    sectionUpsertSchema.safeParse({ ...MIN_UPSERT, schemaVersion: 1.5 }).success,
    false,
  );
});

test("sectionUpsertSchema rejects unknown schema_version for known type (hero v2 not registered)", () => {
  const result = sectionUpsertSchema.safeParse({
    ...MIN_UPSERT,
    schemaVersion: 2,
  });
  assert.equal(result.success, false);
  if (!result.success) {
    const issue = result.error.issues.find((i) =>
      i.path.includes("schemaVersion"),
    );
    assert.ok(issue, "should surface a schemaVersion issue");
    // Custom issue params.code should carry the discriminant so server ops
    // can map to Phase5ErrorCode.
    const params = (issue as { params?: { code?: string } }).params;
    assert.equal(params?.code, "UNKNOWN_SCHEMA_VERSION");
  }
});

test("sectionUpsertSchema rejects props missing required headline (hero v1)", () => {
  const result = sectionUpsertSchema.safeParse({
    ...MIN_UPSERT,
    props: {},
  });
  assert.equal(result.success, false);
  if (!result.success) {
    const issue = result.error.issues.find((i) => i.path[0] === "props");
    assert.ok(issue, "should surface an issue under props.*");
    const params = (issue as { params?: { code?: string } }).params;
    assert.equal(params?.code, "PROPS_INVALID");
  }
});

test("sectionUpsertSchema rejects props with empty headline", () => {
  assert.equal(
    sectionUpsertSchema.safeParse({
      ...MIN_UPSERT,
      props: { headline: "" },
    }).success,
    false,
  );
});

test("sectionUpsertSchema rejects props when not a plain object", () => {
  assert.equal(
    sectionUpsertSchema.safeParse({
      ...MIN_UPSERT,
      props: "not an object",
    }).success,
    false,
  );
});

test("sectionUpsertSchema rejects non-uuid tenantId", () => {
  assert.equal(
    sectionUpsertSchema.safeParse({ ...MIN_UPSERT, tenantId: "nope" }).success,
    false,
  );
});

test("sectionUpsertSchema rejects non-uuid id when provided", () => {
  assert.equal(
    sectionUpsertSchema.safeParse({ ...MIN_UPSERT, id: "not-a-uuid" }).success,
    false,
  );
});

test("sectionUpsertSchema rejects negative expectedVersion", () => {
  assert.equal(
    sectionUpsertSchema.safeParse({ ...MIN_UPSERT, expectedVersion: -1 }).success,
    false,
  );
});

test("sectionUpsertSchema accepts full hero payload with both CTAs", () => {
  assert.equal(
    sectionUpsertSchema.safeParse({
      ...MIN_UPSERT,
      props: {
        headline: "Book your shoot",
        subheadline: "European talent, modern workflow",
        primaryCta: { label: "Get in touch", href: "/contact" },
        secondaryCta: { label: "View work", href: "/portfolio" },
      },
    }).success,
    true,
  );
});

// ---- validateSectionProps direct ------------------------------------------

test("validateSectionProps: ok path returns parsed props", () => {
  const result = validateSectionProps("hero", 1, { headline: "Hi" });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.props, { headline: "Hi" });
  }
});

test("validateSectionProps: unknown type returns UNKNOWN_SECTION_TYPE", () => {
  const result = validateSectionProps("totally_fake", 1, {});
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "UNKNOWN_SECTION_TYPE");
  }
});

test("validateSectionProps: unknown schema version returns UNKNOWN_SCHEMA_VERSION", () => {
  const result = validateSectionProps("hero", 99, { headline: "Hi" });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "UNKNOWN_SCHEMA_VERSION");
  }
});

test("validateSectionProps: invalid payload returns PROPS_INVALID with issues", () => {
  const result = validateSectionProps("hero", 1, {
    headline: "", // fails min(1)
    primaryCta: { label: "", href: "" }, // two more failures
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "PROPS_INVALID");
    assert.ok(result.issues && result.issues.length > 0);
    // At least one issue must point at headline
    assert.ok(
      result.issues?.some((i) => i.path.includes("headline")),
      "expected a headline issue",
    );
  }
});

// ---- lifecycle shapes -----------------------------------------------------

test("sectionPublishSchema requires uuid id + tenant + expectedVersion>=0", () => {
  assert.equal(
    sectionPublishSchema.safeParse({
      id: SECTION_ID,
      tenantId: TENANT,
      expectedVersion: 1,
    }).success,
    true,
  );
  assert.equal(
    sectionPublishSchema.safeParse({
      id: "nope",
      tenantId: TENANT,
      expectedVersion: 1,
    }).success,
    false,
  );
  assert.equal(
    sectionPublishSchema.safeParse({
      id: SECTION_ID,
      tenantId: TENANT,
      expectedVersion: -1,
    }).success,
    false,
  );
});

test("sectionArchiveSchema + sectionDeleteSchema share the same shape", () => {
  const valid = { id: SECTION_ID, tenantId: TENANT, expectedVersion: 2 };
  assert.equal(sectionArchiveSchema.safeParse(valid).success, true);
  assert.equal(sectionDeleteSchema.safeParse(valid).success, true);
  assert.equal(
    sectionArchiveSchema.safeParse({ ...valid, expectedVersion: -1 }).success,
    false,
  );
  assert.equal(
    sectionDeleteSchema.safeParse({ ...valid, id: "bad" }).success,
    false,
  );
});

test("sectionRestoreRevisionSchema requires sectionId + tenantId + revisionId + expectedVersion", () => {
  assert.equal(
    sectionRestoreRevisionSchema.safeParse({
      sectionId: SECTION_ID,
      tenantId: TENANT,
      revisionId: REVISION_ID,
      expectedVersion: 3,
    }).success,
    true,
  );
  assert.equal(
    sectionRestoreRevisionSchema.safeParse({
      sectionId: SECTION_ID,
      tenantId: TENANT,
      revisionId: "bad",
      expectedVersion: 3,
    }).success,
    false,
  );
  assert.equal(
    sectionRestoreRevisionSchema.safeParse({
      sectionId: SECTION_ID,
      tenantId: TENANT,
      revisionId: REVISION_ID,
      expectedVersion: -1,
    }).success,
    false,
  );
});

// ---- duplicate ------------------------------------------------------------

test("sectionDuplicateSchema accepts valid shape", () => {
  assert.equal(
    sectionDuplicateSchema.safeParse({
      sourceId: SECTION_ID,
      tenantId: TENANT,
      newName: "Homepage hero — variant",
    }).success,
    true,
  );
});

test("sectionDuplicateSchema rejects empty newName", () => {
  assert.equal(
    sectionDuplicateSchema.safeParse({
      sourceId: SECTION_ID,
      tenantId: TENANT,
      newName: "",
    }).success,
    false,
  );
});

test("sectionDuplicateSchema rejects whitespace-only newName", () => {
  assert.equal(
    sectionDuplicateSchema.safeParse({
      sourceId: SECTION_ID,
      tenantId: TENANT,
      newName: "    ",
    }).success,
    false,
  );
});

test("sectionDuplicateSchema caps newName at SECTION_NAME_MAX", () => {
  assert.equal(
    sectionDuplicateSchema.safeParse({
      sourceId: SECTION_ID,
      tenantId: TENANT,
      newName: "a".repeat(141),
    }).success,
    false,
  );
});

test("sectionDuplicateSchema rejects non-uuid sourceId", () => {
  assert.equal(
    sectionDuplicateSchema.safeParse({
      sourceId: "not-a-uuid",
      tenantId: TENANT,
      newName: "Copy",
    }).success,
    false,
  );
});

test("sectionDuplicateSchema rejects non-uuid tenantId", () => {
  assert.equal(
    sectionDuplicateSchema.safeParse({
      sourceId: SECTION_ID,
      tenantId: "nope",
      newName: "Copy",
    }).success,
    false,
  );
});

// ---- capability matrix ----------------------------------------------------

test("sections.edit: editor/coordinator/admin/owner YES, viewer NO", () => {
  for (const role of ["editor", "coordinator", "admin", "owner"] as const) {
    assert.equal(
      rolePhase5HasCapability(role, "agency.site_admin.sections.edit"),
      true,
      `role=${role} should have sections.edit`,
    );
  }
  assert.equal(
    rolePhase5HasCapability("viewer", "agency.site_admin.sections.edit"),
    false,
  );
});

test("sections.publish: editor/viewer NO, coordinator/admin/owner YES", () => {
  for (const role of ["editor", "viewer"] as const) {
    assert.equal(
      rolePhase5HasCapability(role, "agency.site_admin.sections.publish"),
      false,
      `role=${role} should NOT have sections.publish`,
    );
  }
  for (const role of ["coordinator", "admin", "owner"] as const) {
    assert.equal(
      rolePhase5HasCapability(role, "agency.site_admin.sections.publish"),
      true,
      `role=${role} should have sections.publish`,
    );
  }
});
