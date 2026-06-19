/**
 * surface-allowed-for-target.test.ts — X3 tighten-only invariant predicate.
 *
 * Test runner: node:test + node:assert/strict (tsx --test)
 * Run:  node_modules/.bin/tsx --test src/lib/site-admin/add-gallery/surface-allowed-for-target.test.ts
 *
 * Covers `surfaceAllowedForTarget` from `surface-keys.ts`:
 *   • "both" and "platform" targets permit all four tenant surfaces.
 *   • "talent" target permits only talent_profile and talent_shell.
 *   • "workspace" target permits only workspace_page and workspace_shell.
 *   • Cross-target combinations are correctly rejected.
 *
 * Imported DIRECTLY from `surface-keys.ts`, not the `add-gallery` barrel — the
 * barrel transitively pulls a `.css` side-effect that breaks the tsx test runner.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  surfaceAllowedForTarget,
  CATALOG_SURFACE_KEYS,
} from "./surface-keys";

// ── "both" target — all surfaces permitted ──────────────────────────────────

test('surfaceAllowedForTarget: "both" permits all four tenant surfaces', () => {
  for (const sk of CATALOG_SURFACE_KEYS) {
    assert.equal(
      surfaceAllowedForTarget("both", sk),
      true,
      `"both" should permit ${sk}`,
    );
  }
});

// ── "platform" target — all surfaces permitted ──────────────────────────────

test('surfaceAllowedForTarget: "platform" permits all four tenant surfaces', () => {
  for (const sk of CATALOG_SURFACE_KEYS) {
    assert.equal(
      surfaceAllowedForTarget("platform", sk),
      true,
      `"platform" should permit ${sk}`,
    );
  }
});

// ── "talent" target — only talent_profile and talent_shell ──────────────────

test('surfaceAllowedForTarget: "talent" permits talent_profile', () => {
  assert.equal(surfaceAllowedForTarget("talent", "talent_profile"), true);
});

test('surfaceAllowedForTarget: "talent" permits talent_shell', () => {
  assert.equal(surfaceAllowedForTarget("talent", "talent_shell"), true);
});

test('surfaceAllowedForTarget: "talent" rejects workspace_page', () => {
  assert.equal(surfaceAllowedForTarget("talent", "workspace_page"), false);
});

test('surfaceAllowedForTarget: "talent" rejects workspace_shell', () => {
  assert.equal(surfaceAllowedForTarget("talent", "workspace_shell"), false);
});

// ── "workspace" target — only workspace_page and workspace_shell ────────────

test('surfaceAllowedForTarget: "workspace" permits workspace_page', () => {
  assert.equal(surfaceAllowedForTarget("workspace", "workspace_page"), true);
});

test('surfaceAllowedForTarget: "workspace" permits workspace_shell', () => {
  assert.equal(surfaceAllowedForTarget("workspace", "workspace_shell"), true);
});

test('surfaceAllowedForTarget: "workspace" rejects talent_profile', () => {
  assert.equal(surfaceAllowedForTarget("workspace", "talent_profile"), false);
});

test('surfaceAllowedForTarget: "workspace" rejects talent_shell', () => {
  assert.equal(surfaceAllowedForTarget("workspace", "talent_shell"), false);
});

// ── cross-target symmetry check ──────────────────────────────────────────────

test("surfaceAllowedForTarget: talent-only surfaces are rejected by workspace and vice versa", () => {
  const talentSurfaces = ["talent_profile", "talent_shell"] as const;
  const workspaceSurfaces = ["workspace_page", "workspace_shell"] as const;

  for (const sk of talentSurfaces) {
    assert.equal(
      surfaceAllowedForTarget("workspace", sk),
      false,
      `workspace target should reject ${sk}`,
    );
  }
  for (const sk of workspaceSurfaces) {
    assert.equal(
      surfaceAllowedForTarget("talent", sk),
      false,
      `talent target should reject ${sk}`,
    );
  }
});
