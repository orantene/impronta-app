/**
 * preview-surface-target.test.ts — X8 (Cross-surface stretch).
 *
 * Test runner: node:test + node:assert/strict (tsx --test)
 * Run:  node_modules/.bin/tsx --test src/components/builder-lab/preview-surface-target.test.ts
 *
 * Proves the PURE "target surface → preview config selection" mapping the Lab
 * component preview stage uses to hydrate a connected card against a real
 * surface's `previewSubjectKind`, WITHOUT importing any React. The table MUST
 * mirror `builder-core/config.ts` 1:1 (talent_page → "talent"; cms_page /
 * site_shell → null), so this test is the regression guard against drift.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  PREVIEW_SURFACE_DESCRIPTORS,
  resolvePreviewSurfaceDescriptor,
  previewSubjectKindForSurface,
  pickerKindForSurface,
  type PreviewSurfaceTarget,
} from "./preview-surface-target";

// ── previewSubjectKind mirrors the four config builders ─────────────────────

test("talent_profile hydrates against the talent subject (talent_page config)", () => {
  assert.equal(previewSubjectKindForSurface("talent_profile"), "talent");
});

test("the shells + workspace page hydrate against the tenant default (null)", () => {
  // buildSiteShellBuilderConfig + buildCmsPageBuilderConfig all set null.
  assert.equal(previewSubjectKindForSurface("talent_shell"), null);
  assert.equal(previewSubjectKindForSurface("workspace_page"), null);
  assert.equal(previewSubjectKindForSurface("workspace_shell"), null);
});

test("the generic Lab default keeps F5 behaviour (null = tenant default)", () => {
  assert.equal(previewSubjectKindForSurface("lab"), null);
});

// ── default preservation: no surface chosen → generic Lab default ───────────

test("unset / unknown target falls back to the Lab default (never breaks)", () => {
  assert.equal(previewSubjectKindForSurface(null), null);
  assert.equal(previewSubjectKindForSurface(undefined), null);
  assert.equal(
    previewSubjectKindForSurface("bogus" as PreviewSurfaceTarget),
    null,
  );
  assert.equal(resolvePreviewSurfaceDescriptor(null).target, "lab");
  assert.equal(resolvePreviewSurfaceDescriptor("bogus" as PreviewSurfaceTarget).target, "lab");
});

// ── pickerKind is the surface AUDIENCE (orthogonal to previewSubjectKind) ────

test("talent surfaces pick a talent subject; workspace surfaces pick a workspace", () => {
  assert.equal(pickerKindForSurface("talent_profile"), "talent");
  assert.equal(pickerKindForSurface("talent_shell"), "talent");
  assert.equal(pickerKindForSurface("workspace_page"), "workspace");
  assert.equal(pickerKindForSurface("workspace_shell"), "workspace");
});

test("the Lab default shows no subject picker", () => {
  assert.equal(pickerKindForSurface("lab"), null);
});

test("a shell hydrates against the tenant (null) yet still picks an audience subject", () => {
  // This is the orthogonality the descriptor encodes: previewSubjectKind null,
  // pickerKind non-null — the operator scopes the canvas render data to a real
  // talent/workspace even though the config's preview subject is the tenant.
  const talentShell = resolvePreviewSurfaceDescriptor("talent_shell");
  assert.equal(talentShell.previewSubjectKind, null);
  assert.equal(talentShell.pickerKind, "talent");
});

// ── table integrity ─────────────────────────────────────────────────────────

test("exactly the five targets, each unique, Lab listed first", () => {
  const targets = PREVIEW_SURFACE_DESCRIPTORS.map((d) => d.target);
  assert.deepEqual(targets, [
    "lab",
    "talent_profile",
    "talent_shell",
    "workspace_page",
    "workspace_shell",
  ]);
  assert.equal(new Set(targets).size, targets.length);
});

test("every descriptor has a non-empty label", () => {
  for (const d of PREVIEW_SURFACE_DESCRIPTORS) {
    assert.ok(d.label.length > 0, `missing label for ${d.target}`);
  }
});
