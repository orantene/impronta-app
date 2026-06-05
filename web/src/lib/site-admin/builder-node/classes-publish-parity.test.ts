/**
 * classes-publish-parity.test.ts — Marathon W0-T5(a).
 *
 * CHARACTERIZATION test for the "classes don't publish" TRUST bug.
 *
 * Today an operator can create a style class, link blocks to it, and publish —
 * and the published page renders those blocks with EMPTY style, because no
 * `renderBuilderNodes` caller threads the class registry and the publish path
 * does not bake the classes into the tree. The `classRef` token survives in the
 * persisted tree but resolves to nothing once the localStorage registry is gone.
 *
 * This file pins BOTH ends:
 *   - the CURRENT (buggy) behavior, so a regression is loud, and
 *   - the DESIRED post-W1 behavior, as a single `it.skip`-marked assertion that
 *     W1-T2 flips to active once publish bakes classes via
 *     resolveBuilderTreeClassRefs. The flip is the test-driven definition of
 *     "classes publish."
 *
 * Runner: node:test via `tsx --test` (uses react-dom/server's
 * renderToStaticMarkup — no DOM, no jsdom). Already in CI via
 * `test:builder-node-bindings`.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { renderBuilderNodes } from "./render";
import type { BuilderNodeTree } from "./types";
import {
  resolveBuilderTreeClassRefs,
  type BuilderStyleClass,
  type BuilderStyleClassRegistry,
} from "./style-classes";

function registry(...classes: BuilderStyleClass[]): BuilderStyleClassRegistry {
  const out: Record<string, BuilderStyleClass> = {};
  for (const c of classes) out[c.id] = c;
  return out;
}

/** Render a tree to HTML, optionally threading the class registry (the editor-
 *  canvas path threads it; the published/server path historically does NOT). */
function render(nodes: BuilderNodeTree, classes?: BuilderStyleClassRegistry): string {
  return renderToStaticMarkup(
    createElement(
      Fragment,
      null,
      renderBuilderNodes(nodes, { publicPathPrefix: "/t", styleClasses: classes }),
    ),
  );
}

/** Isolate the linked heading's opening tag so we assert on ITS inline style,
 *  not on the global stylesheet block the renderer also emits (which contains
 *  unrelated colors). */
function headingTag(html: string): string {
  return (html.match(/<h2[^>]*>/) ?? ["<no-heading>"])[0];
}

/**
 * Model the publish path's tree transform.
 *
 * TODAY (`bakeClasses=false`): publish writes the tree AS-IS — a linked node
 * keeps its bare `{ classRef }` style, so the rendered snapshot has no class
 * styles. This is the bug.
 *
 * POST-W1 (`bakeClasses=true`): `publishHomepage` calls
 * `resolveBuilderTreeClassRefs(tree, registry)` before building the snapshot, so
 * the published tree carries the fully-merged styles and needs no registry at
 * render time.
 */
function publishedTree(
  tree: BuilderNodeTree,
  classes: BuilderStyleClassRegistry,
  bakeClasses: boolean,
): BuilderNodeTree {
  return bakeClasses ? resolveBuilderTreeClassRefs(tree, classes) : tree;
}

const PROMO_TREE: BuilderNodeTree = [
  {
    id: "free:promo-heading",
    kind: "heading",
    props: { text: "Member offer", level: 2, style: { classRef: "promo" } },
  },
];

const PROMO_REGISTRY = registry({
  id: "promo",
  name: "Promo",
  style: { textColor: "#cc0000", fontWeight: 800 },
});

describe("classes-publish-parity (W0-T5a characterization)", () => {
  it("KNOWN BUG: a classRef does NOT reach the published HTML when publish does not bake + the server render omits styleClasses", () => {
    // This is the live bug: publish keeps the bare classRef, the server render
    // path passes no registry → the class color is silently dropped.
    const snapshot = publishedTree(PROMO_TREE, PROMO_REGISTRY, /* bakeClasses */ false);
    const tag = headingTag(render(snapshot /* no styleClasses, mirrors server */));
    assert.doesNotMatch(
      tag,
      /color:#cc0000/i,
      "documents the bug: published heading lacks the class textColor",
    );
    assert.doesNotMatch(tag, /font-weight:800/, "class fontWeight also dropped");
  });

  it.skip("W1-T2 TARGET: a classRef DOES reach the published HTML once publish bakes classes (flip this to it() in W1-T2)", () => {
    // After W1-T2, publishHomepage bakes the registry into the tree via
    // resolveBuilderTreeClassRefs, so the published snapshot renders the class
    // styles WITHOUT any registry threaded at render time. When this passes,
    // classes publish. Un-skip this assertion as the W1-T2 acceptance gate.
    const snapshot = publishedTree(PROMO_TREE, PROMO_REGISTRY, /* bakeClasses */ true);
    const tag = headingTag(render(snapshot /* no styleClasses, mirrors server */));
    assert.match(tag, /color:#cc0000/i, "baked class textColor reaches published HTML");
    assert.match(tag, /font-weight:800/, "baked class fontWeight reaches published HTML");
    assert.doesNotMatch(snapshotJson(snapshot), /classRef/, "no dangling classRef survives publish");
  });

  it("the EDITOR canvas path (styleClasses threaded) already applies the class — proves the renderer is wired, only the callers omit it", () => {
    // renderBuilderNodes WITH the registry threaded is the editor-canvas path
    // (client-builder-canvas). It already resolves the class. The publish bug is
    // purely that the publish + server render callers don't thread/bake it.
    const tag = headingTag(render(PROMO_TREE, PROMO_REGISTRY));
    assert.match(tag, /color:#cc0000/i);
    assert.match(tag, /font-weight:800/);
  });

  it("an UNKNOWN class id renders the node's own overrides only — never blanks the block (safe fallback)", () => {
    const tree: BuilderNodeTree = [
      {
        id: "free:dangling",
        kind: "heading",
        props: { text: "Dangling", level: 2, style: { classRef: "deleted", textColor: "#0088ff" } },
      },
    ];
    // No registry contains "deleted" — the node keeps its own textColor; classRef
    // is stripped; no crash.
    const tag = headingTag(render(tree));
    assert.match(tag, /color:#0088ff/i);
    assert.doesNotMatch(tag, /classRef/);
  });

  it("resolveBuilderTreeClassRefs flattens linked styles AND strips classRef before the snapshot is written (the publish-bake primitive)", () => {
    const tree: BuilderNodeTree = [
      {
        id: "root",
        kind: "container",
        props: { layout: "stack" },
        children: [
          {
            id: "child",
            kind: "heading",
            props: { text: "Hi", level: 3, style: { classRef: "promo", fontWeight: 600 } },
          },
        ],
      },
    ];
    const baked = resolveBuilderTreeClassRefs(tree, PROMO_REGISTRY);
    const child = (baked[0] as Extract<BuilderNodeTree[number], { kind: "container" }>)
      .children[0] as Extract<BuilderNodeTree[number], { kind: "heading" }>;
    assert.equal(child.props.style?.textColor, "#cc0000", "class textColor baked in");
    assert.equal(child.props.style?.fontWeight, 600, "node override preserved");
    assert.equal("classRef" in (child.props.style ?? {}), false, "classRef stripped");
    assert.doesNotMatch(snapshotJson(baked), /classRef/, "no dangling classRefs anywhere in the baked tree");
  });
});

/** Serialize a tree for a coarse "does ANY classRef survive" assertion. */
function snapshotJson(tree: BuilderNodeTree): string {
  return JSON.stringify(tree);
}
