/**
 * CMS-page FREEFORM adapter — spy tests (Wave 4.1).
 *
 * Proves (node:test + node:assert, NO vitest / React / Supabase) that the
 * cms_page freeform adapter:
 *
 *   1. has kind "cms_page";
 *   2. calls assertNoLegacyBuilderWrite("cms_page", "cms_pages") on EVERY
 *      mutation (save, saveDraft, publish, restoreRevision) — and NEVER writes
 *      the legacy slot table "cms_page_sections";
 *   3. threads `ctx.locale` to `loadPage` on every read/mutation — the guard
 *      against the multi-locale wrong-row hazard (cms_pages is unique on
 *      (tenant_id, locale, slug), so an omitted locale would mutate the wrong
 *      row on a multi-locale tenant);
 *   4. does NOT lazily create on load (distinct from talent_page.ensurePage):
 *      a missing row returns an error, never an auto-created blank page.
 *
 * This closes the Wave 4.1 review's test-coverage gaps for the new cms_page
 * production surface. All deps are injected — no server-action / DB / React
 * import graph is loaded.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createCmsPageAdapter,
  buildCmsFreeformComposition,
  type CmsPageAdapterActions,
  type CmsFreeformPageRow,
} from "./cms-page-adapter-core";

import {
  assertNoLegacyBuilderWrite,
  LegacyBuilderWriteError,
} from "../legacy-write-guard";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeFakeRow(overrides: Partial<CmsFreeformPageRow> = {}): CmsFreeformPageRow {
  return {
    id: "cms-row-001",
    slug: "about",
    title: "About Us",
    status: "draft",
    blocks: [],
    is_freeform: true,
    version: 1,
    published_at: null,
    updated_at: new Date("2026-06-13T12:00:00Z").toISOString(),
    ...overrides,
  };
}

type LoadCall = { slug: string; locale?: string };

/** Spy action set. `calls` records method names; `loadCalls` records the exact
 *  input handed to loadPage so tests can assert locale threading. */
function makeActions(
  row: CmsFreeformPageRow | null = makeFakeRow(),
): CmsPageAdapterActions & { calls: string[]; loadCalls: LoadCall[] } {
  const calls: string[] = [];
  const loadCalls: LoadCall[] = [];
  return {
    calls,
    loadCalls,
    async loadPage(input) {
      calls.push("loadPage");
      loadCalls.push({ slug: input.slug, locale: input.locale });
      return row;
    },
    async savePage(_input) {
      calls.push("savePage");
      return { ok: true, updatedAt: new Date("2026-06-13T12:01:00Z").toISOString() };
    },
    async publishPage(_input) {
      calls.push("publishPage");
      return {
        ok: true,
        publishedAt: new Date("2026-06-13T12:02:00Z").toISOString(),
        updatedAt: new Date("2026-06-13T12:02:00Z").toISOString(),
      };
    },
    async restoreRevision(_input) {
      calls.push("restoreRevision");
      return { ok: true, updatedAt: new Date("2026-06-13T12:03:00Z").toISOString() };
    },
  };
}

/** Context with a NON-default locale, so locale-threading bugs surface. */
const CTX = { locale: "es" as const, pageSlug: "about", pageId: "cms-row-001" };

// ── Guard contract: the legacy table throws, the freeform table does not ──────

test("assertNoLegacyBuilderWrite throws for cms_page → cms_page_sections", () => {
  assert.throws(
    () => assertNoLegacyBuilderWrite("cms_page", "cms_page_sections"),
    LegacyBuilderWriteError,
  );
});

test("assertNoLegacyBuilderWrite does NOT throw for cms_page → cms_pages", () => {
  assert.doesNotThrow(() => assertNoLegacyBuilderWrite("cms_page", "cms_pages"));
});

// ── Adapter identity ───────────────────────────────────────────────────────────

test("[cms] adapter kind is 'cms_page'", () => {
  const adapter = createCmsPageAdapter(makeActions());
  assert.equal(adapter.kind, "cms_page");
});

// ── Load: returns composition, threads locale, NO lazy-create ─────────────────

test("[cms] load returns composition from row and threads ctx.locale to loadPage", async () => {
  const row = makeFakeRow({ title: "Sobre Nosotros", blocks: [{ id: "n1", kind: "section", props: {} }] });
  const actions = makeActions(row);
  const adapter = createCmsPageAdapter(actions);

  const result = await adapter.load(CTX);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.pageId, "cms-row-001");
  assert.equal(result.data.metadata.title, "Sobre Nosotros");
  assert.deepEqual(result.data.builderTree, [{ id: "n1", kind: "section", props: {} }]);
  // locale threading: loadPage MUST receive ctx.locale ("es"), never a silent "en".
  assert.deepEqual(actions.loadCalls, [{ slug: "about", locale: "es" }]);
});

test("[cms] load returns error when the page is missing (does NOT auto-create like talent_page)", async () => {
  const actions = makeActions(null);
  const adapter = createCmsPageAdapter(actions);
  const result = await adapter.load(CTX);
  assert.equal(result.ok, false, "missing cms_page must return an error, not a lazily-created blank page");
  // Only loadPage was attempted — no ensurePage/insert path exists for cms_page.
  assert.deepEqual(actions.calls, ["loadPage"]);
});

// ── Mutations: guard called with cms_pages, never cms_page_sections ───────────

test("[cms] save calls guard('cms_pages') then savePage — NEVER cms_page_sections", async () => {
  const guardCalls: string[] = [];
  const actions = makeActions();
  const adapter = createCmsPageAdapter(actions, {
    assertNoLegacyWrite: (table) => guardCalls.push(table),
  });

  const result = await adapter.save(CTX, {
    locale: "es",
    pageId: "cms-row-001",
    expectedVersion: 1,
    metadata: { title: "About", metaTitle: null, metaDescription: null, introTagline: null, ogTitle: null, ogDescription: null, ogImageUrl: null, canonicalUrl: null, noindex: false },
    slots: {},
    builderTree: [],
  });

  assert.equal(result.ok, true);
  assert.ok(guardCalls.includes("cms_pages"), "guard must be called with 'cms_pages'");
  assert.equal(guardCalls.includes("cms_page_sections"), false, "guard MUST NOT be called with cms_page_sections");
  assert.ok(actions.calls.includes("savePage"), "savePage must be called");
});

test("[cms] saveDraft threads ctx.locale to loadPage, then guards + savePage", async () => {
  const guardCalls: string[] = [];
  const actions = makeActions();
  const adapter = createCmsPageAdapter(actions, {
    assertNoLegacyWrite: (table) => guardCalls.push(table),
  });

  const result = await adapter.saveDraft(CTX, {
    expectedVersion: 1,
    metadata: { title: "Draft" } as never,
    slots: {},
    builderTree: [],
  });

  assert.equal(result.ok, true);
  assert.ok(guardCalls.includes("cms_pages"), "guard called with cms_pages on saveDraft");
  assert.deepEqual(actions.loadCalls, [{ slug: "about", locale: "es" }], "saveDraft must load by ctx.locale");
  assert.ok(actions.calls.includes("savePage"), "savePage must be called");
});

test("[cms] publish threads ctx.locale to loadPage, then guards + publishPage", async () => {
  const guardCalls: string[] = [];
  const actions = makeActions();
  const adapter = createCmsPageAdapter(actions, {
    assertNoLegacyWrite: (table) => guardCalls.push(table),
  });

  const result = await adapter.publish(CTX, { expectedVersion: 1 });

  assert.equal(result.ok, true);
  assert.ok(guardCalls.includes("cms_pages"), "guard called with cms_pages on publish");
  assert.deepEqual(actions.loadCalls, [{ slug: "about", locale: "es" }], "publish must load by ctx.locale");
  assert.ok(actions.calls.includes("publishPage"), "publishPage must be called");
});

test("[cms] restoreRevision threads ctx.locale to loadPage, then guards + restoreRevision action", async () => {
  const guardCalls: string[] = [];
  const actions = makeActions();
  const adapter = createCmsPageAdapter(actions, {
    assertNoLegacyWrite: (table) => guardCalls.push(table),
  });

  assert.ok(typeof adapter.restoreRevision === "function", "restoreRevision must exist when the action is provided");
  const result = await adapter.restoreRevision!(CTX, { revisionId: "rev-9", expectedVersion: 1 });

  assert.equal(result.ok, true);
  assert.ok(guardCalls.includes("cms_pages"), "guard called with cms_pages on restoreRevision");
  assert.deepEqual(actions.loadCalls, [{ slug: "about", locale: "es" }], "restoreRevision must load by ctx.locale");
  assert.ok(actions.calls.includes("restoreRevision"), "restoreRevision action must be called");
});

// ── Default guard binding (no injected spy) writes cms_pages, not the slot table ─

test("[cms] default guard binding does not throw on the freeform table", async () => {
  // No assertNoLegacyWrite injected → adapter uses the real guard bound to
  // ("cms_page", table). A cms_pages write must NOT throw.
  const actions = makeActions();
  const adapter = createCmsPageAdapter(actions);
  const result = await adapter.publish(CTX, { expectedVersion: 1 });
  assert.equal(result.ok, true, "real guard must permit the cms_pages write");
});

// ── Composition helper shape ───────────────────────────────────────────────────

test("buildCmsFreeformComposition maps the row into CompositionData", () => {
  const row = makeFakeRow({
    id: "cms-77",
    title: "Studio",
    blocks: [{ id: "b1" }],
    published_at: "2026-02-01T00:00:00Z",
  });
  const comp = buildCmsFreeformComposition(row, "es");
  assert.equal(comp.pageId, "cms-77");
  assert.equal(comp.metadata.title, "Studio");
  assert.deepEqual(comp.builderTree, [{ id: "b1" }]);
  assert.equal(comp.liveSitePublishedAt, "2026-02-01T00:00:00Z");
  assert.equal(comp.locale, "es");
});
