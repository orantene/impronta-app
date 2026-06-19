/**
 * dependency-scan.test.ts — G5 unit tests.
 *
 * Test runner: node:test + node:assert/strict (tsx --test)
 * Run:  node_modules/.bin/tsx --test \
 *         src/lib/site-admin/builder-core/templates/dependency-scan.test.ts
 *
 * Covers the pure dependency scanner that powers the "block archiving a
 * depended-on component" guard:
 *   1. finds templates whose tree embeds the target component (section_embed key)
 *   2. matches NESTED embeds (recurses into children, like the binding visitors)
 *   3. counts multiple matches in one tree
 *   4. an unreferenced component yields no dependents (archive unaffected)
 *   5. matches on builderNodeKinds too
 *   6. an empty target matches nothing
 *   7. dependents are sorted by title (stable confirm copy)
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import {
  scanTemplatesForComponentDependents,
  isEmptyDependencyTarget,
  type ScannableTemplate,
} from "./dependency-scan";

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** A `section_embed` node carrying a curated-section key. */
function embed(sectionTypeKey: string, id = `embed-${sectionTypeKey}`): BuilderNode {
  return {
    id,
    kind: "section_embed",
    props: { sectionTypeKey },
  } as BuilderNode;
}

/** A `section` wrapper with arbitrary children (to exercise the recursion). */
function section(children: BuilderNode[], id = "sec"): BuilderNode {
  return {
    id,
    kind: "section",
    props: {},
    children,
  } as BuilderNode;
}

/** A plain heading node (no dependency). */
function heading(id = "h"): BuilderNode {
  return { id, kind: "heading", props: { text: "x", level: 2 } } as BuilderNode;
}

function tpl(
  id: string,
  title: string,
  tree: BuilderNode[],
): ScannableTemplate {
  return { id, title, slug: `${id}-slug`, builder_tree: tree };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("scanTemplatesForComponentDependents", () => {
  it("finds a template that embeds the target component at the top level", () => {
    const templates = [
      tpl("a", "Alpha", [embed("directory")]),
      tpl("b", "Beta", [heading()]),
    ];
    const deps = scanTemplatesForComponentDependents(templates, {
      sectionEmbedKeys: ["directory"],
    });
    assert.equal(deps.length, 1);
    assert.equal(deps[0]!.id, "a");
    assert.equal(deps[0]!.matchCount, 1);
  });

  it("matches a NESTED embed (recurses into children like the binding visitors)", () => {
    const templates = [
      tpl("a", "Alpha", [section([heading(), section([embed("booking")])])]),
    ];
    const deps = scanTemplatesForComponentDependents(templates, {
      sectionEmbedKeys: ["booking"],
    });
    assert.equal(deps.length, 1);
    assert.equal(deps[0]!.id, "a");
    assert.equal(deps[0]!.matchCount, 1);
  });

  it("counts multiple matches within one tree", () => {
    const templates = [
      tpl("a", "Alpha", [
        embed("cta", "e1"),
        section([embed("cta", "e2"), embed("cta", "e3")]),
      ]),
    ];
    const deps = scanTemplatesForComponentDependents(templates, {
      sectionEmbedKeys: ["cta"],
    });
    assert.equal(deps.length, 1);
    assert.equal(deps[0]!.matchCount, 3);
  });

  it("returns NO dependents for an unreferenced component (archive unaffected)", () => {
    const templates = [
      tpl("a", "Alpha", [embed("directory")]),
      tpl("b", "Beta", [section([heading()])]),
    ];
    const deps = scanTemplatesForComponentDependents(templates, {
      sectionEmbedKeys: ["featured-talent"],
    });
    assert.equal(deps.length, 0);
  });

  it("matches on builderNodeKinds too", () => {
    const templates = [
      tpl("a", "Alpha", [section([{ id: "f1", kind: "form", props: { fields: [] } } as BuilderNode])]),
      tpl("b", "Beta", [heading()]),
    ];
    const deps = scanTemplatesForComponentDependents(templates, {
      builderNodeKinds: ["form"],
    });
    assert.equal(deps.length, 1);
    assert.equal(deps[0]!.id, "a");
  });

  it("an empty target matches nothing", () => {
    const templates = [tpl("a", "Alpha", [embed("directory")])];
    assert.equal(isEmptyDependencyTarget({}), true);
    assert.equal(
      scanTemplatesForComponentDependents(templates, {}).length,
      0,
    );
    assert.equal(
      scanTemplatesForComponentDependents(templates, {
        sectionEmbedKeys: [],
        builderNodeKinds: [],
      }).length,
      0,
    );
  });

  it("sorts dependents by title for stable confirm copy", () => {
    const templates = [
      tpl("z", "Zulu", [embed("directory")]),
      tpl("a", "Alpha", [embed("directory")]),
      tpl("m", "Mike", [embed("directory")]),
    ];
    const deps = scanTemplatesForComponentDependents(templates, {
      sectionEmbedKeys: ["directory"],
    });
    assert.deepEqual(
      deps.map((d) => d.title),
      ["Alpha", "Mike", "Zulu"],
    );
  });
});
