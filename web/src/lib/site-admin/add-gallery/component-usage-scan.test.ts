/**
 * component-usage-scan.test.ts — D1 unit tests.
 *
 * Test runner: node:test + node:assert/strict (tsx --test)
 * Run:  node_modules/.bin/tsx --test \
 *         src/lib/site-admin/add-gallery/component-usage-scan.test.ts
 *
 * Covers the PURE component-TYPE usage tally that powers the Catalog "Used N"
 * column (no DB, no I/O):
 *   1. walk a bare BuilderNode[] tree → tallies node.kind counts (recursing children)
 *   2. counts repeated kinds + nested kinds the same way the binding visitors do
 *   3. walks WRAPPED shapes — a `{ tree: [...] }` envelope and nodes nested in
 *      props/snapshots — so the heterogeneous source columns all tally correctly
 *   4. section_embed nodes additionally tally their props.sectionTypeKey
 *   5. null / non-object / empty inputs tally to nothing (never throw)
 *   6. mergeUsageTallies sums per-source tallies (byKind + bySectionEmbedKey)
 *   7. usageCountForItem resolves nativeKind → byKind, sectionEmbedKey →
 *      bySectionEmbedKey, returns 0 for a real-but-unused type, undefined for an
 *      item with no countable type
 *   8. a manual multi-tree audit matches the merged aggregate (acceptance)
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import type { AddGalleryItem } from "./types";
import {
  tallyTreeJson,
  mergeUsageTallies,
  usageCountForItem,
  emptyUsageTally,
} from "./component-usage-scan";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function heading(id = "h"): BuilderNode {
  return { id, kind: "heading", props: { text: "x", level: 2 } } as BuilderNode;
}
function button(id = "b"): BuilderNode {
  return { id, kind: "button", props: { label: "Go" } } as BuilderNode;
}
function section(children: BuilderNode[], id = "sec"): BuilderNode {
  return { id, kind: "section", props: {}, children } as BuilderNode;
}
function embed(sectionTypeKey: string, id = `embed-${sectionTypeKey}`): BuilderNode {
  return { id, kind: "section_embed", props: { sectionTypeKey } } as BuilderNode;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("component-usage-scan: tallyTreeJson", () => {
  it("walks a bare node array and tallies node.kind, recursing children", () => {
    const tree: BuilderNode[] = [
      section([heading("h1"), button("b1")], "s1"),
      heading("h2"),
    ];
    const t = tallyTreeJson(tree);
    assert.equal(t.byKind.section, 1);
    assert.equal(t.byKind.heading, 2); // one nested, one top-level
    assert.equal(t.byKind.button, 1);
  });

  it("counts repeated + deeply nested kinds", () => {
    const tree: BuilderNode[] = [
      section([section([button("b1"), button("b2")], "inner")], "outer"),
    ];
    const t = tallyTreeJson(tree);
    assert.equal(t.byKind.section, 2);
    assert.equal(t.byKind.button, 2);
  });

  it("walks a { tree: [...] } envelope shape", () => {
    const wrapped = { tree: [heading("h1"), button("b1")], meta: { v: 1 } };
    const t = tallyTreeJson(wrapped);
    assert.equal(t.byKind.heading, 1);
    assert.equal(t.byKind.button, 1);
  });

  it("walks nodes nested arbitrarily in a snapshot object", () => {
    const snapshot = {
      page: { sections: [section([heading("h1")], "s1")] },
      shell: { header: button("b1") },
    };
    const t = tallyTreeJson(snapshot);
    assert.equal(t.byKind.section, 1);
    assert.equal(t.byKind.heading, 1);
    assert.equal(t.byKind.button, 1);
  });

  it("tallies section_embed sectionTypeKey separately (+ in byKind)", () => {
    const tree: BuilderNode[] = [embed("hero", "e1"), embed("hero", "e2"), embed("about", "e3")];
    const t = tallyTreeJson(tree);
    assert.equal(t.byKind.section_embed, 3);
    assert.equal(t.bySectionEmbedKey.hero, 2);
    assert.equal(t.bySectionEmbedKey.about, 1);
  });

  it("returns empty tallies for null / non-object / empty inputs (no throw)", () => {
    assert.deepEqual(tallyTreeJson(null), emptyUsageTally());
    assert.deepEqual(tallyTreeJson(undefined), emptyUsageTally());
    assert.deepEqual(tallyTreeJson(42), emptyUsageTally());
    assert.deepEqual(tallyTreeJson([]), emptyUsageTally());
    assert.deepEqual(tallyTreeJson({ kind: "" }), emptyUsageTally()); // empty kind ignored
  });
});

describe("component-usage-scan: mergeUsageTallies", () => {
  it("sums per-source tallies across both maps", () => {
    const a = tallyTreeJson([heading("h1"), button("b1"), embed("hero", "e1")]);
    const b = tallyTreeJson([heading("h2"), embed("hero", "e2")]);
    const merged = mergeUsageTallies(a, b);
    assert.equal(merged.byKind.heading, 2);
    assert.equal(merged.byKind.button, 1);
    assert.equal(merged.byKind.section_embed, 2);
    assert.equal(merged.bySectionEmbedKey.hero, 2);
  });

  it("is identity over an empty list and does not mutate inputs", () => {
    assert.deepEqual(mergeUsageTallies(), emptyUsageTally());
    const a = tallyTreeJson([heading("h1")]);
    const before = JSON.stringify(a);
    mergeUsageTallies(a, a);
    assert.equal(JSON.stringify(a), before); // unchanged
  });
});

describe("component-usage-scan: usageCountForItem", () => {
  const tally = mergeUsageTallies(
    tallyTreeJson([heading("h1"), heading("h2"), embed("hero", "e1")]),
  );

  function item(over: Partial<AddGalleryItem>): AddGalleryItem {
    return { nativeKind: undefined, sectionEmbedKey: undefined, ...over } as AddGalleryItem;
  }

  it("resolves a native item on its nativeKind", () => {
    assert.equal(usageCountForItem(item({ nativeKind: "heading" }), tally), 2);
  });

  it("resolves a section-embed item on its sectionEmbedKey", () => {
    assert.equal(usageCountForItem(item({ sectionEmbedKey: "hero" }), tally), 1);
  });

  it("returns 0 for a real type that is unused (not undefined)", () => {
    assert.equal(usageCountForItem(item({ nativeKind: "carousel" }), tally), 0);
  });

  it("returns undefined for an item with no countable type", () => {
    assert.equal(usageCountForItem(item({}), tally), undefined);
  });
});

describe("component-usage-scan: acceptance — manual multi-tree audit matches", () => {
  it("aggregate across four source columns equals a hand count", () => {
    // Mimic the four tenant tree columns the action reads.
    const cmsPagesBlocks = [section([heading("h1"), button("b1")], "p1")]; // section1 heading1 button1
    const cmsSectionProps = { tree: [heading("h2"), button("b2")] }; // heading1 button1
    const builderComponentSubtree = [button("b3")]; // button1
    const talentSiteSnapshot = {
      shell: section([embed("hero", "e1")], "shell"), // section1 section_embed1 hero1
    };

    const merged = mergeUsageTallies(
      tallyTreeJson(cmsPagesBlocks),
      tallyTreeJson(cmsSectionProps),
      tallyTreeJson(builderComponentSubtree),
      tallyTreeJson(talentSiteSnapshot),
    );

    // Manual audit: section ×2, heading ×2, button ×3, section_embed ×1.
    assert.equal(merged.byKind.section, 2);
    assert.equal(merged.byKind.heading, 2);
    assert.equal(merged.byKind.button, 3);
    assert.equal(merged.byKind.section_embed, 1);
    assert.equal(merged.bySectionEmbedKey.hero, 1);

    // And the resolver reports those counts per item type.
    assert.equal(usageCountForItem({ nativeKind: "button" } as AddGalleryItem, merged), 3);
    assert.equal(usageCountForItem({ sectionEmbedKey: "hero" } as AddGalleryItem, merged), 1);
  });
});
