/**
 * Phase 5 — M0 smoke tests.
 *
 * Covers:
 *   - preview JWT sign/verify round trip
 *   - preview JWT expired/malformed/wrong-signature rejection
 *   - cache tag helper shape
 *   - capability role matrix (editor vs admin vs coordinator)
 *   - reserved slug refinement
 *   - token registry: allow + reject non-overridable + reject unknown
 *   - template / section migration runner
 *
 * Run with: npx tsx --test src/lib/site-admin/site-admin.test.ts
 */

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";

process.env.PREVIEW_JWT_SECRET =
  process.env.PREVIEW_JWT_SECRET ??
  "test-secret-at-least-thirty-two-chars-long-for-hs256";

import {
  tagFor,
  tenantBustTags,
  rolePhase5HasCapability,
  PHASE_5_CAPABILITIES,
  isReservedSlug,
  validateThemePatch,
  signPreviewJwt,
  verifyPreviewJwt,
  TEMPLATE_REGISTRY,
  SECTION_REGISTRY,
} from "./index";

const TENANT = "11111111-2222-3333-4444-555555555555";
const ACTOR = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

test("tagFor composes tenant-scoped cache tags", () => {
  assert.equal(tagFor(TENANT, "identity"), `tenant:${TENANT}:identity`);
  assert.equal(tagFor(TENANT, "branding"), `tenant:${TENANT}:branding`);
  assert.equal(
    tagFor(TENANT, "pages", { id: "page-123" }),
    `tenant:${TENANT}:pages:page-123`,
  );
  assert.equal(
    tagFor(TENANT, "homepage", { locale: "en" }),
    `tenant:${TENANT}:homepage:en`,
  );
});

test("tenantBustTags returns one per surface", () => {
  const tags = tenantBustTags(TENANT);
  assert.ok(tags.length >= 5);
  for (const t of tags) assert.ok(t.startsWith(`tenant:${TENANT}:`));
});

test("tagFor throws on missing tenantId", () => {
  assert.throws(() => tagFor("" as unknown as string, "identity"));
});

test("phase-5 capabilities: editor has edit, not publish", () => {
  assert.equal(
    rolePhase5HasCapability("editor", "agency.site_admin.pages.edit"),
    true,
  );
  assert.equal(
    rolePhase5HasCapability("editor", "agency.site_admin.pages.publish"),
    false,
  );
  assert.equal(
    rolePhase5HasCapability("editor", "agency.site_admin.branding.edit"),
    false,
  );
});

test("phase-5 capabilities: coordinator can publish pages, not design", () => {
  assert.equal(
    rolePhase5HasCapability("coordinator", "agency.site_admin.pages.publish"),
    true,
  );
  assert.equal(
    rolePhase5HasCapability("coordinator", "agency.site_admin.design.publish"),
    false,
  );
});

test("phase-5 capabilities: admin has every registered capability", () => {
  for (const cap of PHASE_5_CAPABILITIES) {
    assert.equal(
      rolePhase5HasCapability("admin", cap),
      true,
      `admin missing ${cap}`,
    );
  }
});

test("phase-5 capabilities: owner has every registered capability (same as admin)", () => {
  for (const cap of PHASE_5_CAPABILITIES) {
    assert.equal(rolePhase5HasCapability("owner", cap), true);
  }
});

test("phase-5 capabilities: sections.publish is coordinator+, not editor", () => {
  assert.equal(
    rolePhase5HasCapability("editor", "agency.site_admin.sections.edit"),
    true,
  );
  assert.equal(
    rolePhase5HasCapability("editor", "agency.site_admin.sections.publish"),
    false,
  );
  assert.equal(
    rolePhase5HasCapability(
      "coordinator",
      "agency.site_admin.sections.publish",
    ),
    true,
  );
  assert.equal(
    rolePhase5HasCapability("viewer", "agency.site_admin.sections.edit"),
    false,
  );
});

test("reserved slugs block first segment only", () => {
  assert.equal(isReservedSlug("admin"), true);
  assert.equal(isReservedSlug("admin/foo"), true);
  assert.equal(isReservedSlug("/admin"), true);
  assert.equal(isReservedSlug("about"), false);
  assert.equal(isReservedSlug("auth"), true);
  assert.equal(isReservedSlug("api/v1"), true);
});

test("validateThemePatch accepts agency-configurable keys", () => {
  const result = validateThemePatch({
    "color.primary": "#aabbcc",
    "color.accent": "#112233",
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.normalized, {
      "color.primary": "#aabbcc",
      "color.accent": "#112233",
    });
  }
});

test("validateThemePatch rejects non-overridable tokens", () => {
  const result = validateThemePatch({
    "color.background": "#ffffff",
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.rejected.includes("color.background"));
    assert.match(result.reasons["color.background"], /Not agency-configurable/);
  }
});

test("validateThemePatch rejects unknown keys", () => {
  const result = validateThemePatch({ "color.mystery": "#000000" });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.rejected.includes("color.mystery"));
    assert.match(result.reasons["color.mystery"], /Unknown token/);
  }
});

test("validateThemePatch rejects invalid values for allowed keys", () => {
  const result = validateThemePatch({ "color.primary": "notacolor" });
  assert.equal(result.ok, false);
});

test("preview JWT round-trip verifies", () => {
  const { token } = signPreviewJwt({
    tenantId: TENANT,
    actorProfileId: ACTOR,
    subject: "branding",
  });
  const verified = verifyPreviewJwt(token);
  assert.equal(verified.ok, true);
  if (verified.ok) {
    assert.equal(verified.claims.tenantId, TENANT);
    assert.equal(verified.claims.actorProfileId, ACTOR);
    assert.equal(verified.claims.subject, "branding");
  }
});

test("preview JWT rejects bad signature", () => {
  const { token } = signPreviewJwt({
    tenantId: TENANT,
    actorProfileId: ACTOR,
    subject: "branding",
  });
  const parts = token.split(".");
  parts[2] =
    "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  const tampered = parts.join(".");
  const verified = verifyPreviewJwt(tampered);
  assert.equal(verified.ok, false);
  if (!verified.ok) assert.equal(verified.reason, "bad_signature");
});

test("preview JWT rejects malformed token", () => {
  const verified = verifyPreviewJwt("not.a.jwt.at-all");
  assert.equal(verified.ok, false);
});

test("preview JWT rejects expired token (simulated via past iat/exp)", () => {
  const prev = process.env.PREVIEW_JWT_SECRET!;
  // Craft an expired token by signing manually with iat/exp in the past.
  function b64url(buf: Buffer | string) {
    const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
    return b
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
  }
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const past = Math.floor(Date.now() / 1000) - 9999;
  const body = b64url(
    JSON.stringify({
      iss: "impronta-preview",
      sub: ACTOR,
      tid: TENANT,
      sid: "branding",
      iat: past - 900,
      exp: past,
      jti: "test",
    }),
  );
  const sig = b64url(
    createHmac("sha256", prev).update(`${header}.${body}`).digest(),
  );
  const token = `${header}.${body}.${sig}`;
  const verified = verifyPreviewJwt(token);
  assert.equal(verified.ok, false);
  if (!verified.ok) assert.equal(verified.reason, "expired");
});

test("template registry contains homepage + standard_page at v1", () => {
  assert.ok(TEMPLATE_REGISTRY.homepage);
  assert.ok(TEMPLATE_REGISTRY.standard_page);
  assert.equal(TEMPLATE_REGISTRY.homepage.currentVersion, 1);
  assert.equal(TEMPLATE_REGISTRY.standard_page.currentVersion, 1);
  assert.ok(TEMPLATE_REGISTRY.homepage.meta.systemOwned);
  assert.equal(TEMPLATE_REGISTRY.standard_page.meta.systemOwned, false);
});

test("section registry contains hero + matching current schema", () => {
  assert.ok(SECTION_REGISTRY.hero);
  assert.equal(SECTION_REGISTRY.hero.currentVersion, 1);
  const schema = SECTION_REGISTRY.hero.schemasByVersion[1];
  const parsed = schema.safeParse({ headline: "Hello" });
  assert.equal(parsed.success, true);
  const bad = schema.safeParse({ headline: "" });
  assert.equal(bad.success, false);
});
