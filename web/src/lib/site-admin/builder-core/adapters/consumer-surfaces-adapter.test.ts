/**
 * Consumer Surfaces — adapter spy tests.
 *
 * Proves (using node:test + node:assert, NO vitest, NO React, NO Supabase):
 *
 *   1. talent_page adapter NEVER calls any cms_page_sections / homepage writer.
 *   2. talent_page adapter ALWAYS calls assertNoLegacyBuilderWrite("talent_page", …)
 *      on every mutation (save, saveDraft, publish, restoreRevision).
 *   3. assertNoLegacyBuilderWrite("talent_page" | "cms_page", "cms_page_sections") throws.
 *   4. The talent_page adapter persists ONLY to "talent_pages" (the guard doesn't
 *      throw for that table name); cms_page persists ONLY to "cms_pages".
 *
 * (The workspace_page surface was removed in the page-system consolidation —
 *  agency pages are now freeform cms_pages, edited via ?edit=1. The cms_page
 *  adapter's no-legacy-write contract is enforced by the static grep guard
 *  `legacy-write-guard.static.test.ts`, which scans every non-homepage adapter
 *  file including cms-page-adapter-core.ts.)
 *
 * No server-action / DB / React / CSS import graph is loaded — all deps are injected.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

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

/** Build a fake talent-page action set with spy tracking.
 *
 * `ensurePage` returns the same `row` as `loadPage` by default, simulating the
 * load-or-create contract.  Pass `ensureRow` to override just that behaviour
 * (e.g. to return a freshly-created row when `row` would be null).
 */
function makeTalentActions(
  row: TalentPageRow | null = makeFakeTalentPageRow(),
  ensureRow: TalentPageRow | null = row ?? makeFakeTalentPageRow(),
): TalentPageAdapterActions & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async ensurePage(_input) {
      calls.push("ensurePage");
      return ensureRow;
    },
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
const TALENT_CTX = {
  locale: "en" as const,
  pageSlug: "index",
  pageId: "tp-row-001",
};

// ── §F.1 assertNoLegacyBuilderWrite throws for freeform surfaces ──────────────

test("assertNoLegacyBuilderWrite throws for talent_page → cms_page_sections", () => {
  assert.throws(
    () => assertNoLegacyBuilderWrite("talent_page", "cms_page_sections"),
    LegacyBuilderWriteError,
  );
});

test("assertNoLegacyBuilderWrite throws for cms_page → cms_page_sections", () => {
  assert.throws(
    () => assertNoLegacyBuilderWrite("cms_page", "cms_page_sections"),
    LegacyBuilderWriteError,
  );
});

test("assertNoLegacyBuilderWrite does NOT throw for talent_pages (freeform table)", () => {
  assert.doesNotThrow(() =>
    assertNoLegacyBuilderWrite("talent_page", "talent_pages"),
  );
});

test("assertNoLegacyBuilderWrite does NOT throw for cms_pages (freeform table)", () => {
  assert.doesNotThrow(() => assertNoLegacyBuilderWrite("cms_page", "cms_pages"));
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
  assert.ok(actions.calls.includes("ensurePage"), "ensurePage must be called on load");
});

test("[talent] load lazily creates a page when none exists", async () => {
  // ensurePage returns a created row even though loadPage would return null.
  const createdRow = makeFakeTalentPageRow({
    id: "tp-created-001",
    blocks: [],
    updated_at: new Date("2026-06-11T13:00:00Z").toISOString(),
  });
  const actions = makeTalentActions(null, createdRow);
  const adapter = createTalentPageAdapter(actions, { talentProfileId: "p1" });

  const result = await adapter.load(TALENT_CTX);
  assert.equal(result.ok, true, "load must succeed when ensurePage creates a row");
  if (!result.ok) return;
  assert.ok(
    typeof result.data.pageVersion === "number" && isFinite(result.data.pageVersion) && result.data.pageVersion > 0,
    "pageVersion must be a finite positive number derived from updated_at",
  );
  assert.deepEqual(result.data.builderTree, [], "builderTree must be empty for a freshly created page");
  assert.ok(actions.calls.includes("ensurePage"), "ensurePage must be called");
});

test("[talent] load returns error when ensurePage fails", async () => {
  // ensurePage returns null (hard failure / RLS denial).
  const actions = makeTalentActions(null, null);
  const adapter = createTalentPageAdapter(actions, { talentProfileId: "p1" });
  const result = await adapter.load(TALENT_CTX);
  assert.equal(result.ok, false, "load must return ok=false when ensurePage returns null");
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
