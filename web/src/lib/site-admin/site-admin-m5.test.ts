/**
 * Phase 5 / M5 — unit tests for homepage composer schemas + capability grants.
 *
 * Covers the no-DB surface. DB-dependent invariants (system-ownership trigger,
 * partial unique on page_sections, snapshot freeze under concurrent section
 * edits) live in the env-gated integration suite; this file exercises only
 * pure Zod + capability logic.
 *
 *   - HOMEPAGE_SLOT_KEYS matches the template meta (hero/primary/secondary/
 *     footer-callout in M5).
 *   - HOMEPAGE_REQUIRED_SLOT_KEYS = ['hero'] in M5.
 *   - homepageMetadataSchema: trim, required title, max bounds, empty-string-
 *     as-absent for optional fields.
 *   - homepageSlotEntrySchema: uuid sectionId, non-negative sortOrder.
 *   - homepageSlotsSchema: unknown slot key rejected; duplicate sortOrder in
 *     one slot rejected; absent slots == empty lists.
 *   - homepageSaveDraftSchema: full envelope shape, uuid tenant, enum locale,
 *     expectedVersion>=0.
 *   - homepagePublishSchema / homepageRestoreRevisionSchema: envelope shape.
 *   - Capability matrix:
 *       homepage.compose: editor YES, coordinator YES, admin YES, owner YES,
 *                         viewer NO
 *       homepage.publish: editor NO,  coordinator YES, admin YES, owner YES,
 *                         viewer NO
 *
 * Run with: npx tsx --test src/lib/site-admin/site-admin-m5.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  HOMEPAGE_REQUIRED_SLOT_KEYS,
  HOMEPAGE_SLOT_KEYS,
  homepageMetadataSchema,
  homepagePublishSchema,
  homepageRestoreRevisionSchema,
  homepageSaveDraftSchema,
  homepageSlotEntrySchema,
  homepageSlotsSchema,
  rolePhase5HasCapability,
} from "./index";

const TENANT = "11111111-1111-4111-8111-111111111111";
const SECTION_A = "22222222-2222-4222-8222-222222222222";
const SECTION_B = "33333333-3333-4333-8333-333333333333";
const REVISION_ID = "44444444-4444-4444-8444-444444444444";

// ---- slot key tuples ------------------------------------------------------

test("HOMEPAGE_SLOT_KEYS matches homepage template meta (M5 set)", () => {
  assert.deepEqual([...HOMEPAGE_SLOT_KEYS].sort(), [
    "footer-callout",
    "hero",
    "primary",
    "secondary",
  ]);
});

test("HOMEPAGE_REQUIRED_SLOT_KEYS = ['hero'] in M5", () => {
  assert.deepEqual([...HOMEPAGE_REQUIRED_SLOT_KEYS], ["hero"]);
});

// ---- metadata -------------------------------------------------------------

test("homepageMetadataSchema requires title", () => {
  assert.equal(
    homepageMetadataSchema.safeParse({ title: "" }).success,
    false,
  );
});

test("homepageMetadataSchema trims title", () => {
  const result = homepageMetadataSchema.safeParse({ title: "  Hello  " });
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.title, "Hello");
});

test("homepageMetadataSchema caps title at 140", () => {
  assert.equal(
    homepageMetadataSchema.safeParse({ title: "a".repeat(141) }).success,
    false,
  );
});

test("homepageMetadataSchema caps metaDescription at 280", () => {
  assert.equal(
    homepageMetadataSchema.safeParse({
      title: "ok",
      metaDescription: "a".repeat(281),
    }).success,
    false,
  );
});

test("homepageMetadataSchema normalises empty optional strings to undefined", () => {
  const result = homepageMetadataSchema.safeParse({
    title: "ok",
    metaDescription: "",
    introTagline: "",
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.metaDescription, undefined);
    assert.equal(result.data.introTagline, undefined);
  }
});

// ---- slot entry + slot composition ---------------------------------------

test("homepageSlotEntrySchema requires uuid sectionId + non-negative sortOrder", () => {
  assert.equal(
    homepageSlotEntrySchema.safeParse({ sectionId: SECTION_A, sortOrder: 0 })
      .success,
    true,
  );
  assert.equal(
    homepageSlotEntrySchema.safeParse({ sectionId: "not-a-uuid", sortOrder: 0 })
      .success,
    false,
  );
  assert.equal(
    homepageSlotEntrySchema.safeParse({ sectionId: SECTION_A, sortOrder: -1 })
      .success,
    false,
  );
  assert.equal(
    homepageSlotEntrySchema.safeParse({ sectionId: SECTION_A, sortOrder: 1.5 })
      .success,
    false,
  );
});

test("homepageSlotsSchema rejects unknown slot key", () => {
  const result = homepageSlotsSchema.safeParse({
    mystery: [{ sectionId: SECTION_A, sortOrder: 0 }],
  });
  assert.equal(result.success, false);
});

test("homepageSlotsSchema accepts an empty object (no slots filled)", () => {
  assert.equal(homepageSlotsSchema.safeParse({}).success, true);
});

test("homepageSlotsSchema accepts one valid hero entry", () => {
  assert.equal(
    homepageSlotsSchema.safeParse({
      hero: [{ sectionId: SECTION_A, sortOrder: 0 }],
    }).success,
    true,
  );
});

test("homepageSlotsSchema rejects duplicate sortOrder within a slot", () => {
  const result = homepageSlotsSchema.safeParse({
    primary: [
      { sectionId: SECTION_A, sortOrder: 0 },
      { sectionId: SECTION_B, sortOrder: 0 },
    ],
  });
  assert.equal(result.success, false);
});

test("homepageSlotsSchema allows the same sortOrder across different slots", () => {
  const result = homepageSlotsSchema.safeParse({
    hero: [{ sectionId: SECTION_A, sortOrder: 0 }],
    primary: [{ sectionId: SECTION_B, sortOrder: 0 }],
  });
  assert.equal(result.success, true);
});

// ---- save draft -----------------------------------------------------------

const MIN_SAVE = {
  tenantId: TENANT,
  locale: "en",
  expectedVersion: 0,
  metadata: { title: "Homepage" },
  slots: {},
};

test("homepageSaveDraftSchema accepts the minimum valid envelope", () => {
  assert.equal(homepageSaveDraftSchema.safeParse(MIN_SAVE).success, true);
});

test("homepageSaveDraftSchema rejects non-uuid tenantId", () => {
  assert.equal(
    homepageSaveDraftSchema.safeParse({ ...MIN_SAVE, tenantId: "nope" })
      .success,
    false,
  );
});

test("homepageSaveDraftSchema rejects unknown locale", () => {
  assert.equal(
    homepageSaveDraftSchema.safeParse({ ...MIN_SAVE, locale: "fr" }).success,
    false,
  );
});

test("homepageSaveDraftSchema rejects negative expectedVersion", () => {
  assert.equal(
    homepageSaveDraftSchema.safeParse({ ...MIN_SAVE, expectedVersion: -1 })
      .success,
    false,
  );
});

test("homepageSaveDraftSchema rejects non-integer expectedVersion", () => {
  assert.equal(
    homepageSaveDraftSchema.safeParse({ ...MIN_SAVE, expectedVersion: 1.5 })
      .success,
    false,
  );
});

// ---- publish --------------------------------------------------------------

test("homepagePublishSchema accepts valid envelope", () => {
  assert.equal(
    homepagePublishSchema.safeParse({
      tenantId: TENANT,
      locale: "en",
      expectedVersion: 2,
    }).success,
    true,
  );
});

test("homepagePublishSchema rejects non-uuid tenantId", () => {
  assert.equal(
    homepagePublishSchema.safeParse({
      tenantId: "bad",
      locale: "en",
      expectedVersion: 2,
    }).success,
    false,
  );
});

// ---- restore revision -----------------------------------------------------

test("homepageRestoreRevisionSchema accepts valid envelope", () => {
  assert.equal(
    homepageRestoreRevisionSchema.safeParse({
      tenantId: TENANT,
      locale: "en",
      revisionId: REVISION_ID,
      expectedVersion: 3,
    }).success,
    true,
  );
});

test("homepageRestoreRevisionSchema rejects non-uuid revisionId", () => {
  assert.equal(
    homepageRestoreRevisionSchema.safeParse({
      tenantId: TENANT,
      locale: "en",
      revisionId: "bad",
      expectedVersion: 3,
    }).success,
    false,
  );
});

// ---- capability matrix ----------------------------------------------------

test("homepage.compose: editor/coordinator/admin/owner YES, viewer NO", () => {
  for (const role of ["editor", "coordinator", "admin", "owner"] as const) {
    assert.equal(
      rolePhase5HasCapability(role, "agency.site_admin.homepage.compose"),
      true,
      `role=${role} should have homepage.compose`,
    );
  }
  assert.equal(
    rolePhase5HasCapability("viewer", "agency.site_admin.homepage.compose"),
    false,
  );
});

test("homepage.publish: editor/viewer NO, coordinator/admin/owner YES", () => {
  for (const role of ["editor", "viewer"] as const) {
    assert.equal(
      rolePhase5HasCapability(role, "agency.site_admin.homepage.publish"),
      false,
      `role=${role} should NOT have homepage.publish`,
    );
  }
  for (const role of ["coordinator", "admin", "owner"] as const) {
    assert.equal(
      rolePhase5HasCapability(role, "agency.site_admin.homepage.publish"),
      true,
      `role=${role} should have homepage.publish`,
    );
  }
});
