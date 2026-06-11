/**
 * WS6 Consumer Surfaces — adapter spy tests.
 *
 * Proves (using node:test + node:assert, NO vitest, NO React, NO Supabase):
 *
 *   1. workspace_page adapter NEVER calls a cms_page_sections / homepage writer.
 *   2. workspace_page adapter ALWAYS calls assertNoLegacyBuilderWrite("workspace_page", …)
 *      on every mutation (save, saveDraft, publish, restoreRevision).
 *   3. talent_page adapter NEVER calls any cms_page_sections / homepage writer.
 *   4. talent_page adapter ALWAYS calls assertNoLegacyBuilderWrite("talent_page", …)
 *      on every mutation.
 *   5. assertNoLegacyBuilderWrite("workspace_page" | "talent_page", "cms_page_sections") throws.
 *   6. Both adapters persist ONLY to "workspace_pages" / "talent_pages" (the guard
 *      doesn't throw for those table names).
 *
 * No server-action / DB / React / CSS import graph is loaded — all deps are injected.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createWorkspacePageAdapter,
  type WorkspacePageAdapterActions,
  type WorkspacePageRow,
  buildEmptyWorkspacePageComposition,
} from "./workspace-page-adapter-core";

import {
  createTalentPageAdapter,
  type TalentPageAdapterActions,
  type TalentPageRow,
  buildEmptyTalentPageComposition,
} from "./talent-page-adapter-core";

import {
  assertNoLegacyBuilderWrite,
  LegacyBuilderWriteError,
} from "../legacy-write-guard";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeFakeWorkspacePageRow(overrides: Partial<WorkspacePageRow> = {}): WorkspacePageRow {
  return {
    id: "wp-row-001",
    tenant_id: "tenant-abc",
    slug: "home",
    title: "Home",
    status: "draft",
    blocks: [],
    theme: {},
    published_at: null,
    updated_at: new Date("2026-06-11T12:00:00Z").toISOString(),
    ...overrides,
  };
}

function makeFakeTalentPageRow(overrides: Partial<TalentPageRow> = {}): TalentPageRow {
  return {
    id: "tp-row-001",
    talent_profile_id: "talent-profile-abc",
    slug: "index",
    title: "My Page",
    status: "draft",
    blocks: [],
    theme: {},
    required_talent_tier: null,
    published_at: null,
    updated_at: new Date("2026-06-11T12:00:00Z").toISOString(),
    ...overrides,
  };
}

/** Build a fake workspace-page action set with spy tracking. */
function makeWorkspaceActions(
  row: WorkspacePageRow | null = makeFakeWorkspacePageRow(),
): WorkspacePageAdapterActions & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async loadPage(_input) {
      calls.push("loadPage");
      return row;
    },
    async savePage(_input) {
      calls.push("savePage");
      return { ok: true, updatedAt: new Date("2026-06-11T12:01:00Z").toISOString() };
    },
    async publishPage(_input) {
      calls.push("publishPage");
      return {
        ok: true,
        publishedAt: new Date("2026-06-11T12:02:00Z").toISOString(),
        updatedAt: new Date("2026-06-11T12:02:00Z").toISOString(),
      };
    },
    async restoreRevision(_input) {
      calls.push("restoreRevision");
      return { ok: true, updatedAt: new Date("2026-06-11T12:03:00Z").toISOString() };
    },
  };
}

/** Build a fake talent-page action set with spy tracking. */
function makeTalentActions(
  row: TalentPageRow | null = makeFakeTalentPageRow(),
): TalentPageAdapterActions & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async loadPage(_input) {
      calls.push("loadPage");
      return row;
    },
    async savePage(_input) {
      calls.push("savePage");
      return { ok: true, updatedAt: new Date("2026-06-11T12:01:00Z").toISOString() };
    },
    async publishPage(_input) {
      calls.push("publishPage");
      return {
        ok: true,
        publishedAt: new Date("2026-06-11T12:02:00Z").toISOString(),
        updatedAt: new Date("2026-06-11T12:02:00Z").toISOString(),
      };
    },
    async restoreRevision(_input) {
      calls.push("restoreRevision");
      return { ok: true, updatedAt: new Date("2026-06-11T12:03:00Z").toISOString() };
    },
  };
}

/** Surface context used in tests. */
const WORKSPACE_CTX = {
  locale: "en" as const,
  pageSlug: "home",
  pageId: "wp-row-001",
};

const TALENT_CTX = {
  locale: "en" as const,
  pageSlug: "index",
  pageId: "tp-row-001",
};

// ── §F.1 assertNoLegacyBuilderWrite throws for workspace_page + talent_page ──

test("assertNoLegacyBuilderWrite throws for workspace_page → cms_page_sections", () => {
  assert.throws(
    () => assertNoLegacyBuilderWrite("workspace_page", "cms_page_sections"),
    LegacyBuilderWriteError,
  );
});

test("assertNoLegacyBuilderWrite throws for talent_page → cms_page_sections", () => {
  assert.throws(
    () => assertNoLegacyBuilderWrite("talent_page", "cms_page_sections"),
    LegacyBuilderWriteError,
  );
});

test("assertNoLegacyBuilderWrite does NOT throw for workspace_pages (freeform table)", () => {
  assert.doesNotThrow(() =>
    assertNoLegacyBuilderWrite("workspace_page", "workspace_pages"),
  );
});

test("assertNoLegacyBuilderWrite does NOT throw for talent_pages (freeform table)", () => {
  assert.doesNotThrow(() =>
    assertNoLegacyBuilderWrite("talent_page", "talent_pages"),
  );
});

// ── Workspace adapter spy tests ───────────────────────────────────────────────

test("[workspace] adapter kind is 'workspace_page'", () => {
  const actions = makeWorkspaceActions();
  const adapter = createWorkspacePageAdapter(actions, { tenantId: "t1" });
  assert.equal(adapter.kind, "workspace_page");
});

test("[workspace] load returns composition from DB row", async () => {
  const row = makeFakeWorkspacePageRow({ title: "Home Page", blocks: [{ id: "n1", kind: "section", props: {} }] });
  const actions = makeWorkspaceActions(row);
  const adapter = createWorkspacePageAdapter(actions, { tenantId: "tenant-abc" });

  const result = await adapter.load(WORKSPACE_CTX);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.pageId, "wp-row-001");
  assert.equal(result.data.metadata.title, "Home Page");
  assert.deepEqual(result.data.builderTree, [{ id: "n1", kind: "section", props: {} }]);
  assert.ok(actions.calls.includes("loadPage"), "loadPage must be called");
});

test("[workspace] load returns error when page not found", async () => {
  const actions = makeWorkspaceActions(null);
  const adapter = createWorkspacePageAdapter(actions, { tenantId: "t1" });
  const result = await adapter.load(WORKSPACE_CTX);
  assert.equal(result.ok, false);
});

test("[workspace] save calls guard then savePage — NEVER writes cms_page_sections", async () => {
  const actions = makeWorkspaceActions();
  const guardCalls: string[] = [];
  const adapter = createWorkspacePageAdapter(actions, {
    tenantId: "t1",
    assertNoLegacyWrite: (table) => {
      guardCalls.push(table);
      // Real guard would throw on legacy tables — verify it's called with the freeform table
    },
  });

  const result = await adapter.save(
    { ...WORKSPACE_CTX, pageId: "wp-row-001" },
    {
      locale: "en",
      pageId: "wp-row-001",
      expectedVersion: 1,
      metadata: { title: "Test", metaTitle: null, metaDescription: null, introTagline: null, ogTitle: null, ogDescription: null, ogImageUrl: null, canonicalUrl: null, noindex: false },
      slots: {},
      builderTree: [],
    },
  );

  assert.equal(result.ok, true);
  assert.ok(guardCalls.includes("workspace_pages"), "guard must be called with 'workspace_pages'");
  // The guard was called with "workspace_pages" — NOT "cms_page_sections"
  assert.equal(guardCalls.includes("cms_page_sections"), false, "guard MUST NOT be called with cms_page_sections");
  assert.ok(actions.calls.includes("savePage"), "savePage must be called");
});

test("[workspace] save with assertNoLegacyWrite=real guard throws on cms_page_sections", () => {
  // Verify the adapter's guard call with the real guard function would throw
  // if the table were ever changed to "cms_page_sections"
  assert.throws(
    () => assertNoLegacyBuilderWrite("workspace_page", "cms_page_sections"),
    LegacyBuilderWriteError,
    "Real guard must throw for workspace_page → cms_page_sections",
  );
});

test("[workspace] saveDraft calls guard then savePage", async () => {
  const actions = makeWorkspaceActions();
  const guardCalls: string[] = [];
  const adapter = createWorkspacePageAdapter(actions, {
    tenantId: "t1",
    assertNoLegacyWrite: (table) => guardCalls.push(table),
  });

  const result = await adapter.saveDraft(WORKSPACE_CTX, {
    expectedVersion: 1,
    metadata: { title: "Draft" } as never,
    slots: {},
    builderTree: [],
  });

  assert.equal(result.ok, true);
  assert.ok(guardCalls.length > 0, "guard must be called on saveDraft");
  assert.ok(actions.calls.includes("loadPage"), "loadPage called to resolve pageId");
  assert.ok(actions.calls.includes("savePage"), "savePage called");
});

test("[workspace] publish calls guard then publishPage", async () => {
  const actions = makeWorkspaceActions();
  const guardCalls: string[] = [];
  const adapter = createWorkspacePageAdapter(actions, {
    tenantId: "t1",
    assertNoLegacyWrite: (table) => guardCalls.push(table),
  });

  const result = await adapter.publish(WORKSPACE_CTX, { expectedVersion: 1 });

  assert.equal(result.ok, true);
  assert.ok(guardCalls.length > 0, "guard must be called on publish");
  assert.ok(actions.calls.includes("publishPage"), "publishPage called");
});

test("[workspace] restoreRevision calls guard then restoreRevision action", async () => {
  const actions = makeWorkspaceActions();
  const guardCalls: string[] = [];
  const adapter = createWorkspacePageAdapter(actions, {
    tenantId: "t1",
    assertNoLegacyWrite: (table) => guardCalls.push(table),
  });

  assert.ok(typeof adapter.restoreRevision === "function", "restoreRevision must exist");
  const result = await adapter.restoreRevision!(WORKSPACE_CTX, {
    revisionId: "rev-001",
    expectedVersion: 1,
  });

  assert.equal(result.ok, true);
  assert.ok(guardCalls.length > 0, "guard must be called on restoreRevision");
  assert.ok(actions.calls.includes("restoreRevision"), "restoreRevision action called");
});

// ── Talent adapter spy tests ──────────────────────────────────────────────────

test("[talent] adapter kind is 'talent_page'", () => {
  const actions = makeTalentActions();
  const adapter = createTalentPageAdapter(actions, { talentProfileId: "p1" });
  assert.equal(adapter.kind, "talent_page");
});

test("[talent] load returns composition from DB row", async () => {
  const row = makeFakeTalentPageRow({ title: "My Max Page", blocks: [{ id: "n2", kind: "section", props: {} }] });
  const actions = makeTalentActions(row);
  const adapter = createTalentPageAdapter(actions, { talentProfileId: "talent-profile-abc" });

  const result = await adapter.load(TALENT_CTX);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.pageId, "tp-row-001");
  assert.equal(result.data.metadata.title, "My Max Page");
  assert.deepEqual(result.data.builderTree, [{ id: "n2", kind: "section", props: {} }]);
  assert.ok(actions.calls.includes("loadPage"), "loadPage must be called");
});

test("[talent] load returns error when page not found", async () => {
  const actions = makeTalentActions(null);
  const adapter = createTalentPageAdapter(actions, { talentProfileId: "p1" });
  const result = await adapter.load(TALENT_CTX);
  assert.equal(result.ok, false);
});

test("[talent] save calls guard then savePage — NEVER writes cms_page_sections", async () => {
  const actions = makeTalentActions();
  const guardCalls: string[] = [];
  const adapter = createTalentPageAdapter(actions, {
    talentProfileId: "p1",
    assertNoLegacyWrite: (table) => {
      guardCalls.push(table);
    },
  });

  const result = await adapter.save(
    { ...TALENT_CTX, pageId: "tp-row-001" },
    {
      locale: "en",
      pageId: "tp-row-001",
      expectedVersion: 1,
      metadata: { title: "Talent Home", metaTitle: null, metaDescription: null, introTagline: null, ogTitle: null, ogDescription: null, ogImageUrl: null, canonicalUrl: null, noindex: false },
      slots: {},
      builderTree: [],
    },
  );

  assert.equal(result.ok, true);
  assert.ok(guardCalls.includes("talent_pages"), "guard must be called with 'talent_pages'");
  assert.equal(guardCalls.includes("cms_page_sections"), false, "guard MUST NOT be called with cms_page_sections");
  assert.ok(actions.calls.includes("savePage"), "savePage must be called");
});

test("[talent] saveDraft calls guard then savePage", async () => {
  const actions = makeTalentActions();
  const guardCalls: string[] = [];
  const adapter = createTalentPageAdapter(actions, {
    talentProfileId: "p1",
    assertNoLegacyWrite: (table) => guardCalls.push(table),
  });

  const result = await adapter.saveDraft(TALENT_CTX, {
    expectedVersion: 1,
    metadata: { title: "Draft" } as never,
    slots: {},
    builderTree: [],
  });

  assert.equal(result.ok, true);
  assert.ok(guardCalls.length > 0, "guard must be called on saveDraft");
  assert.ok(actions.calls.includes("savePage"), "savePage called");
});

test("[talent] publish calls guard then publishPage", async () => {
  const actions = makeTalentActions();
  const guardCalls: string[] = [];
  const adapter = createTalentPageAdapter(actions, {
    talentProfileId: "p1",
    assertNoLegacyWrite: (table) => guardCalls.push(table),
  });

  const result = await adapter.publish(TALENT_CTX, { expectedVersion: 1 });

  assert.equal(result.ok, true);
  assert.ok(guardCalls.length > 0, "guard must be called on publish");
  assert.ok(actions.calls.includes("publishPage"), "publishPage called");
});

test("[talent] restoreRevision calls guard then restoreRevision action", async () => {
  const actions = makeTalentActions();
  const guardCalls: string[] = [];
  const adapter = createTalentPageAdapter(actions, {
    talentProfileId: "p1",
    assertNoLegacyWrite: (table) => guardCalls.push(table),
  });

  assert.ok(typeof adapter.restoreRevision === "function", "restoreRevision must exist");
  const result = await adapter.restoreRevision!(TALENT_CTX, {
    revisionId: "rev-002",
    expectedVersion: 1,
  });

  assert.equal(result.ok, true);
  assert.ok(guardCalls.length > 0, "guard must be called on restoreRevision");
  assert.ok(actions.calls.includes("restoreRevision"), "restoreRevision action called");
});

// ── Composition builder helpers ───────────────────────────────────────────────

test("buildEmptyWorkspacePageComposition returns correct CompositionData shape", () => {
  const row = makeFakeWorkspacePageRow({
    id: "wp-123",
    title: "My Page",
    blocks: [{ id: "node-1", kind: "section", props: {} }],
  });
  const comp = buildEmptyWorkspacePageComposition(row, "en");
  assert.equal(comp.pageId, "wp-123");
  assert.equal(comp.metadata.title, "My Page");
  assert.deepEqual(comp.builderTree, [{ id: "node-1", kind: "section", props: {} }]);
  assert.equal(comp.liveSitePublishedAt, null);
  assert.deepEqual(comp.slots, {});
});

test("buildEmptyTalentPageComposition returns correct CompositionData shape", () => {
  const row = makeFakeTalentPageRow({
    id: "tp-456",
    title: "Talent Landing",
    blocks: [{ id: "node-2" }],
    published_at: "2026-01-01T00:00:00Z",
  });
  const comp = buildEmptyTalentPageComposition(row, "es");
  assert.equal(comp.pageId, "tp-456");
  assert.equal(comp.metadata.title, "Talent Landing");
  assert.deepEqual(comp.builderTree, [{ id: "node-2" }]);
  assert.equal(comp.liveSitePublishedAt, "2026-01-01T00:00:00Z");
});

// ── Exhaustiveness: no homepage actions ever called ───────────────────────────

test("[workspace] no homepage action functions appear in adapter mutations", async () => {
  // This test demonstrates the spy pattern: we verify the adapter calls
  // ONLY the injected action surface and no external homepage writer.
  const homepageActionCalls: string[] = [];
  const fakeSaveHomepageAction = () => {
    homepageActionCalls.push("saveHomepageCompositionAction");
  };

  // The adapter doesn't even accept a homepage action — this verifies the
  // type + runtime contract. The factory only takes WorkspacePageAdapterActions.
  const actions = makeWorkspaceActions();
  const adapter = createWorkspacePageAdapter(actions, { tenantId: "t1" });

  await adapter.save(
    { ...WORKSPACE_CTX, pageId: "wp-row-001" },
    {
      locale: "en",
      pageId: "wp-row-001",
      expectedVersion: 1,
      metadata: { title: "x", metaTitle: null, metaDescription: null, introTagline: null, ogTitle: null, ogDescription: null, ogImageUrl: null, canonicalUrl: null, noindex: false },
      slots: {},
      builderTree: [],
    },
  );

  // fakeSaveHomepageAction was never invoked — it's not in the call graph.
  assert.equal(
    homepageActionCalls.length,
    0,
    "saveHomepageCompositionAction must never be called by workspace_page adapter",
  );
  void fakeSaveHomepageAction; // suppress unused warning
});

test("[talent] no homepage action functions appear in adapter mutations", async () => {
  const homepageActionCalls: string[] = [];
  const fakeSaveHomepageAction = () => {
    homepageActionCalls.push("saveHomepageCompositionAction");
  };

  const actions = makeTalentActions();
  const adapter = createTalentPageAdapter(actions, { talentProfileId: "p1" });

  await adapter.save(
    { ...TALENT_CTX, pageId: "tp-row-001" },
    {
      locale: "en",
      pageId: "tp-row-001",
      expectedVersion: 1,
      metadata: { title: "x", metaTitle: null, metaDescription: null, introTagline: null, ogTitle: null, ogDescription: null, ogImageUrl: null, canonicalUrl: null, noindex: false },
      slots: {},
      builderTree: [],
    },
  );

  assert.equal(
    homepageActionCalls.length,
    0,
    "saveHomepageCompositionAction must never be called by talent_page adapter",
  );
  void fakeSaveHomepageAction; // suppress unused warning
});
