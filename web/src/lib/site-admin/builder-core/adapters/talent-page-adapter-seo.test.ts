/**
 * talent_page — SEO metadata PERSISTENCE (regression: was hardcoded null).
 *
 * Parity port of the freeform-cms fix (see `cms-page-adapter.test.ts`). The
 * talent_page defect was the same shape and strictly worse: SEO-2 already READS
 * these columns on the public side (`loadMaxSitePages` → `maxSiteSeoToMetadata`
 * → the rendered <head> of all three talent-site routes), so everything the
 * operator typed into the Page settings drawer was dropped before it ever
 * reached the row. The composition hardcoded the SEO envelope to null/false and
 * `save`/`saveDraft` built the patch with only `title`.
 *
 * Lives in its own file rather than in `consumer-surfaces-adapter.test.ts`
 * (which owns the no-legacy-write spy contract) because that file is at the
 * 800-line cap — and because `cms_pages` likewise keeps its adapter tests
 * separate.
 *
 * NOTE: `talent_pages` has NO `meta_title` column. The SEO-1 migration
 * (20261100000000) deliberately omits it — the talent-site SEO envelope
 * (`MaxSiteSeo`) uses `title` as the SERP/tab title and `og_title` as the only
 * override. So `metaTitle` is absent throughout, by design, not by oversight.
 *
 * node:test + node:assert only — NO vitest, NO React, NO Supabase. The pure
 * factory takes injected spy actions, so no server-action / DB import graph
 * is loaded.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createTalentPageAdapter,
  buildEmptyTalentPageComposition,
  type TalentPageAdapterActions,
  type TalentPageRow,
  type TalentPagePatch,
} from "./talent-page-adapter-core";
import type { CompositionSaveInput } from "../../edit-mode/composition-actions";

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

/** Spy action set that records the exact patch handed to `savePage`, so tests
 *  can assert which columns a given save actually writes (the wipe-hazard guard). */
function makeTalentActions(
  row: TalentPageRow = makeFakeTalentPageRow(),
): TalentPageAdapterActions & { savePatches: TalentPagePatch[] } {
  const savePatches: TalentPagePatch[] = [];
  return {
    savePatches,
    async ensurePage() {
      return row;
    },
    async loadPage() {
      return row;
    },
    async savePage(input) {
      savePatches.push(input.patch);
      return { ok: true, updatedAt: new Date("2026-06-11T12:01:00Z").toISOString() };
    },
    async publishPage() {
      return {
        ok: true,
        publishedAt: new Date("2026-06-11T12:02:00Z").toISOString(),
        updatedAt: new Date("2026-06-11T12:02:00Z").toISOString(),
      };
    },
  };
}

const TALENT_CTX = {
  locale: "en" as const,
  pageSlug: "index",
  pageId: "tp-row-001",
};

function makeAdapter(actions: TalentPageAdapterActions) {
  return createTalentPageAdapter(actions, {
    assertNoLegacyWrite: () => {},
    talentProfileId: "talent-profile-abc",
  });
}

/** The `talent_pages` SEO columns a save may touch. No `meta_title`. */
const TALENT_SEO_PATCH_KEYS = [
  "meta_description",
  "og_title",
  "og_description",
  "og_image_url",
  "canonical_url",
  "noindex",
  "json_ld",
] as const;

// ── Read side: the composition must surface the stored values ────────────────

test("[SEO-1][talent] buildEmptyTalentPageComposition surfaces the row's REAL SEO metadata", () => {
  // Regression: every one of these was hardcoded to null/false, so the Page
  // settings drawer opened blank even when the columns held values.
  const comp = buildEmptyTalentPageComposition(
    makeFakeTalentPageRow({
      meta_description: "Bilingual actor based in Madrid.",
      og_title: "Ana Ruiz OG",
      og_description: "Ana Ruiz OG description",
      og_image_url: "https://cdn.example/ana-og.jpg",
      canonical_url: "https://ana.example/about",
      noindex: true,
      json_ld: { "@type": "Person" },
    }),
    "es",
  );
  assert.equal(comp.metadata.metaDescription, "Bilingual actor based in Madrid.");
  assert.equal(comp.metadata.ogTitle, "Ana Ruiz OG");
  assert.equal(comp.metadata.ogDescription, "Ana Ruiz OG description");
  assert.equal(comp.metadata.ogImageUrl, "https://cdn.example/ana-og.jpg");
  assert.equal(comp.metadata.canonicalUrl, "https://ana.example/about");
  assert.equal(comp.metadata.noindex, true);
  assert.deepEqual(comp.metadata.jsonLd, { "@type": "Person" });
  // No `meta_title` column on talent_pages; introTagline is homepage-only.
  assert.equal(comp.metadata.metaTitle, null);
  assert.equal(comp.metadata.introTagline, null);
});

test("[SEO-1][talent] a row WITHOUT the SEO columns degrades to nulls", () => {
  const comp = buildEmptyTalentPageComposition(makeFakeTalentPageRow(), "en");
  assert.equal(comp.metadata.metaDescription, null);
  assert.equal(comp.metadata.ogTitle, null);
  assert.equal(comp.metadata.ogDescription, null);
  assert.equal(comp.metadata.ogImageUrl, null);
  assert.equal(comp.metadata.canonicalUrl, null);
  assert.equal(comp.metadata.noindex, false);
  assert.equal(comp.metadata.jsonLd, null);
});

// ── Write side: both legs map metadata onto the columns ──────────────────────

test("[SEO-1][talent] save maps metadata onto the talent_pages SEO columns", async () => {
  const actions = makeTalentActions();
  const adapter = makeAdapter(actions);

  const result = await adapter.save(TALENT_CTX, {
    locale: "es",
    pageId: "tp-row-001",
    expectedVersion: 1,
    metadata: {
      title: "About",
      metaDescription: "Who I am.",
      ogTitle: "About OG",
      ogDescription: "About OG description",
      ogImageUrl: "https://cdn.example/about.jpg",
      canonicalUrl: "https://ana.example/about",
      noindex: true,
      jsonLd: { "@type": "AboutPage" },
    },
    slots: {},
    builderTree: [],
  } as unknown as CompositionSaveInput);

  assert.equal(result.ok, true);
  assert.equal(actions.savePatches.length, 1);
  const patch = actions.savePatches[0];
  assert.equal(patch.title, "About");
  assert.equal(patch.meta_description, "Who I am.");
  assert.equal(patch.og_title, "About OG");
  assert.equal(patch.og_description, "About OG description");
  assert.equal(patch.og_image_url, "https://cdn.example/about.jpg");
  assert.equal(patch.canonical_url, "https://ana.example/about");
  assert.equal(patch.noindex, true);
  assert.deepEqual(patch.json_ld, { "@type": "AboutPage" });
});

test("[SEO-1][talent] saveDraft maps metadata onto the talent_pages SEO columns", async () => {
  const actions = makeTalentActions();
  const adapter = makeAdapter(actions);

  const result = await adapter.saveDraft(TALENT_CTX, {
    expectedVersion: 1,
    metadata: {
      title: "Draft",
      metaDescription: null,
      ogTitle: "Draft OG",
      ogDescription: null,
      ogImageUrl: null,
      canonicalUrl: null,
      noindex: false,
      jsonLd: null,
    },
    slots: {},
    builderTree: [],
  } as never);

  assert.equal(result.ok, true);
  const patch = actions.savePatches[0];
  assert.equal(patch.og_title, "Draft OG");
  // An explicit null CLEARS the column (STYLE-1 convention: undefined =
  // untouched, null = clear) — so the operator can empty an SEO field.
  assert.equal(patch.meta_description, null);
  assert.equal(patch.canonical_url, null);
  assert.equal(patch.noindex, false);
  assert.equal(patch.json_ld, null);
});

// ── WIPE HAZARD: a metadata-less save must NOT touch the SEO columns ──────────

test("[SEO-1][talent] a tree-only save (NO metadata) leaves every SEO column OUT of the patch", async () => {
  // The wipe hazard: autosave / draft-flush paths carry only the builder tree.
  // If the adapter mapped `metadata?.metaDescription ?? null` unconditionally,
  // every keystroke-driven save would NULL the page's whole SEO set — and on
  // this surface those columns are live in the public page's <head>.
  const actions = makeTalentActions();
  const adapter = makeAdapter(actions);

  const result = await adapter.save(TALENT_CTX, {
    locale: "es",
    pageId: "tp-row-001",
    expectedVersion: 1,
    metadata: undefined,
    slots: {},
    builderTree: [{ id: "n1" }],
  } as unknown as CompositionSaveInput);

  assert.equal(result.ok, true);
  const patch = actions.savePatches[0] as unknown as Record<string, unknown>;
  for (const key of TALENT_SEO_PATCH_KEYS) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(patch, key),
      false,
      `metadata-less save must not write "${key}" — that would wipe the stored SEO value`,
    );
  }
  assert.deepEqual(patch.blocks, [{ id: "n1" }]);
});

test("[SEO-1][talent] a tree-only saveDraft (NO metadata) leaves every SEO column OUT of the patch", async () => {
  const actions = makeTalentActions();
  const adapter = makeAdapter(actions);

  const result = await adapter.saveDraft(TALENT_CTX, {
    expectedVersion: 1,
    metadata: undefined,
    slots: {},
    builderTree: [],
  } as never);

  assert.equal(result.ok, true);
  const patch = actions.savePatches[0] as unknown as Record<string, unknown>;
  for (const key of TALENT_SEO_PATCH_KEYS) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(patch, key),
      false,
      `metadata-less saveDraft must not write "${key}"`,
    );
  }
});

test("[SEO-1][talent] a PARTIAL metadata save only writes the fields it carries", async () => {
  // The legacy saveDraft envelope sends `{ title }` alone. Only `title` (and no
  // SEO column) may reach the patch — the untouched columns keep their values.
  const actions = makeTalentActions();
  const adapter = makeAdapter(actions);

  await adapter.saveDraft(TALENT_CTX, {
    expectedVersion: 1,
    metadata: { title: "Only the title" },
    slots: {},
    builderTree: [],
  } as never);

  const patch = actions.savePatches[0] as unknown as Record<string, unknown>;
  assert.equal(patch.title, "Only the title");
  for (const key of TALENT_SEO_PATCH_KEYS) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(patch, key),
      false,
      `partial-metadata save must not write "${key}"`,
    );
  }
});

// ── End-to-end round trip through the adapter (load → save → load) ────────────

test("[SEO-1][talent] SEO metadata survives a load → save → load round trip", async () => {
  const stored: Record<string, unknown> = {};
  const baseRow = makeFakeTalentPageRow({
    meta_description: "Stored description",
    og_title: "Stored OG title",
  });
  const currentRow = () => ({ ...baseRow, ...stored }) as TalentPageRow;
  const actions: TalentPageAdapterActions = {
    async ensurePage() {
      return currentRow();
    },
    async loadPage() {
      return currentRow();
    },
    async savePage(input) {
      Object.assign(stored, input.patch);
      return { ok: true, updatedAt: new Date("2026-06-11T12:05:00Z").toISOString() };
    },
    async publishPage() {
      return {
        ok: true,
        publishedAt: new Date("2026-06-11T12:06:00Z").toISOString(),
        updatedAt: new Date("2026-06-11T12:06:00Z").toISOString(),
      };
    },
  };
  const adapter = makeAdapter(actions);

  const first = await adapter.load(TALENT_CTX);
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.equal(first.data.metadata.metaDescription, "Stored description");

  // Operator edits the Meta description in the Page settings drawer and saves.
  await adapter.save(TALENT_CTX, {
    locale: "en",
    pageId: first.data.pageId,
    expectedVersion: first.data.pageVersion,
    metadata: { ...first.data.metadata, metaDescription: "Edited description" },
    slots: {},
    builderTree: [],
  } as unknown as CompositionSaveInput);

  // A later tree-only autosave must not undo it.
  await adapter.saveDraft(TALENT_CTX, {
    expectedVersion: first.data.pageVersion,
    metadata: undefined,
    slots: {},
    builderTree: [{ id: "n2" }],
  } as never);

  const second = await adapter.load(TALENT_CTX);
  assert.equal(second.ok, true);
  if (!second.ok) return;
  assert.equal(second.data.metadata.metaDescription, "Edited description");
  assert.equal(second.data.metadata.ogTitle, "Stored OG title");
});
