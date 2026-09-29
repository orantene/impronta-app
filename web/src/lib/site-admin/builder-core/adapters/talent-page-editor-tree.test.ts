/**
 * talent_page: the builder opens on what visitors see.
 *
 * Regression (2026-09-28, demo talent Alba / TAL-93020): "Edit site" opened an
 * empty "Describe your page" canvas while the published site showed the full
 * Maison v2 page. The editor's tree must be the draft (`blocks`) and, when the
 * draft is empty, the live body (`blocks_published`), never an empty page while
 * a live one exists. Also pins the static wiring: the route primes the editor
 * with the row it reads, and the canvas never shows the empty-page starter for
 * a composition that has not loaded or failed to load.
 *
 * node:test + node:assert only; the pure core has no runtime imports.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { blankComments } from "@/lib/quality/supabase-unchecked-read";
import {
  buildEmptyTalentPageComposition,
  createTalentPageAdapter,
  resolveTalentPageEditorTree,
  type TalentPageAdapterActions,
  type TalentPageRow,
} from "./talent-page-adapter-core";

const THIS_DIR = dirname(fileURLToPath(import.meta.url));

const HERO = { id: "hero", kind: "split", props: {}, children: [] };
const GALLERY = { id: "gallery", kind: "container", props: {}, children: [] };

function row(over: Partial<TalentPageRow>): TalentPageRow {
  return {
    id: "page-1",
    talent_profile_id: "tp-1",
    slug: "home",
    title: "Alba",
    status: "published",
    blocks: [],
    theme: {},
    required_talent_tier: null,
    published_at: "2026-09-29T03:31:45.121Z",
    updated_at: "2026-09-29T03:31:45.121Z",
    ...over,
  };
}

test("draft with nodes wins over the live body", () => {
  const tree = resolveTalentPageEditorTree(row({ blocks: [HERO], blocks_published: [GALLERY] }));
  assert.deepEqual(tree, [HERO]);
});

test("empty draft falls back to the published tree", () => {
  const tree = resolveTalentPageEditorTree(row({ blocks: [], blocks_published: [HERO, GALLERY] }));
  assert.deepEqual(tree, [HERO, GALLERY]);
});

test("null draft falls back to the published tree", () => {
  const tree = resolveTalentPageEditorTree(row({ blocks: null, blocks_published: [HERO] }));
  assert.deepEqual(tree, [HERO]);
});

test("no draft and no live body (or pre-migration row) opens empty", () => {
  assert.deepEqual(resolveTalentPageEditorTree(row({ blocks: [], blocks_published: [] })), []);
  assert.deepEqual(resolveTalentPageEditorTree(row({ blocks: null })), []);
  assert.deepEqual(resolveTalentPageEditorTree(row({ blocks: {} as unknown, blocks_published: "x" })), []);
});

test("the composition carries the resolved tree and the real title", () => {
  const data = buildEmptyTalentPageComposition(
    row({ blocks: [], blocks_published: [HERO] }),
    "es",
  );
  assert.deepEqual(data.builderTree, [HERO]);
  assert.equal(data.metadata.title, "Alba");
  assert.equal(data.pageId, "page-1");
});

test("adapter load opens on the published tree when the draft is empty", async () => {
  const actions: TalentPageAdapterActions = {
    ensurePage: async () => row({ blocks: [], blocks_published: [HERO, GALLERY] }),
    loadPage: async () => null,
    savePage: async () => ({ ok: false, error: "unused" }),
    publishPage: async () => ({ ok: false, error: "unused" }),
  };
  const adapter = createTalentPageAdapter(actions, {
    talentProfileId: "tp-1",
    assertNoLegacyWrite: () => {},
  });
  const res = await adapter.load({ locale: "en", pageSlug: "home", pageId: null });
  assert.equal(res.ok, true);
  if (res.ok) assert.deepEqual(res.data.builderTree, [HERO, GALLERY]);
});

test("the load action selects blocks_published", () => {
  const src = blankComments(readFileSync(resolve(THIS_DIR, "talent-page-actions.ts"), "utf8"));
  assert.match(src, /TALENT_PAGE_COLS = `[^`]*blocks_published/);
});

test("the page-builder route primes the editor with the row it reads", () => {
  const src = blankComments(
    readFileSync(
      resolve(THIS_DIR, "../../../../app/(workspace)/talent/page-builder/page.tsx"),
      "utf8",
    ),
  );
  assert.ok(src.includes("blocks_published"), "route must read the live body");
  assert.ok(src.includes("buildEmptyTalentPageComposition("), "route must build the composition");
  assert.ok(src.includes("initialComposition={initialComposition}"), "route must pass it down");
  assert.ok(src.includes("resolveTalentPageEditorTree("), "canvas prime must use the same fallback");
});

test("the canvas shows the empty-page starter only for a LOADED empty page", () => {
  const src = blankComments(
    readFileSync(
      resolve(THIS_DIR, "../../../../components/edit-chrome/in-editor-canvas-region.tsx"),
      "utf8",
    ),
  );
  assert.ok(src.includes("isEmpty && compositionLoaded && !compositionError"));
  assert.ok(src.includes("{showStarter ? <EmptyCanvasStarter /> : null}"));
  assert.ok(!src.includes("{isEmpty ? <EmptyCanvasStarter /> : null}"));
  assert.ok(src.includes("data-in-editor-load-error"));
});
