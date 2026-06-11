/**
 * section-embed-preview-subject.test.ts — WS4 (Architecture §D).
 *
 * Test runner: node:test + node:assert/strict (tsx --test)
 * Run:  node_modules/.bin/tsx --test src/lib/site-admin/builder-node/section-embed-preview-subject.test.ts
 *
 * Proves the previewSubject scoping rule that the section-embed renderer relies
 * on, WITHOUT importing the renderer's React/section-Component graph:
 *   - matching kind  → effective tenant id = previewSubject.id
 *   - null subject   → active tenant unchanged (published default, byte-identical)
 *   - mismatched kind / non-subject section → active tenant unchanged
 * plus the workspace_profile data-source scoping helper.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveSectionEmbedSubjectScope,
  sectionEmbedPreviewSubjectKind,
} from "./section-embed-preview-subject";
import { resolveWorkspaceProfileSubjectTenantId } from "./data-bindings";

// ── subject-kind mapping ────────────────────────────────────────────────────

test("the three named freeform resolvers map to the workspace subject", () => {
  assert.equal(sectionEmbedPreviewSubjectKind("featured_talent"), "workspace");
  assert.equal(sectionEmbedPreviewSubjectKind("location_discovery"), "workspace");
  assert.equal(sectionEmbedPreviewSubjectKind("talent_type_grid"), "workspace");
});

test("pure-render sections have no subject kind (never rescope)", () => {
  assert.equal(sectionEmbedPreviewSubjectKind("hero"), null);
  assert.equal(sectionEmbedPreviewSubjectKind("testimonials_trio"), null);
});

// ── scope resolution ────────────────────────────────────────────────────────

test("null previewSubject → active tenant id + locale unchanged (published default)", () => {
  const scope = resolveSectionEmbedSubjectScope({
    sectionTypeKey: "featured_talent",
    tenantId: "tenant-active",
    locale: "en",
    previewSubject: null,
  });
  assert.deepEqual(scope, { tenantId: "tenant-active", locale: "en" });
});

test("omitted previewSubject → active tenant unchanged", () => {
  const scope = resolveSectionEmbedSubjectScope({
    sectionTypeKey: "featured_talent",
    tenantId: "tenant-active",
    locale: "en",
  });
  assert.deepEqual(scope, { tenantId: "tenant-active", locale: "en" });
});

test("matching kind → effective tenant id = previewSubject.id (+ subject locale)", () => {
  const scope = resolveSectionEmbedSubjectScope({
    sectionTypeKey: "location_discovery",
    tenantId: "tenant-active",
    locale: "en",
    previewSubject: { kind: "workspace", id: "ws-chosen", locale: "es" },
  });
  assert.equal(scope.tenantId, "ws-chosen");
  assert.equal(scope.locale, "es");
});

test("matching kind without subject locale keeps the context locale", () => {
  const scope = resolveSectionEmbedSubjectScope({
    sectionTypeKey: "talent_type_grid",
    tenantId: "tenant-active",
    locale: "en",
    previewSubject: { kind: "workspace", id: "ws-chosen" },
  });
  assert.equal(scope.tenantId, "ws-chosen");
  assert.equal(scope.locale, "en");
});

test("mismatched kind → active tenant unchanged (talent subject, workspace section)", () => {
  const scope = resolveSectionEmbedSubjectScope({
    sectionTypeKey: "featured_talent",
    tenantId: "tenant-active",
    locale: "en",
    previewSubject: { kind: "talent", id: "tal-1" },
  });
  assert.deepEqual(scope, { tenantId: "tenant-active", locale: "en" });
});

test("non-subject section → active tenant unchanged even under a matching-kind subject", () => {
  const scope = resolveSectionEmbedSubjectScope({
    sectionTypeKey: "hero",
    tenantId: "tenant-active",
    locale: "en",
    previewSubject: { kind: "workspace", id: "ws-chosen" },
  });
  assert.deepEqual(scope, { tenantId: "tenant-active", locale: "en" });
});

// ── workspace_profile data-source scoping ────────────────────────────────────

test("resolveWorkspaceProfileSubjectTenantId rescopes only for a workspace subject", () => {
  // null subject → active tenant
  assert.equal(
    resolveWorkspaceProfileSubjectTenantId({
      sourceKey: "workspace_profile",
      tenantId: "tenant-active",
      previewSubject: null,
    }),
    "tenant-active",
  );
  // workspace subject → subject id
  assert.equal(
    resolveWorkspaceProfileSubjectTenantId({
      sourceKey: "workspace_profile",
      tenantId: "tenant-active",
      previewSubject: { kind: "workspace", id: "ws-9" },
    }),
    "ws-9",
  );
  // talent subject → unchanged (workspace_profile is workspace-scoped)
  assert.equal(
    resolveWorkspaceProfileSubjectTenantId({
      sourceKey: "workspace_profile",
      tenantId: "tenant-active",
      previewSubject: { kind: "talent", id: "tal-9" },
    }),
    "tenant-active",
  );
  // a different source key never rescopes
  assert.equal(
    resolveWorkspaceProfileSubjectTenantId({
      sourceKey: "featured_talent_profiles",
      tenantId: "tenant-active",
      previewSubject: { kind: "workspace", id: "ws-9" },
    }),
    "tenant-active",
  );
});
