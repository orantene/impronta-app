/**
 * Phase 5 / M3 — unit tests for page schemas + capability grants.
 *
 * Covers the no-DB surface:
 *   - pageSlugSchema: valid shapes, reserved-route rejection, shape rejection,
 *     length cap, empty rejection
 *   - pageUpsertSchema: minimum valid create, required title, slug Zod, template
 *     enum (standard_page only; homepage rejected), expectedVersion negative,
 *     canonicalUrl absolute requirement
 *   - pagePublishSchema / pageArchiveSchema / pageDeleteSchema: uuid + version
 *   - pageRestoreRevisionSchema: uuid triple
 *   - pagePreviewStartSchema: pageId + tenantId uuid
 *   - Capability matrix:
 *       pages.edit:    editor YES, coordinator YES, admin YES, owner YES, viewer NO
 *       pages.publish: editor NO, coordinator YES, admin YES, owner YES, viewer NO
 *
 * Run with: npx tsx --test src/lib/site-admin/site-admin-m3.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  AGENCY_SELECTABLE_TEMPLATE_KEYS,
  pageArchiveSchema,
  pageDeleteSchema,
  pagePreviewStartSchema,
  pagePublishSchema,
  pageRestoreRevisionSchema,
  pageSlugSchema,
  pageUpsertSchema,
  rolePhase5HasCapability,
} from "./index";

// ---- slug shape -----------------------------------------------------------

test("pageSlugSchema accepts simple + multi-segment slugs", () => {
  for (const slug of [
    "about",
    "services",
    "services/booking",
    "legal/privacy-policy",
    "hello-world",
    "a/b/c/d",
  ]) {
    assert.equal(pageSlugSchema.safeParse(slug).success, true, `slug=${slug}`);
  }
});

test("pageSlugSchema rejects reserved first segments", () => {
  for (const slug of ["admin", "admin/dashboard", "api/x", "auth/login", "_next"]) {
    assert.equal(
      pageSlugSchema.safeParse(slug).success,
      false,
      `slug=${slug} should be reserved`,
    );
  }
});

test("pageSlugSchema rejects bogus shapes", () => {
  for (const slug of [
    "",
    "/about",
    "about/",
    "About",
    "about//more",
    "about space",
    "about?query",
    "about.html",
  ]) {
    assert.equal(pageSlugSchema.safeParse(slug).success, false, `slug=${slug}`);
  }
});

test("pageSlugSchema caps length at PAGE_SLUG_MAX (240)", () => {
  const tooLong = "a".repeat(241);
  assert.equal(pageSlugSchema.safeParse(tooLong).success, false);
});

// ---- pageUpsertSchema -----------------------------------------------------

const TENANT = "11111111-1111-4111-8111-111111111111";
const MIN_UPSERT = {
  tenantId: TENANT,
  locale: "en" as const,
  slug: "about",
  templateKey: "standard_page" as const,
  templateSchemaVersion: 1,
  title: "About",
  body: "",
  hero: {},
  noindex: false,
  includeInSitemap: true,
  expectedVersion: 0,
};

test("pageUpsertSchema accepts minimum valid create", () => {
  assert.equal(pageUpsertSchema.safeParse(MIN_UPSERT).success, true);
});

test("pageUpsertSchema rejects empty title", () => {
  assert.equal(
    pageUpsertSchema.safeParse({ ...MIN_UPSERT, title: "" }).success,
    false,
  );
});

test("pageUpsertSchema rejects reserved slug", () => {
  assert.equal(
    pageUpsertSchema.safeParse({ ...MIN_UPSERT, slug: "admin/settings" }).success,
    false,
  );
});

test("pageUpsertSchema rejects homepage templateKey (agency-selectable only)", () => {
  assert.equal(
    pageUpsertSchema.safeParse({ ...MIN_UPSERT, templateKey: "homepage" }).success,
    false,
  );
});

test("pageUpsertSchema rejects negative expectedVersion", () => {
  assert.equal(
    pageUpsertSchema.safeParse({ ...MIN_UPSERT, expectedVersion: -1 }).success,
    false,
  );
});

test("pageUpsertSchema rejects non-http canonicalUrl when set", () => {
  assert.equal(
    pageUpsertSchema.safeParse({
      ...MIN_UPSERT,
      canonicalUrl: "javascript:alert(1)",
    }).success,
    false,
  );
});

test("pageUpsertSchema accepts absolute https canonicalUrl", () => {
  assert.equal(
    pageUpsertSchema.safeParse({
      ...MIN_UPSERT,
      canonicalUrl: "https://example.com/about",
    }).success,
    true,
  );
});

test("pageUpsertSchema rejects unknown tenantId shape", () => {
  assert.equal(
    pageUpsertSchema.safeParse({ ...MIN_UPSERT, tenantId: "nope" }).success,
    false,
  );
});

test("pageUpsertSchema rejects bad UUID for id", () => {
  assert.equal(
    pageUpsertSchema.safeParse({ ...MIN_UPSERT, id: "not-a-uuid" }).success,
    false,
  );
});

test("pageUpsertSchema accepts id=null (create shorthand)", () => {
  assert.equal(
    pageUpsertSchema.safeParse({ ...MIN_UPSERT, id: null }).success,
    true,
  );
});

test("AGENCY_SELECTABLE_TEMPLATE_KEYS is locked to ['standard_page']", () => {
  assert.deepEqual([...AGENCY_SELECTABLE_TEMPLATE_KEYS], ["standard_page"]);
});

// ---- lifecycle + preview shapes ------------------------------------------

const PAGE_ID = "22222222-2222-4222-8222-222222222222";
const REVISION_ID = "33333333-3333-4333-8333-333333333333";

test("pagePublishSchema requires uuid id + tenant + expectedVersion", () => {
  assert.equal(
    pagePublishSchema.safeParse({
      id: PAGE_ID,
      tenantId: TENANT,
      expectedVersion: 1,
    }).success,
    true,
  );
  assert.equal(
    pagePublishSchema.safeParse({
      id: "nope",
      tenantId: TENANT,
      expectedVersion: 1,
    }).success,
    false,
  );
});

test("pageArchiveSchema + pageDeleteSchema share the same shape", () => {
  const valid = { id: PAGE_ID, tenantId: TENANT, expectedVersion: 2 };
  assert.equal(pageArchiveSchema.safeParse(valid).success, true);
  assert.equal(pageDeleteSchema.safeParse(valid).success, true);
  assert.equal(
    pageArchiveSchema.safeParse({ ...valid, expectedVersion: -1 }).success,
    false,
  );
});

test("pageRestoreRevisionSchema requires pageId + tenantId + revisionId", () => {
  assert.equal(
    pageRestoreRevisionSchema.safeParse({
      pageId: PAGE_ID,
      tenantId: TENANT,
      revisionId: REVISION_ID,
      expectedVersion: 3,
    }).success,
    true,
  );
  assert.equal(
    pageRestoreRevisionSchema.safeParse({
      pageId: PAGE_ID,
      tenantId: TENANT,
      revisionId: "bad",
      expectedVersion: 3,
    }).success,
    false,
  );
});

test("pagePreviewStartSchema requires pageId + tenantId uuids", () => {
  assert.equal(
    pagePreviewStartSchema.safeParse({
      pageId: PAGE_ID,
      tenantId: TENANT,
    }).success,
    true,
  );
  assert.equal(
    pagePreviewStartSchema.safeParse({
      pageId: "not-a-uuid",
      tenantId: TENANT,
    }).success,
    false,
  );
});

// ---- capability matrix ----------------------------------------------------

test("pages.edit: editor/coordinator/admin/owner YES, viewer NO", () => {
  for (const role of ["editor", "coordinator", "admin", "owner"] as const) {
    assert.equal(
      rolePhase5HasCapability(role, "agency.site_admin.pages.edit"),
      true,
      `role=${role} should have pages.edit`,
    );
  }
  assert.equal(
    rolePhase5HasCapability("viewer", "agency.site_admin.pages.edit"),
    false,
  );
});

test("pages.publish: editor/viewer NO, coordinator/admin/owner YES", () => {
  for (const role of ["editor", "viewer"] as const) {
    assert.equal(
      rolePhase5HasCapability(role, "agency.site_admin.pages.publish"),
      false,
      `role=${role} should NOT have pages.publish`,
    );
  }
  for (const role of ["coordinator", "admin", "owner"] as const) {
    assert.equal(
      rolePhase5HasCapability(role, "agency.site_admin.pages.publish"),
      true,
      `role=${role} should have pages.publish`,
    );
  }
});
