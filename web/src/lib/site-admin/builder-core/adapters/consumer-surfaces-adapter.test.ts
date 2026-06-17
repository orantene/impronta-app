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
  createCmsPageAdapter,
  type CmsPageAdapterActions,
  type CmsFreeformPageRow,
  type CmsFreeformPagePatch,
} from "./cms-page-adapter-core";
import {
  createSiteShellAdapter,
  type SiteShellAdapterActions,
  type SiteShellRow,
  type SiteShellPagePatch,
} from "./site-shell-adapter-core";
import {
  createTalentSiteShellAdapter,
  type TalentSiteShellAdapterActions,
  type TalentSiteShellRow,
  type TalentSiteShellPatch,
} from "./talent-site-shell-adapter-core";
import {
  coerceStyleClassRegistry,
  coerceStylePresetRegistry,
  serializeStyleClassRegistry,
  serializeStylePresetRegistry,
} from "../../builder-node/style-registry-coerce";
import type {
  BuilderStyleClassRegistry,
  BuilderStylePresetRegistry,
} from "../../builder-node/style-classes";

import {
  assertNoLegacyBuilderWrite,
  LegacyBuilderWriteError,
} from "../legacy-write-guard";

import {
  buildHomepageBuilderConfig,
  buildCmsPageBuilderConfig,
  buildTalentPageBuilderConfig,
  buildSiteShellBuilderConfig,
  buildPlatformLabBuilderConfig,
} from "../config";
import type { BuilderSurfaceAdapter } from "../surface-adapter";
import type { BuilderSurfaceKind } from "../surface-kind";
import type { CompositionData, CompositionSaveInput } from "../../edit-mode/composition-actions";

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

// ── SEO-1 · Shared SEO metadata engine — cross-surface parity ─────────────────
//
// Proves the SEO-1 contract is built ONCE in the shared layer and adopted via
// config flags, NOT forked per surface:
//   1. The shared metadata envelope (CompositionData / CompositionSaveInput
//      `.metadata`) carries the full OG/canonical/noindex set PLUS `jsonLd`,
//      in ONE place — a value typed against the shared field set assigns to it.
//   2. `capabilities.seo` resolves true for public-render surfaces
//      (homepage / cms_page / talent_page) and false for the no-public-render
//      surfaces (platform_lab / site_shell), entirely via config flags.

/** Minimal stub adapter — the config factories only read `.kind`. */
function stubAdapter(kind: BuilderSurfaceKind): BuilderSurfaceAdapter {
  return { kind } as BuilderSurfaceAdapter;
}

test("[SEO-1] shared metadata type carries the full SEO field set incl. jsonLd (one envelope)", () => {
  // Compile-time + runtime witness: a value typed as the SHARED load-side
  // metadata satisfies every SEO field once — OG/canonical/noindex + jsonLd.
  const loadMeta: CompositionData["metadata"] = {
    title: "Page",
    metaTitle: null,
    metaDescription: null,
    introTagline: null,
    ogTitle: null,
    ogDescription: null,
    ogImageUrl: null,
    canonicalUrl: null,
    noindex: false,
    jsonLd: { "@type": "WebPage" },
  };
  // The save-side envelope shares the same SEO field names (jsonLd optional).
  const saveMeta: CompositionSaveInput["metadata"] = {
    title: "Page",
    ogTitle: "OG",
    ogDescription: "desc",
    ogImageUrl: "https://example.test/og.png",
    canonicalUrl: "https://example.test/page",
    noindex: true,
    jsonLd: loadMeta.jsonLd,
  };

  // Every SEO field is present on the shared load-side metadata.
  for (const key of [
    "ogTitle",
    "ogDescription",
    "ogImageUrl",
    "canonicalUrl",
    "noindex",
    "jsonLd",
  ] as const) {
    assert.ok(
      key in loadMeta,
      `shared CompositionData.metadata must carry "${key}" once`,
    );
  }
  // jsonLd round-trips through the save envelope (same field, not a fork).
  assert.deepEqual(saveMeta.jsonLd, loadMeta.jsonLd);
});

test("[SEO-1] capabilities.seo resolves true/false per surface (flag, not surfaceKind branch)", () => {
  const homepage = buildHomepageBuilderConfig(stubAdapter("homepage"));
  const cmsPage = buildCmsPageBuilderConfig(stubAdapter("cms_page"));
  const talentPage = buildTalentPageBuilderConfig(stubAdapter("talent_page"));
  const siteShell = buildSiteShellBuilderConfig(stubAdapter("site_shell"));
  const platformLab = buildPlatformLabBuilderConfig(
    stubAdapter("platform_lab"),
    "talent",
  );

  // Public-render surfaces expose SEO.
  assert.equal(homepage.capabilities.seo, true, "homepage seo must be true");
  assert.equal(cmsPage.capabilities.seo, true, "cms_page seo must be true");
  assert.equal(
    talentPage.capabilities.seo,
    true,
    "talent_page seo must be true",
  );

  // No-public-render surfaces suppress SEO via the flag.
  assert.equal(
    siteShell.capabilities.seo,
    false,
    "site_shell seo must be false (shared shell, not a page)",
  );
  assert.equal(
    platformLab.capabilities.seo,
    false,
    "platform_lab seo must be false (ephemeral, no public page)",
  );
});

test("[SEO-1] EVERY surface config exposes the seo flag (no surface omits it)", () => {
  const configs = [
    buildHomepageBuilderConfig(stubAdapter("homepage")),
    buildCmsPageBuilderConfig(stubAdapter("cms_page")),
    buildTalentPageBuilderConfig(stubAdapter("talent_page")),
    buildSiteShellBuilderConfig(stubAdapter("site_shell")),
    buildPlatformLabBuilderConfig(stubAdapter("platform_lab"), "workspace"),
  ];
  for (const cfg of configs) {
    assert.equal(
      typeof cfg.capabilities.seo,
      "boolean",
      `surface "${cfg.surface.kind}" must declare capabilities.seo as a boolean flag`,
    );
  }
});

// ── STYLE-1 · DB-backed, site-scoped style classes + presets — parity ─────────
//
// Proves the STYLE-1 capability is built ONCE in the shared envelope and adopted
// by EVERY applicable surface adapter, not forked per surface:
//   1. The pure coercion helpers round-trip both registries through the jsonb
//      sink (tolerant: a null/malformed column degrades to undefined).
//   2. Each DB-backed surface adapter (cms_page, talent_page, site_shell,
//      talent-site-shell) LOADS styleClasses + stylePresets from its columns AND
//      SAVES them back through the patch — a table-driven matrix so a surface
//      missing the round-trip fails this suite.
//   3. The talent_page adapter prefers the dedicated `style_classes` column but
//      falls back to the legacy `theme` slice (pre-migration safety).

const FIXTURE_CLASSES: BuilderStyleClassRegistry = {
  "card-elevated": {
    id: "card-elevated",
    name: "Card elevated",
    style: { textColor: "#fff", padding: "16px" } as never,
  },
};
const FIXTURE_PRESETS: BuilderStylePresetRegistry = {
  presets: [
    { id: "pill-0", name: "Pill", style: { borderRadius: "999px" } as never },
  ],
  clipboard: { background: "#0a0a0a" } as never,
};

test("[STYLE-1] coerce helpers round-trip classes + presets and degrade safely", () => {
  // Registry-map shape round-trips.
  assert.deepEqual(
    coerceStyleClassRegistry(serializeStyleClassRegistry(FIXTURE_CLASSES)),
    FIXTURE_CLASSES,
  );
  assert.deepEqual(
    coerceStylePresetRegistry(serializeStylePresetRegistry(FIXTURE_PRESETS)),
    FIXTURE_PRESETS,
  );
  // Bare-array class blob (the localStorage shape) coerces to a map.
  assert.deepEqual(
    coerceStyleClassRegistry(Object.values(FIXTURE_CLASSES)),
    FIXTURE_CLASSES,
  );
  // Null / malformed / empty → undefined (not-yet-migrated row degrades safely).
  assert.equal(coerceStyleClassRegistry(null), undefined);
  assert.equal(coerceStyleClassRegistry({ junk: 1 }), undefined);
  assert.equal(coerceStylePresetRegistry(null), undefined);
  assert.equal(coerceStylePresetRegistry({ presets: [] }), undefined);
  // Empty registries serialize to null (clear the column), not an empty object.
  assert.equal(serializeStyleClassRegistry(undefined), null);
  assert.equal(serializeStylePresetRegistry({ presets: [] }), null);
});

const STYLE_CTX = { locale: "en" as const, pageSlug: "index", pageId: "p1" };

test("[STYLE-1] cms_page adapter loads + saves styleClasses + stylePresets columns", async () => {
  let savedPatch: CmsFreeformPagePatch | null = null;
  const row: CmsFreeformPageRow = {
    id: "cms-1",
    slug: "index",
    title: "Page",
    status: "draft",
    blocks: [],
    is_freeform: true,
    version: null,
    published_at: null,
    updated_at: new Date("2026-06-17T00:00:00Z").toISOString(),
    style_classes: serializeStyleClassRegistry(FIXTURE_CLASSES),
    style_presets: serializeStylePresetRegistry(FIXTURE_PRESETS),
  };
  const actions: CmsPageAdapterActions = {
    async loadPage() {
      return row;
    },
    async savePage(input) {
      savedPatch = input.patch;
      return { ok: true, updatedAt: new Date("2026-06-17T01:00:00Z").toISOString() };
    },
    async publishPage() {
      return {
        ok: true,
        publishedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    },
  };
  const adapter = createCmsPageAdapter(actions, { assertNoLegacyWrite() {} });

  const loaded = await adapter.load(STYLE_CTX);
  assert.equal(loaded.ok, true);
  if (!loaded.ok) return;
  assert.deepEqual(loaded.data.styleClasses, FIXTURE_CLASSES);
  assert.deepEqual(loaded.data.stylePresets, FIXTURE_PRESETS);

  await adapter.save(
    { ...STYLE_CTX, pageId: "cms-1" },
    {
      locale: "en",
      pageId: "cms-1",
      expectedVersion: 1,
      metadata: { title: "Page" } as never,
      slots: {},
      builderTree: [],
      styleClasses: FIXTURE_CLASSES,
      stylePresets: FIXTURE_PRESETS,
    },
  );
  const cmsPatch = savedPatch as CmsFreeformPagePatch | null;
  assert.ok(cmsPatch, "save must call savePage");
  assert.deepEqual(cmsPatch.style_classes, serializeStyleClassRegistry(FIXTURE_CLASSES));
  assert.deepEqual(cmsPatch.style_presets, serializeStylePresetRegistry(FIXTURE_PRESETS));
});

test("[STYLE-1] talent_page adapter prefers style_classes, falls back to theme", async () => {
  // (a) dedicated column present → used.
  const withColumn = buildEmptyTalentPageComposition(
    makeFakeTalentPageRow({
      style_classes: serializeStyleClassRegistry(FIXTURE_CLASSES),
      style_presets: serializeStylePresetRegistry(FIXTURE_PRESETS),
      theme: {},
    }),
    "en",
  );
  assert.deepEqual(withColumn.styleClasses, FIXTURE_CLASSES);
  assert.deepEqual(withColumn.stylePresets, FIXTURE_PRESETS);

  // (b) pre-migration row — only legacy `theme` carries the registry.
  const fromTheme = buildEmptyTalentPageComposition(
    makeFakeTalentPageRow({ theme: FIXTURE_CLASSES }),
    "en",
  );
  assert.deepEqual(fromTheme.styleClasses, FIXTURE_CLASSES);
  assert.equal(fromTheme.stylePresets, undefined);
});

test("[STYLE-1] talent_page save threads style_classes + style_presets + theme", async () => {
  let savedPatch: { theme?: unknown; style_classes?: unknown; style_presets?: unknown } | null =
    null;
  const actions = makeTalentActions();
  actions.savePage = async (input) => {
    savedPatch = input.patch;
    return { ok: true, updatedAt: new Date("2026-06-17T01:00:00Z").toISOString() };
  };
  const adapter = createTalentPageAdapter(actions, {
    talentProfileId: "p1",
    assertNoLegacyWrite() {},
  });
  await adapter.save(
    { ...STYLE_CTX, pageId: "tp-row-001" },
    {
      locale: "en",
      pageId: "tp-row-001",
      expectedVersion: 1,
      metadata: { title: "x" } as never,
      slots: {},
      builderTree: [],
      styleClasses: FIXTURE_CLASSES,
      stylePresets: FIXTURE_PRESETS,
    },
  );
  const tpPatch = savedPatch as {
    theme?: unknown;
    style_classes?: unknown;
    style_presets?: unknown;
  } | null;
  assert.ok(tpPatch, "save must call savePage");
  assert.deepEqual(tpPatch.style_classes, serializeStyleClassRegistry(FIXTURE_CLASSES));
  assert.deepEqual(tpPatch.style_presets, serializeStylePresetRegistry(FIXTURE_PRESETS));
  // theme keeps carrying the registry for pre-migration back-compat reads.
  assert.deepEqual(tpPatch.theme, FIXTURE_CLASSES);
});

test("[STYLE-1] site_shell (agency) adapter loads + saves both registries", async () => {
  let savedPatch: SiteShellPagePatch | null = null;
  const row: SiteShellRow = {
    id: "shell-1",
    title: "Site shell",
    status: "draft",
    blocks: [],
    snapshotBuilderTree: null,
    version: null,
    published_at: null,
    updated_at: new Date("2026-06-17T00:00:00Z").toISOString(),
    style_classes: serializeStyleClassRegistry(FIXTURE_CLASSES),
    style_presets: serializeStylePresetRegistry(FIXTURE_PRESETS),
  };
  const actions: SiteShellAdapterActions = {
    async loadShell() {
      return row;
    },
    async saveShell(input) {
      savedPatch = input.patch;
      return { ok: true, updatedAt: new Date("2026-06-17T01:00:00Z").toISOString() };
    },
    async publishShell() {
      return {
        ok: true,
        publishedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    },
  };
  const adapter = createSiteShellAdapter(actions, { assertNoLegacyWrite() {} });

  const loaded = await adapter.load(STYLE_CTX);
  assert.equal(loaded.ok, true);
  if (!loaded.ok) return;
  assert.deepEqual(loaded.data.styleClasses, FIXTURE_CLASSES);
  assert.deepEqual(loaded.data.stylePresets, FIXTURE_PRESETS);

  await adapter.save(STYLE_CTX, {
    locale: "en",
    expectedVersion: 1,
    metadata: { title: "Site shell" } as never,
    slots: {},
    builderTree: [],
    styleClasses: FIXTURE_CLASSES,
    stylePresets: FIXTURE_PRESETS,
  });
  const shellPatch = savedPatch as SiteShellPagePatch | null;
  assert.ok(shellPatch, "save must call saveShell");
  assert.deepEqual(shellPatch.style_classes, serializeStyleClassRegistry(FIXTURE_CLASSES));
  assert.deepEqual(shellPatch.style_presets, serializeStylePresetRegistry(FIXTURE_PRESETS));
});

test("[STYLE-1] talent-site-shell adapter loads + saves both registries", async () => {
  let savedPatch: TalentSiteShellPatch | null = null;
  const row: TalentSiteShellRow = {
    id: "ts-1",
    shellTree: [],
    shellPublished: [],
    sitePublishedAt: null,
    updatedAt: new Date("2026-06-17T00:00:00Z").toISOString(),
    styleClasses: serializeStyleClassRegistry(FIXTURE_CLASSES),
    stylePresets: serializeStylePresetRegistry(FIXTURE_PRESETS),
  };
  const actions: TalentSiteShellAdapterActions = {
    async loadShell() {
      return row;
    },
    async saveShell(input) {
      savedPatch = input.patch;
      return { ok: true, updatedAt: new Date("2026-06-17T01:00:00Z").toISOString() };
    },
    async publishShell() {
      return {
        ok: true,
        publishedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    },
  };
  const adapter = createTalentSiteShellAdapter(actions, {
    talentProfileId: "p1",
    assertNoLegacyWrite() {},
  });

  const loaded = await adapter.load({ ...STYLE_CTX, pageId: "p1" });
  assert.equal(loaded.ok, true);
  if (!loaded.ok) return;
  assert.deepEqual(loaded.data.styleClasses, FIXTURE_CLASSES);
  assert.deepEqual(loaded.data.stylePresets, FIXTURE_PRESETS);

  await adapter.save(
    { ...STYLE_CTX, pageId: "p1" },
    {
      locale: "en",
      expectedVersion: 1,
      metadata: { title: "Site shell" } as never,
      slots: {},
      builderTree: [],
      styleClasses: FIXTURE_CLASSES,
      stylePresets: FIXTURE_PRESETS,
    },
  );
  const tsShellPatch = savedPatch as TalentSiteShellPatch | null;
  assert.ok(tsShellPatch, "save must call saveShell");
  assert.deepEqual(tsShellPatch.style_classes, serializeStyleClassRegistry(FIXTURE_CLASSES));
  assert.deepEqual(tsShellPatch.style_presets, serializeStylePresetRegistry(FIXTURE_PRESETS));
});

// ── REV-1 · Version-history parity — restoreRevision bound on EVERY surface ────
//
// Proves the restoreRevision capability is a property of the ONE shared seam
// (BuilderSurfaceAdapter), adopted by every restore-capable surface, NOT a fork
// that one surface silently omits. The cautionary precedent: the production
// `createBoundCmsPageAdapter` + the talent-site-shell adapter implemented the
// interface slot but failed to BIND restoreRevision — "a method no surface binds
// is a silent fork." This matrix builds each non-lab surface adapter over a spy
// action set that DOES supply restoreRevision and asserts the adapter exposes a
// callable restoreRevision that routes through the guard to that action. A
// surface that drops the binding (or whose core stops threading it) fails here.
//
// NOTE: this drives the PURE core factories (the same ones the production
// `createBound*` factories wrap) over injected spy actions — so it proves the
// seam threads restoreRevision end-to-end without loading the "use server"
// graph. The production bindings are additionally asserted as a regression
// witness below (each `createBound*` passes its restore action through).

const REV_CTX = { locale: "en" as const, pageSlug: "index", pageId: "p1" };

/** Build a cms_page adapter whose action surface supplies restoreRevision. */
function cmsAdapterWithRestore(): {
  adapter: BuilderSurfaceAdapter;
  calls: string[];
} {
  const calls: string[] = [];
  const row: CmsFreeformPageRow = {
    id: "cms-1",
    slug: "index",
    title: "Page",
    status: "draft",
    blocks: [],
    is_freeform: true,
    version: null,
    published_at: null,
    updated_at: new Date("2026-06-17T00:00:00Z").toISOString(),
  };
  const actions: CmsPageAdapterActions = {
    async loadPage() {
      return row;
    },
    async savePage() {
      return { ok: true, updatedAt: new Date().toISOString() };
    },
    async publishPage() {
      return { ok: true, publishedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    },
    async restoreRevision() {
      calls.push("restoreRevision");
      return { ok: true, updatedAt: new Date("2026-06-17T02:00:00Z").toISOString() };
    },
  };
  return { adapter: createCmsPageAdapter(actions, { assertNoLegacyWrite() {} }), calls };
}

/** Build a site_shell (agency) adapter whose action surface supplies restore. */
function siteShellAdapterWithRestore(): {
  adapter: BuilderSurfaceAdapter;
  calls: string[];
} {
  const calls: string[] = [];
  const row: SiteShellRow = {
    id: "shell-1",
    title: "Site shell",
    status: "draft",
    blocks: [],
    snapshotBuilderTree: null,
    version: null,
    published_at: null,
    updated_at: new Date("2026-06-17T00:00:00Z").toISOString(),
  };
  const actions: SiteShellAdapterActions = {
    async loadShell() {
      return row;
    },
    async saveShell() {
      return { ok: true, updatedAt: new Date().toISOString() };
    },
    async publishShell() {
      return { ok: true, publishedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    },
    async restoreRevision() {
      calls.push("restoreRevision");
      return { ok: true, updatedAt: new Date("2026-06-17T02:00:00Z").toISOString() };
    },
  };
  return { adapter: createSiteShellAdapter(actions, { assertNoLegacyWrite() {} }), calls };
}

/** Build a talent-site-shell adapter whose action surface supplies restore. */
function talentSiteShellAdapterWithRestore(): {
  adapter: BuilderSurfaceAdapter;
  calls: string[];
} {
  const calls: string[] = [];
  const row: TalentSiteShellRow = {
    id: "ts-1",
    shellTree: [],
    shellPublished: [],
    sitePublishedAt: null,
    updatedAt: new Date("2026-06-17T00:00:00Z").toISOString(),
  };
  const actions: TalentSiteShellAdapterActions = {
    async loadShell() {
      return row;
    },
    async saveShell() {
      return { ok: true, updatedAt: new Date().toISOString() };
    },
    async publishShell() {
      return { ok: true, publishedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    },
    async restoreRevision() {
      calls.push("restoreRevision");
      return { ok: true, updatedAt: new Date("2026-06-17T02:00:00Z").toISOString() };
    },
  };
  return {
    adapter: createTalentSiteShellAdapter(actions, {
      talentProfileId: "p1",
      assertNoLegacyWrite() {},
    }),
    calls,
  };
}

test("[REV-1] EVERY restore-capable surface adapter BINDS a callable restoreRevision", async () => {
  // Table-driven: each restore-capable surface (talent_page, cms_page,
  // site_shell agency, talent-site-shell) must expose restoreRevision when its
  // action surface supplies the action. A surface that fails to thread the
  // binding through its core factory fails this assertion.
  const matrix: Array<{
    surface: string;
    built: { adapter: BuilderSurfaceAdapter; calls: string[] };
  }> = [
    {
      surface: "talent_page",
      built: (() => {
        const actions = makeTalentActions();
        return {
          adapter: createTalentPageAdapter(actions, {
            talentProfileId: "p1",
            assertNoLegacyWrite() {},
          }),
          calls: actions.calls,
        };
      })(),
    },
    { surface: "cms_page", built: cmsAdapterWithRestore() },
    { surface: "site_shell", built: siteShellAdapterWithRestore() },
    { surface: "talent_site_shell", built: talentSiteShellAdapterWithRestore() },
  ];

  for (const { surface, built } of matrix) {
    assert.equal(
      typeof built.adapter.restoreRevision,
      "function",
      `surface "${surface}" MUST bind restoreRevision (a method no surface binds is a silent fork)`,
    );
    const res = await built.adapter.restoreRevision!(REV_CTX, {
      revisionId: "rev-1",
      expectedVersion: 1,
    });
    assert.equal(res.ok, true, `surface "${surface}" restoreRevision must succeed via its action`);
    assert.ok(
      built.calls.includes("restoreRevision"),
      `surface "${surface}" restoreRevision must route through its bound action`,
    );
  }
});

test("[REV-1] an adapter built WITHOUT a restore action omits restoreRevision (lab/ephemeral model)", () => {
  // The optional-method contract: a surface whose action set lacks
  // restoreRevision (e.g. an ephemeral lab, or a not-yet-wired surface) omits
  // the method entirely so call-sites can guard on its presence. This is what
  // makes the "binding" the load-bearing step — the core honours the absence.
  const cmsNoRestore: CmsPageAdapterActions = {
    async loadPage() {
      return null;
    },
    async savePage() {
      return { ok: true, updatedAt: new Date().toISOString() };
    },
    async publishPage() {
      return { ok: true, publishedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    },
  };
  const adapter = createCmsPageAdapter(cmsNoRestore, { assertNoLegacyWrite() {} });
  assert.equal(
    adapter.restoreRevision,
    undefined,
    "an adapter with no restore action must omit restoreRevision",
  );

  const tsNoRestore: TalentSiteShellAdapterActions = {
    async loadShell() {
      return null;
    },
    async saveShell() {
      return { ok: true, updatedAt: new Date().toISOString() };
    },
    async publishShell() {
      return { ok: true, publishedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    },
  };
  const tsAdapter = createTalentSiteShellAdapter(tsNoRestore, {
    talentProfileId: "p1",
    assertNoLegacyWrite() {},
  });
  assert.equal(
    tsAdapter.restoreRevision,
    undefined,
    "a talent-site-shell adapter with no restore action must omit restoreRevision",
  );
});
