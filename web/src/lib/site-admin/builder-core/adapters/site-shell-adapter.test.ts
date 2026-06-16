/**
 * site_shell FREEFORM adapter — spy tests (Builder Studio WS-A A1).
 *
 * Proves (node:test + node:assert, NO vitest / React / Supabase) that the
 * site_shell adapter:
 *
 *   1. has kind "site_shell";
 *   2. calls assertNoLegacyBuilderWrite("site_shell", "cms_pages") on EVERY
 *      mutation (save, saveDraft, publish) — and NEVER writes the legacy slot
 *      table "cms_page_sections";
 *   3. threads `ctx.locale` to `loadShell` on every read/mutation — the shell is
 *      keyed by (tenant, locale), so an omitted locale would mutate the wrong
 *      row on a multi-locale tenant;
 *   4. load exposes the shell tree: it prefers the freeform draft (`blocks`) and
 *      falls back to the published snapshot tree when the draft is empty — so a
 *      freshly-backfilled shell opens against its live header/footer;
 *   5. save round-trips the edited tree via the injected fake actions;
 *   6. a missing shell row returns an error, never an auto-created blank shell.
 *
 * All deps are injected — no server-action / DB / React import graph is loaded.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createSiteShellAdapter,
  buildSiteShellComposition,
  type SiteShellAdapterActions,
  type SiteShellRow,
} from "./site-shell-adapter-core";

import {
  assertNoLegacyBuilderWrite,
  LegacyBuilderWriteError,
} from "../legacy-write-guard";

import type { BuilderNodeTree } from "@/lib/site-admin/builder-node/types";

// ── Helpers ──────────────────────────────────────────────────────────────────

const HEADER_NODE: BuilderNodeTree = [
  {
    id: "legacy:header:0:sec-h",
    kind: "section",
    props: { sectionTypeKey: "site_header", slotKey: "header", sortOrder: 0 },
  },
];
const FOOTER_NODE: BuilderNodeTree = [
  {
    id: "legacy:footer:0:sec-f",
    kind: "section",
    props: { sectionTypeKey: "site_footer", slotKey: "footer", sortOrder: 0 },
  },
];

function makeShellRow(overrides: Partial<SiteShellRow> = {}): SiteShellRow {
  return {
    id: "shell-row-001",
    title: "Studio site shell",
    status: "published",
    blocks: [],
    snapshotBuilderTree: [...HEADER_NODE, ...FOOTER_NODE],
    version: 2,
    published_at: "2026-02-01T00:00:00Z",
    updated_at: new Date("2026-06-15T12:00:00Z").toISOString(),
    ...overrides,
  };
}

type LoadCall = { locale?: string };
type SaveCall = { pageId: string; blocks: unknown };

function makeActions(
  row: SiteShellRow | null = makeShellRow(),
): SiteShellAdapterActions & {
  calls: string[];
  loadCalls: LoadCall[];
  saveCalls: SaveCall[];
} {
  const calls: string[] = [];
  const loadCalls: LoadCall[] = [];
  const saveCalls: SaveCall[] = [];
  return {
    calls,
    loadCalls,
    saveCalls,
    async loadShell(input) {
      calls.push("loadShell");
      loadCalls.push({ locale: input.locale });
      return row;
    },
    async saveShell(input) {
      calls.push("saveShell");
      saveCalls.push({ pageId: input.pageId, blocks: input.patch.blocks });
      return { ok: true, updatedAt: new Date("2026-06-15T12:01:00Z").toISOString() };
    },
    async publishShell(_input) {
      calls.push("publishShell");
      return {
        ok: true,
        publishedAt: new Date("2026-06-15T12:02:00Z").toISOString(),
        updatedAt: new Date("2026-06-15T12:02:00Z").toISOString(),
      };
    },
  };
}

/** Context with a NON-default locale, so locale-threading bugs surface. */
const CTX = { locale: "es" as const, pageSlug: null, pageId: "shell-row-001" };

// ── Guard contract: the legacy table throws, the freeform table does not ──────

test("assertNoLegacyBuilderWrite throws for site_shell → cms_page_sections", () => {
  assert.throws(
    () => assertNoLegacyBuilderWrite("site_shell", "cms_page_sections"),
    LegacyBuilderWriteError,
  );
});

test("assertNoLegacyBuilderWrite does NOT throw for site_shell → cms_pages", () => {
  assert.doesNotThrow(() => assertNoLegacyBuilderWrite("site_shell", "cms_pages"));
});

// ── Adapter identity ───────────────────────────────────────────────────────────

test("[shell] adapter kind is 'site_shell'", () => {
  const adapter = createSiteShellAdapter(makeActions());
  assert.equal(adapter.kind, "site_shell");
});

test("[shell] adapter omits restoreRevision when the action surface lacks it", () => {
  const adapter = createSiteShellAdapter(makeActions());
  assert.equal(adapter.restoreRevision, undefined);
});

// ── A2 follow-up — restoreRevision present when the action supplies it ─────────

test("[shell] adapter EXPOSES restoreRevision when the action supplies it", () => {
  const actions = makeActions();
  const restoreCalls: Array<{ pageId: string; revisionId: string }> = [];
  const adapter = createSiteShellAdapter({
    ...actions,
    async restoreRevision(input) {
      restoreCalls.push(input);
      return { ok: true, updatedAt: new Date("2026-06-16T00:00:00Z").toISOString() };
    },
  });
  assert.equal(typeof adapter.restoreRevision, "function");
});

test("[shell] restoreRevision threads locale, guards('cms_pages'), round-trips the revisionId", async () => {
  const guardCalls: string[] = [];
  const actions = makeActions();
  const restoreCalls: Array<{ pageId: string; revisionId: string }> = [];
  const adapter = createSiteShellAdapter(
    {
      ...actions,
      async restoreRevision(input) {
        restoreCalls.push(input);
        return { ok: true, updatedAt: new Date("2026-06-16T00:00:00Z").toISOString() };
      },
    },
    { assertNoLegacyWrite: (table) => guardCalls.push(table) },
  );

  const result = await adapter.restoreRevision!(CTX, {
    revisionId: "rev-123",
    expectedVersion: 1,
  });

  assert.equal(result.ok, true);
  assert.ok(guardCalls.includes("cms_pages"), "guard called with cms_pages on restore");
  assert.equal(
    guardCalls.includes("cms_page_sections"),
    false,
    "restore MUST NOT touch the legacy slot table",
  );
  assert.deepEqual(actions.loadCalls, [{ locale: "es" }], "restore resolves by ctx.locale");
  assert.deepEqual(restoreCalls, [{ pageId: "shell-row-001", revisionId: "rev-123" }]);
});

test("[shell] restoreRevision errors when no shell row exists (does NOT restore the wrong row)", async () => {
  const actions = makeActions(null);
  const restoreCalls: unknown[] = [];
  const adapter = createSiteShellAdapter({
    ...actions,
    async restoreRevision(input) {
      restoreCalls.push(input);
      return { ok: true, updatedAt: new Date().toISOString() };
    },
  });
  const result = await adapter.restoreRevision!(CTX, {
    revisionId: "rev-123",
    expectedVersion: 1,
  });
  assert.equal(result.ok, false, "missing shell → restore errors");
  assert.equal(restoreCalls.length, 0, "restore action must not run without a shell row");
});

// ── Load: exposes the shell tree, threads locale, no lazy-create ──────────────

test("[shell] load falls back to the published snapshot tree when the draft is empty", async () => {
  const actions = makeActions(makeShellRow({ blocks: [] }));
  const adapter = createSiteShellAdapter(actions);

  const result = await adapter.load(CTX);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.pageId, "shell-row-001");
  // The editor opens against the LIVE header+footer tree, not a blank canvas.
  assert.deepEqual(result.data.builderTree, [...HEADER_NODE, ...FOOTER_NODE]);
  // locale threading: loadShell MUST receive ctx.locale ("es").
  assert.deepEqual(actions.loadCalls, [{ locale: "es" }]);
});

test("[shell] load prefers the freeform draft (blocks) over the snapshot tree", async () => {
  const draft: BuilderNodeTree = [
    { id: "edited:header", kind: "section", props: { sectionTypeKey: "site_header" } },
  ];
  const actions = makeActions(makeShellRow({ blocks: draft }));
  const adapter = createSiteShellAdapter(actions);

  const result = await adapter.load(CTX);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.data.builderTree, draft);
});

test("[shell] load returns an error when no shell row exists (does NOT auto-create)", async () => {
  const actions = makeActions(null);
  const adapter = createSiteShellAdapter(actions);
  const result = await adapter.load(CTX);
  assert.equal(result.ok, false, "missing shell must return an error, not a blank shell");
  assert.deepEqual(actions.calls, ["loadShell"]);
});

// ── Mutations: guard called with cms_pages, never cms_page_sections ───────────

test("[shell] save round-trips the tree, guards('cms_pages'), threads locale — NEVER cms_page_sections", async () => {
  const guardCalls: string[] = [];
  const actions = makeActions();
  const adapter = createSiteShellAdapter(actions, {
    assertNoLegacyWrite: (table) => guardCalls.push(table),
  });

  const edited: BuilderNodeTree = [
    { id: "n-edited", kind: "section", props: { sectionTypeKey: "site_header" } },
  ];
  const result = await adapter.save(CTX, {
    locale: "es",
    pageId: "shell-row-001",
    expectedVersion: 1,
    metadata: { title: "Shell", metaTitle: null, metaDescription: null, introTagline: null, ogTitle: null, ogDescription: null, ogImageUrl: null, canonicalUrl: null, noindex: false },
    slots: {},
    builderTree: edited,
  });

  assert.equal(result.ok, true);
  assert.ok(guardCalls.includes("cms_pages"), "guard must be called with 'cms_pages'");
  assert.equal(guardCalls.includes("cms_page_sections"), false, "guard MUST NOT be called with cms_page_sections");
  assert.deepEqual(actions.loadCalls, [{ locale: "es" }], "save must resolve the shell by ctx.locale");
  // Round-trip: the edited tree reached saveShell verbatim.
  assert.deepEqual(actions.saveCalls, [{ pageId: "shell-row-001", blocks: edited }]);
});

test("[shell] saveDraft threads locale, guards, and round-trips the tree", async () => {
  const guardCalls: string[] = [];
  const actions = makeActions();
  const adapter = createSiteShellAdapter(actions, {
    assertNoLegacyWrite: (table) => guardCalls.push(table),
  });

  const edited: BuilderNodeTree = [
    { id: "draft-node", kind: "section", props: { sectionTypeKey: "site_footer" } },
  ];
  const result = await adapter.saveDraft(CTX, {
    expectedVersion: 1,
    metadata: { title: "Draft" } as never,
    slots: {},
    builderTree: edited,
  });

  assert.equal(result.ok, true);
  assert.ok(guardCalls.includes("cms_pages"), "guard called with cms_pages on saveDraft");
  assert.deepEqual(actions.loadCalls, [{ locale: "es" }], "saveDraft resolves by ctx.locale");
  assert.deepEqual(actions.saveCalls, [{ pageId: "shell-row-001", blocks: edited }]);
});

test("[shell] publish threads locale, guards, and calls publishShell", async () => {
  const guardCalls: string[] = [];
  const actions = makeActions();
  const adapter = createSiteShellAdapter(actions, {
    assertNoLegacyWrite: (table) => guardCalls.push(table),
  });

  const result = await adapter.publish(CTX, { expectedVersion: 1 });

  assert.equal(result.ok, true);
  assert.ok(guardCalls.includes("cms_pages"), "guard called with cms_pages on publish");
  assert.deepEqual(actions.loadCalls, [{ locale: "es" }], "publish resolves by ctx.locale");
  assert.ok(actions.calls.includes("publishShell"), "publishShell must be called");
});

test("[shell] save returns an error when no shell row exists", async () => {
  const actions = makeActions(null);
  const adapter = createSiteShellAdapter(actions);
  const result = await adapter.save(CTX, {
    locale: "es",
    pageId: "x",
    expectedVersion: 1,
    metadata: { title: "x", metaTitle: null, metaDescription: null, introTagline: null, ogTitle: null, ogDescription: null, ogImageUrl: null, canonicalUrl: null, noindex: false },
    slots: {},
    builderTree: [],
  });
  assert.equal(result.ok, false, "no shell → save errors instead of writing the wrong row");
});

// ── Default guard binding (no injected spy) permits the freeform table ────────

test("[shell] default guard binding does not throw on the freeform table", async () => {
  const actions = makeActions();
  const adapter = createSiteShellAdapter(actions);
  const result = await adapter.publish(CTX, { expectedVersion: 1 });
  assert.equal(result.ok, true, "real guard must permit the cms_pages write");
});

// ── Composition helper shape ───────────────────────────────────────────────────

test("buildSiteShellComposition maps the row into CompositionData", () => {
  const comp = buildSiteShellComposition(makeShellRow({ blocks: [] }), "es");
  assert.equal(comp.pageId, "shell-row-001");
  assert.equal(comp.metadata.title, "Studio site shell");
  assert.deepEqual(comp.builderTree, [...HEADER_NODE, ...FOOTER_NODE]);
  assert.equal(comp.liveSitePublishedAt, "2026-02-01T00:00:00Z");
  assert.equal(comp.locale, "es");
  // The shell surface is freeform — no legacy slots in the composition.
  assert.deepEqual(comp.slots, {});
});
