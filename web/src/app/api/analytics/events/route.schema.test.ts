/**
 * Unit tests for the analytics/events route body schema.
 *
 * Tests the tenant_id UUID validation and referrer field added in ANALYTICS-1.
 * The schema is duplicated here for isolation; keep it in sync with route.ts.
 *
 * Run with:
 *   npx tsx --test src/app/api/analytics/events/route.schema.test.ts
 */

import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { pgUuidSchema } from "@/lib/site-admin/validators";

// Mirror the bodySchema from route.ts so we can test it without importing Next.js server internals.
const bodySchema = z.object({
  name: z.string().min(1).max(128),
  payload: z.record(z.string(), z.unknown()).optional(),
  session_id: z.string().max(256).nullable().optional(),
  talent_id: pgUuidSchema().nullable().optional(),
  tenant_id: pgUuidSchema().nullable().optional(),
  referrer: z.string().max(2048).nullable().optional(),
  path: z.string().max(2048).nullable().optional(),
  locale: z.string().max(16).nullable().optional(),
});

const VALID_UUID = "11111111-1111-1111-1111-111111111111";
const DEMO_UUID = "33333333-3333-3333-3333-333333333333"; // valid Postgres UUID, fails strict RFC 9562

// ---------------------------------------------------------------------------
// tenant_id field
// ---------------------------------------------------------------------------

test("tenant_id: accepts a valid RFC 9562 UUID", () => {
  const result = bodySchema.safeParse({ name: "view_site_page", tenant_id: VALID_UUID });
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.tenant_id, VALID_UUID);
});

test("tenant_id: accepts a demo/seed UUID that is valid Postgres but non-RFC-9562", () => {
  const result = bodySchema.safeParse({ name: "view_site_page", tenant_id: DEMO_UUID });
  assert.equal(result.success, true, "demo UUIDs must pass pgUuidSchema");
  if (result.success) assert.equal(result.data.tenant_id, DEMO_UUID);
});

test("tenant_id: accepts null (opt-out / not yet known)", () => {
  const result = bodySchema.safeParse({ name: "view_site_page", tenant_id: null });
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.tenant_id, null);
});

test("tenant_id: accepts absent (omitted = undefined)", () => {
  const result = bodySchema.safeParse({ name: "view_site_page" });
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.tenant_id, undefined);
});

test("tenant_id: rejects a non-UUID string (spoofing guard)", () => {
  const result = bodySchema.safeParse({ name: "view_site_page", tenant_id: "not-a-uuid" });
  assert.equal(result.success, false, "non-UUID must be rejected to prevent naive spoofing");
});

test("tenant_id: rejects a plain integer string", () => {
  const result = bodySchema.safeParse({ name: "view_site_page", tenant_id: "12345" });
  assert.equal(result.success, false);
});

// ---------------------------------------------------------------------------
// referrer field
// ---------------------------------------------------------------------------

test("referrer: accepts a valid URL string", () => {
  const referrer = "https://example.com/some/page";
  const result = bodySchema.safeParse({ name: "view_site_page", referrer });
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.referrer, referrer);
});

test("referrer: accepts null (direct traffic / no referrer)", () => {
  const result = bodySchema.safeParse({ name: "view_site_page", referrer: null });
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.referrer, null);
});

test("referrer: accepts absent", () => {
  const result = bodySchema.safeParse({ name: "view_site_page" });
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.referrer, undefined);
});

test("referrer: rejects strings longer than 2048 chars", () => {
  const result = bodySchema.safeParse({ name: "view_site_page", referrer: "x".repeat(2049) });
  assert.equal(result.success, false);
});

// ---------------------------------------------------------------------------
// Combined: a full view_site_page-shaped body
// ---------------------------------------------------------------------------

test("full view_site_page body passes validation", () => {
  const body = {
    name: "view_site_page",
    payload: { surface: "talent-site", page_slug: "home" },
    tenant_id: VALID_UUID,
    referrer: "https://google.com/search?q=talent",
    path: "/t/site/my-talent",
    locale: "en",
  };
  const result = bodySchema.safeParse(body);
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.tenant_id, VALID_UUID);
    assert.equal(result.data.referrer, "https://google.com/search?q=talent");
  }
});

// ---------------------------------------------------------------------------
// Backward-compat: existing bodies without tenant_id/referrer still parse
// ---------------------------------------------------------------------------

test("legacy body without tenant_id or referrer still validates", () => {
  const body = {
    name: "view_talent_profile",
    payload: { locale: "es" },
    path: "/t/sofía",
    locale: "es",
  };
  const result = bodySchema.safeParse(body);
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.tenant_id, undefined);
    assert.equal(result.data.referrer, undefined);
  }
});
