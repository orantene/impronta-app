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
  type CmsFreeformPagePatch,
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
 *  input handed to loadPage so tests can assert locale threading; `savePatches`
 *  records the exact patch handed to savePage so tests can assert which columns
 *  a given save actually writes (the SEO wipe-hazard guard). */
function makeActions(
  row: CmsFreeformPageRow | null = makeFakeRow(),
): CmsPageAdapterActions & {
  calls: string[];
  loadCalls: LoadCall[];
  savePatches: CmsFreeformPagePatch[];
} {
  const calls: string[] = [];
  const loadCalls: LoadCall[] = [];
  const savePatches: CmsFreeformPagePatch[] = [];
  return {
    calls,
    loadCalls,
    savePatches,
    async loadPage(input) {
      calls.push("loadPage");
      loadCalls.push({ slug: input.slug, locale: input.locale });
      return row;
    },
    async savePage(input) {
      calls.push("savePage");
      savePatches.push(input.patch);
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

// ── SEO-1: metadata round-trips (regression — was hardcoded null) ─────────────

test("[cms] buildCmsFreeformComposition surfaces the row's REAL SEO metadata", () => {
  // Regression: every one of these was hardcoded to null/false, so the Page
  // settings drawer opened blank even when the columns held values.
  const comp = buildCmsFreeformComposition(
    makeFakeRow({
      meta_title: "Studio — Impronta",
      meta_description: "Casting studio in Madrid.",
      og_title: "Studio OG",
      og_description: "Studio OG description",
      og_image_url: "https://cdn.example/og.jpg",
      canonical_url: "https://impronta.example/studio",
      noindex: true,
      json_ld: { "@type": "WebPage" },
    }),
    "es",
  );
  assert.equal(comp.metadata.metaTitle, "Studio — Impronta");
  assert.equal(comp.metadata.metaDescription, "Casting studio in Madrid.");
  assert.equal(comp.metadata.ogTitle, "Studio OG");
  assert.equal(comp.metadata.ogDescription, "Studio OG description");
  assert.equal(comp.metadata.ogImageUrl, "https://cdn.example/og.jpg");
  assert.equal(comp.metadata.canonicalUrl, "https://impronta.example/studio");
  assert.equal(comp.metadata.noindex, true);
  assert.deepEqual(comp.metadata.jsonLd, { "@type": "WebPage" });
  // introTagline is homepage-only (it lives in the homepage row's hero JSON).
  assert.equal(comp.metadata.introTagline, null);
});

test("[cms] buildCmsFreeformComposition degrades a row WITHOUT the SEO columns to nulls", () => {
  const comp = buildCmsFreeformComposition(makeFakeRow(), "en");
  assert.equal(comp.metadata.metaTitle, null);
  assert.equal(comp.metadata.metaDescription, null);
  assert.equal(comp.metadata.ogTitle, null);
  assert.equal(comp.metadata.ogDescription, null);
  assert.equal(comp.metadata.ogImageUrl, null);
  assert.equal(comp.metadata.canonicalUrl, null);
  assert.equal(comp.metadata.noindex, false);
  assert.equal(comp.metadata.jsonLd, null);
});

test("[cms] save maps metadata onto the cms_pages SEO columns", async () => {
  const actions = makeActions();
  const adapter = createCmsPageAdapter(actions, { assertNoLegacyWrite: () => {} });

  const result = await adapter.save(CTX, {
    locale: "es",
    pageId: "cms-row-001",
    expectedVersion: 1,
    metadata: {
      title: "About",
      metaTitle: "About — Impronta",
      metaDescription: "Who we are.",
      ogTitle: "About OG",
      ogDescription: "About OG description",
      ogImageUrl: "https://cdn.example/about.jpg",
      canonicalUrl: "https://impronta.example/about",
      noindex: true,
      jsonLd: { "@type": "AboutPage" },
    },
    slots: {},
    builderTree: [],
  });

  assert.equal(result.ok, true);
  assert.equal(actions.savePatches.length, 1);
  const patch = actions.savePatches[0];
  assert.equal(patch.title, "About");
  assert.equal(patch.meta_title, "About — Impronta");
  assert.equal(patch.meta_description, "Who we are.");
  assert.equal(patch.og_title, "About OG");
  assert.equal(patch.og_description, "About OG description");
  assert.equal(patch.og_image_url, "https://cdn.example/about.jpg");
  assert.equal(patch.canonical_url, "https://impronta.example/about");
  assert.equal(patch.noindex, true);
  assert.deepEqual(patch.json_ld, { "@type": "AboutPage" });
});

test("[cms] saveDraft maps metadata onto the cms_pages SEO columns", async () => {
  const actions = makeActions();
  const adapter = createCmsPageAdapter(actions, { assertNoLegacyWrite: () => {} });

  const result = await adapter.saveDraft(CTX, {
    expectedVersion: 1,
    metadata: {
      title: "Draft",
      metaTitle: "Draft meta",
      metaDescription: null,
      ogTitle: null,
      ogDescription: null,
      ogImageUrl: null,
      canonicalUrl: null,
      noindex: false,
      jsonLd: null,
    },
    slots: {},
    builderTree: [],
  });

  assert.equal(result.ok, true);
  const patch = actions.savePatches[0];
  assert.equal(patch.meta_title, "Draft meta");
  // An explicit null CLEARS the column (STYLE-1 convention: undefined =
  // untouched, null = clear) — so the operator can empty an SEO field.
  assert.equal(patch.meta_description, null);
  assert.equal(patch.canonical_url, null);
  assert.equal(patch.noindex, false);
  assert.equal(patch.json_ld, null);
});

// ── WIPE HAZARD: a metadata-less save must NOT touch the SEO columns ──────────

const SEO_PATCH_KEYS = [
  "meta_title",
  "meta_description",
  "og_title",
  "og_description",
  "og_image_url",
  "canonical_url",
  "noindex",
  "json_ld",
] as const;

test("[cms] a tree-only save (NO metadata) leaves every SEO column OUT of the patch", async () => {
  // The wipe hazard: autosave / draft-flush paths carry only the builder tree.
  // If the adapter mapped `metadata?.metaTitle ?? null` unconditionally, every
  // keystroke-driven save would NULL the page's whole SEO set.
  const actions = makeActions();
  const adapter = createCmsPageAdapter(actions, { assertNoLegacyWrite: () => {} });

  const result = await adapter.save(CTX, {
    locale: "es",
    pageId: "cms-row-001",
    expectedVersion: 1,
    metadata: undefined as unknown as never,
    slots: {},
    builderTree: [{ id: "n1" }] as never,
  });

  assert.equal(result.ok, true);
  const patch = actions.savePatches[0] as unknown as Record<string, unknown>;
  for (const key of SEO_PATCH_KEYS) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(patch, key),
      false,
      `metadata-less save must not write "${key}" — that would wipe the stored SEO value`,
    );
  }
  assert.deepEqual(patch.blocks, [{ id: "n1" }]);
});

test("[cms] a tree-only saveDraft (NO metadata) leaves every SEO column OUT of the patch", async () => {
  const actions = makeActions();
  const adapter = createCmsPageAdapter(actions, { assertNoLegacyWrite: () => {} });

  const result = await adapter.saveDraft(CTX, {
    expectedVersion: 1,
    metadata: undefined as unknown as never,
    slots: {},
    builderTree: [],
  });

  assert.equal(result.ok, true);
  const patch = actions.savePatches[0] as unknown as Record<string, unknown>;
  for (const key of SEO_PATCH_KEYS) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(patch, key),
      false,
      `metadata-less saveDraft must not write "${key}"`,
    );
  }
});

test("[cms] a PARTIAL metadata save only writes the fields it carries", async () => {
  // The legacy saveDraft envelope sends `{ title }` alone. Only `title` (and no
  // SEO column) may reach the patch — the untouched columns keep their values.
  const actions = makeActions();
  const adapter = createCmsPageAdapter(actions, { assertNoLegacyWrite: () => {} });

  await adapter.saveDraft(CTX, {
    expectedVersion: 1,
    metadata: { title: "Only the title" },
    slots: {},
    builderTree: [],
  });

  const patch = actions.savePatches[0] as unknown as Record<string, unknown>;
  assert.equal(patch.title, "Only the title");
  for (const key of SEO_PATCH_KEYS) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(patch, key),
      false,
      `partial-metadata save must not write "${key}"`,
    );
  }
});

// ── End-to-end round trip through the adapter (load → save → load) ────────────

test("[cms] SEO metadata survives a load → save → load round trip", async () => {
  const stored: Record<string, unknown> = {};
  const row = makeFakeRow({
    meta_title: "Stored title",
    meta_description: "Stored description",
  });
  const actions: CmsPageAdapterActions = {
    async loadPage() {
      return { ...row, ...stored } as CmsFreeformPageRow;
    },
    async savePage(input) {
      Object.assign(stored, input.patch);
      return { ok: true, updatedAt: new Date("2026-06-13T12:05:00Z").toISOString() };
    },
    async publishPage() {
      return {
        ok: true,
        publishedAt: new Date("2026-06-13T12:06:00Z").toISOString(),
        updatedAt: new Date("2026-06-13T12:06:00Z").toISOString(),
      };
    },
  };
  const adapter = createCmsPageAdapter(actions, { assertNoLegacyWrite: () => {} });

  const first = await adapter.load(CTX);
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.equal(first.data.metadata.metaTitle, "Stored title");

  // Operator edits the Meta title in the Page settings drawer and saves.
  await adapter.save(CTX, {
    locale: "es",
    pageId: first.data.pageId,
    expectedVersion: first.data.pageVersion,
    metadata: { ...first.data.metadata, metaTitle: "Edited title" },
    slots: {},
    builderTree: [],
  });

  // A later tree-only autosave must not undo it.
  await adapter.saveDraft(CTX, {
    expectedVersion: first.data.pageVersion,
    metadata: undefined as unknown as never,
    slots: {},
    builderTree: [{ id: "n2" }] as never,
  });

  const second = await adapter.load(CTX);
  assert.equal(second.ok, true);
  if (!second.ok) return;
  assert.equal(second.data.metadata.metaTitle, "Edited title");
  assert.equal(second.data.metadata.metaDescription, "Stored description");
});
