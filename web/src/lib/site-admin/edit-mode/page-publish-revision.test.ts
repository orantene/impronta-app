/**
 * WAVE 1.2 + 1.4 — cms-page publish draft-integrity regressions.
 *
 * 1.4  A page built entirely from root freeform blocks has ZERO
 *      `cms_page_sections` draft rows, and `publishPageSnapshot` used to
 *      hard-fail it with "No draft sections to publish". Such a page could
 *      never be published at all.
 * 1.2  The publish bumps `cms_pages.version` but wrote NO revision at the new
 *      version. Every editor load reads the version-matched revision, found
 *      nothing, and painted an empty canvas immediately after "Published"; the
 *      next autosave then persisted the degraded tree.
 *
 * Run:
 *   npx tsx --test src/lib/site-admin/edit-mode/page-publish-revision.test.ts
 *   (Glob-covered by `test:builder` via src/lib/site-admin/edit-mode/*.test.ts.)
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { createBuilderNode } from "../builder-node/create";
import type { BuilderNode, BuilderNodeTree } from "../builder-node/types";
import {
  buildPublishedPageRevisionSnapshot,
  isFreeformPagePublish,
} from "./page-publish-revision";

function freeformTree(): BuilderNodeTree {
  const container = createBuilderNode("container");
  const h1 = createBuilderNode("heading");
  (container as { children: BuilderNode[] }).children = [h1];
  return [container] as BuilderNodeTree;
}

describe("isFreeformPagePublish (WAVE 1.4)", () => {
  test("zero slot rows + a non-empty tree publishes (was: hard-failed)", () => {
    assert.equal(
      isFreeformPagePublish({ draftSlotRowCount: 0, builderTree: freeformTree() }),
      true,
    );
  });

  test("zero slot rows + no tree still rejects (genuinely empty page)", () => {
    assert.equal(
      isFreeformPagePublish({ draftSlotRowCount: 0, builderTree: [] }),
      false,
    );
    assert.equal(
      isFreeformPagePublish({ draftSlotRowCount: 0, builderTree: undefined }),
      false,
    );
  });

  test("a slot-based page is never treated as freeform", () => {
    assert.equal(
      isFreeformPagePublish({ draftSlotRowCount: 2, builderTree: freeformTree() }),
      false,
    );
  });
});

describe("buildPublishedPageRevisionSnapshot (WAVE 1.2)", () => {
  const base = {
    title: "About",
    locale: "en",
    metaDescription: "Meta",
    version: 8,
    publishedAt: "2026-08-05T10:00:00.000Z",
    composition: [],
  };

  test("the published revision carries the builderTree at the NEW version", () => {
    const tree = freeformTree();
    const snap = buildPublishedPageRevisionSnapshot({ ...base, builderTree: tree });
    assert.equal(snap.version, 8, "stamped at the post-publish version");
    assert.equal(snap.kind, "published");
    assert.deepEqual(
      snap.builderTree,
      tree,
      "tree present so the editor's version-matched read is not empty",
    );
  });

  test("style extras are carried forward from the previous revision", () => {
    const snap = buildPublishedPageRevisionSnapshot({
      ...base,
      builderTree: freeformTree(),
      previousSnapshot: {
        styleClasses: { c1: { id: "c1", name: "Lead", style: {} } },
        stylePresets: { presets: [], clipboard: null },
      },
    });
    assert.ok(snap.styleClasses, "linked classes survive a publish + reload");
    assert.ok(snap.stylePresets, "presets survive a publish + reload");
  });

  test("an empty tree writes no builderTree key (never freeze emptiness)", () => {
    const snap = buildPublishedPageRevisionSnapshot({
      ...base,
      builderTree: [] as unknown as BuilderNodeTree,
    });
    assert.equal("builderTree" in snap, false);
  });

  test("composition is preserved for slot-based pages", () => {
    const snap = buildPublishedPageRevisionSnapshot({
      ...base,
      composition: [{ slotKey: "body", sortOrder: 0, sectionId: "s1" }],
      builderTree: freeformTree(),
    });
    assert.equal((snap.composition as unknown[]).length, 1);
  });
});
