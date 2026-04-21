/**
 * Phase 5 / M6 — unit tests for governed design controls.
 *
 * Covers the no-DB surface:
 *   - Token registry: listAgencyConfigurableTokens excludes platform-only
 *     tokens; every agency-configurable token has a validator + default.
 *   - validateThemePatch: unknown keys rejected, non-configurable rejected
 *     (even when registered), invalid values rejected with per-key reasons,
 *     valid patches normalise.
 *   - designPatchSchema (form layer): same rejections as validateThemePatch
 *     but the errors surface as Zod issues on `patch.<key>`.
 *   - designSaveDraftSchema / designPublishSchema / designRestoreRevisionSchema:
 *     envelope shape — uuid tenantId, non-negative expectedVersion, uuid
 *     revisionId for restore.
 *   - Capability matrix:
 *       design.edit:    admin YES, owner YES; editor/coordinator/viewer NO.
 *       design.publish: admin YES, owner YES; editor/coordinator/viewer NO.
 *   - Token projection:
 *       resolveDesignTokens layers defaults + live; unknown keys dropped.
 *       designTokensToCssVars emits --token-color-* for color tokens.
 *       designTokensToDataAttrs emits data-token-* for enum tokens.
 *       listProjectedTokens covers every agency-configurable token so a
 *       new token can't silently land without a UI hook.
 *
 * Run with: npx tsx --test src/lib/site-admin/site-admin-m6.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  TOKEN_REGISTRY,
  designPatchSchema,
  designPublishSchema,
  designRestoreRevisionSchema,
  designSaveDraftSchema,
  designTokensToCssVars,
  designTokensToDataAttrs,
  isTokenOverridable,
  listAgencyConfigurableTokens,
  listProjectedTokens,
  resolveDesignTokens,
  rolePhase5HasCapability,
  tokenDefaults,
  validateThemePatch,
} from "./index";

const TENANT = "11111111-1111-4111-8111-111111111111";
const REVISION_ID = "22222222-2222-4222-8222-222222222222";

// ---- registry sanity ------------------------------------------------------

test("every agency-configurable token has a validator and a default value", () => {
  const list = listAgencyConfigurableTokens();
  assert.ok(list.length > 0, "expected at least one configurable token");
  for (const spec of list) {
    assert.equal(typeof spec.validator.safeParse, "function");
    assert.equal(
      typeof spec.defaultValue,
      "string",
      `${spec.key} default must be string`,
    );
    assert.ok(
      spec.defaultValue.length > 0,
      `${spec.key} default must be non-empty`,
    );
  }
});

test("platform-only tokens are reported as non-overridable", () => {
  assert.equal(isTokenOverridable("color.background"), false);
  assert.equal(isTokenOverridable("spacing.scale"), false);
});

// ---- validateThemePatch ---------------------------------------------------

test("validateThemePatch rejects unknown keys", () => {
  const res = validateThemePatch({ "not.a.token": "x" });
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.deepEqual(res.rejected, ["not.a.token"]);
    assert.match(res.reasons["not.a.token"] ?? "", /unknown/i);
  }
});

test("validateThemePatch rejects non-configurable tokens even if registered", () => {
  const res = validateThemePatch({ "color.background": "#ffffff" });
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.deepEqual(res.rejected, ["color.background"]);
    assert.match(
      res.reasons["color.background"] ?? "",
      /not agency-configurable/i,
    );
  }
});

test("validateThemePatch rejects invalid per-key values", () => {
  const res = validateThemePatch({
    "color.primary": "not-a-hex",
    "radius.base": "extra-large",
  });
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.ok(res.rejected.includes("color.primary"));
    assert.ok(res.rejected.includes("radius.base"));
  }
});

test("validateThemePatch normalises a valid patch", () => {
  const res = validateThemePatch({
    "color.primary": "#112233",
    "typography.heading-preset": "serif",
  });
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.normalized["color.primary"], "#112233");
    assert.equal(res.normalized["typography.heading-preset"], "serif");
  }
});

// ---- designPatchSchema (form layer) --------------------------------------

test("designPatchSchema surfaces Zod issues keyed by token", () => {
  const res = designPatchSchema.safeParse({
    "color.primary": "nope",
    "color.background": "#ffffff",
  });
  assert.equal(res.success, false);
  if (!res.success) {
    const keys = res.error.issues.map((i) => i.path.join("."));
    assert.ok(keys.includes("color.primary"));
    assert.ok(keys.includes("color.background"));
  }
});

test("designPatchSchema returns normalised Record<string,string> on valid patch", () => {
  const res = designPatchSchema.safeParse({ "color.accent": "#abc" });
  assert.equal(res.success, true);
  if (res.success) {
    assert.deepEqual(res.data, { "color.accent": "#abc" });
  }
});

// ---- envelopes -----------------------------------------------------------

test("designSaveDraftSchema requires uuid tenantId + non-negative expectedVersion", () => {
  const bad = designSaveDraftSchema.safeParse({
    tenantId: "not-a-uuid",
    expectedVersion: -1,
    patch: {},
  });
  assert.equal(bad.success, false);

  const good = designSaveDraftSchema.safeParse({
    tenantId: TENANT,
    expectedVersion: 0,
    patch: {},
  });
  assert.equal(good.success, true);
});

test("designPublishSchema envelope shape", () => {
  const res = designPublishSchema.safeParse({
    tenantId: TENANT,
    expectedVersion: 3,
  });
  assert.equal(res.success, true);
});

test("designRestoreRevisionSchema requires uuid revisionId", () => {
  const bad = designRestoreRevisionSchema.safeParse({
    tenantId: TENANT,
    revisionId: "not-a-uuid",
    expectedVersion: 0,
  });
  assert.equal(bad.success, false);

  const good = designRestoreRevisionSchema.safeParse({
    tenantId: TENANT,
    revisionId: REVISION_ID,
    expectedVersion: 0,
  });
  assert.equal(good.success, true);
});

// ---- capability matrix ---------------------------------------------------

test("capability matrix: design.edit is admin+ only", () => {
  assert.equal(rolePhase5HasCapability("viewer", "agency.site_admin.design.edit"), false);
  assert.equal(rolePhase5HasCapability("editor", "agency.site_admin.design.edit"), false);
  assert.equal(
    rolePhase5HasCapability("coordinator", "agency.site_admin.design.edit"),
    false,
  );
  assert.equal(rolePhase5HasCapability("admin", "agency.site_admin.design.edit"), true);
  assert.equal(rolePhase5HasCapability("owner", "agency.site_admin.design.edit"), true);
});

test("capability matrix: design.publish is admin+ only", () => {
  assert.equal(
    rolePhase5HasCapability("viewer", "agency.site_admin.design.publish"),
    false,
  );
  assert.equal(
    rolePhase5HasCapability("editor", "agency.site_admin.design.publish"),
    false,
  );
  assert.equal(
    rolePhase5HasCapability("coordinator", "agency.site_admin.design.publish"),
    false,
  );
  assert.equal(
    rolePhase5HasCapability("admin", "agency.site_admin.design.publish"),
    true,
  );
  assert.equal(
    rolePhase5HasCapability("owner", "agency.site_admin.design.publish"),
    true,
  );
});

// ---- token projection ----------------------------------------------------

test("resolveDesignTokens layers defaults + live overrides", () => {
  const tokens = resolveDesignTokens({
    theme_json: { "color.primary": "#abcdef" },
  });
  assert.equal(tokens["color.primary"], "#abcdef");
  // Untouched tokens fall through to registry defaults.
  assert.equal(tokens["color.secondary"], TOKEN_REGISTRY["color.secondary"].defaultValue);
});

test("resolveDesignTokens drops unknown keys silently", () => {
  const tokens = resolveDesignTokens({
    theme_json: { "not.a.token": "x" },
  });
  assert.equal(tokens["not.a.token"], undefined);
});

test("resolveDesignTokens returns bare defaults on null branding", () => {
  const tokens = resolveDesignTokens(null);
  assert.deepEqual(tokens, tokenDefaults());
});

test("designTokensToCssVars emits --token-color-* for color tokens", () => {
  const vars = designTokensToCssVars({
    "color.primary": "#123456",
    "color.accent": "#abcdef",
    // An enum token should NOT land as a CSS var.
    "typography.heading-preset": "serif",
  });
  assert.equal(vars["--token-color-primary"], "#123456");
  assert.equal(vars["--token-color-accent"], "#abcdef");
  assert.equal(vars["--token-color-heading-preset"], undefined);
});

test("designTokensToDataAttrs emits data-token-* for enum tokens", () => {
  const attrs = designTokensToDataAttrs({
    "typography.heading-preset": "serif",
    "radius.base": "lg",
    // A color token should NOT land as a data-attr.
    "color.primary": "#111111",
  });
  assert.equal(attrs["data-token-typography-heading-preset"], "serif");
  assert.equal(attrs["data-token-radius-base"], "lg");
  assert.equal(attrs["data-token-color-primary"], undefined);
});

test("listProjectedTokens covers every agency-configurable token", () => {
  const configurable = new Set(listAgencyConfigurableTokens().map((s) => s.key));
  const projected = new Set(listProjectedTokens().map((s) => s.key));
  for (const key of configurable) {
    assert.ok(
      projected.has(key),
      `token ${key} is agency-configurable but has no projection (css var or data-attr)`,
    );
  }
});
