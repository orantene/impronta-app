import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { renderBuilderNodes } from "./render";
import type { BuilderNode, BuilderNodeStyle, BuilderNodeTree } from "./types";
import {
  countNodesLinkedToClass,
  countNodesLinkedToClasses,
  getNodeClassRef,
  mergeBuilderNodeStyle,
  resolveBuilderTreeClassRefs,
  resolveNodeStyleWithClass,
  stripClassRef,
  styleClassIdFromName,
  type BuilderStyleClass,
  type BuilderStyleClassRegistry,
} from "./style-classes";

function registry(...classes: BuilderStyleClass[]): BuilderStyleClassRegistry {
  const out: Record<string, BuilderStyleClass> = {};
  for (const c of classes) out[c.id] = c;
  return out;
}

function render(nodes: BuilderNodeTree, classes?: BuilderStyleClassRegistry): string {
  return renderToStaticMarkup(
    createElement(
      Fragment,
      null,
      renderBuilderNodes(nodes, { publicPathPrefix: "/t", styleClasses: classes }),
    ),
  );
}

// ── Core merge resolution: class base + node override ──────────────────────

describe("style-classes: mergeBuilderNodeStyle (class base + node override)", () => {
  it("node props win; unset node props inherit the class", () => {
    const base: BuilderNodeStyle = {
      textColor: "#111111",
      backgroundColor: "#eeeeee",
      radius: "lg",
    };
    const override: BuilderNodeStyle = { textColor: "#ffffff" };
    const merged = mergeBuilderNodeStyle(base, override);
    assert.equal(merged.textColor, "#ffffff"); // node override wins
    assert.equal(merged.backgroundColor, "#eeeeee"); // inherited from class
    assert.equal(merged.radius, "lg"); // inherited from class
  });

  it("an explicitly-undefined node prop does NOT clobber the class value", () => {
    const base: BuilderNodeStyle = { textColor: "#111111" };
    const override: BuilderNodeStyle = { textColor: undefined, fontWeight: 700 };
    const merged = mergeBuilderNodeStyle(base, override);
    assert.equal(merged.textColor, "#111111");
    assert.equal(merged.fontWeight, 700);
  });

  it("merges per-breakpoint responsive buckets (tablet + mobile) independently", () => {
    const base: BuilderNodeStyle = {
      responsive: { tablet: { size: "lg", align: "center" }, mobile: { size: "md" } },
    };
    const override: BuilderNodeStyle = {
      responsive: { tablet: { align: "left" }, mobile: { background: "surface" } },
    };
    const merged = mergeBuilderNodeStyle(base, override);
    assert.equal(merged.responsive?.tablet?.size, "lg"); // from class
    assert.equal(merged.responsive?.tablet?.align, "left"); // node override
    assert.equal(merged.responsive?.mobile?.size, "md"); // from class
    assert.equal(merged.responsive?.mobile?.background, "surface"); // node
  });

  it("merges containerQueries + hover buckets", () => {
    const base: BuilderNodeStyle = {
      containerQueries: { tablet: { size: "lg" } },
      hover: { backgroundColor: "#000000", scale: "1.02" },
    };
    const override: BuilderNodeStyle = {
      containerQueries: { tablet: { align: "center" } },
      hover: { scale: "1.05" },
    };
    const merged = mergeBuilderNodeStyle(base, override);
    assert.equal(merged.containerQueries?.tablet?.size, "lg");
    assert.equal(merged.containerQueries?.tablet?.align, "center");
    assert.equal(merged.hover?.backgroundColor, "#000000"); // class
    assert.equal(merged.hover?.scale, "1.05"); // node override wins
  });

  it("never carries classRef on the merged result", () => {
    const merged = mergeBuilderNodeStyle(
      { textColor: "#111", classRef: "should-not-appear" } as BuilderNodeStyle,
      { classRef: "card", fontWeight: 600 } as BuilderNodeStyle,
    );
    assert.equal("classRef" in merged, false);
    assert.equal(merged.textColor, "#111");
    assert.equal(merged.fontWeight, 600);
  });

  it("omits empty responsive/containerQueries/hover containers (minimal output)", () => {
    const merged = mergeBuilderNodeStyle({ textColor: "#111" }, { fontWeight: 600 });
    assert.equal("responsive" in merged, false);
    assert.equal("containerQueries" in merged, false);
    assert.equal("hover" in merged, false);
  });
});

describe("style-classes: resolveNodeStyleWithClass", () => {
  const classes = registry({
    id: "card-elevated",
    name: "Elevated card",
    style: { backgroundColor: "#ffffff", radius: "lg", boxShadow: "0 10px 28px rgba(0,0,0,.1)" },
  });

  it("merges the referenced class as the BASE, node props on top", () => {
    const resolved = resolveNodeStyleWithClass(
      { classRef: "card-elevated", backgroundColor: "#f0f0f0" },
      classes,
    );
    assert.equal(resolved?.backgroundColor, "#f0f0f0"); // node wins
    assert.equal(resolved?.radius, "lg"); // from class
    assert.equal(resolved?.boxShadow, "0 10px 28px rgba(0,0,0,.1)"); // from class
    assert.equal("classRef" in (resolved ?? {}), false); // stripped
  });

  it("returns the style by IDENTITY when there is no classRef (byte-identity)", () => {
    const style: BuilderNodeStyle = { textColor: "#111" };
    assert.equal(resolveNodeStyleWithClass(style, classes), style);
  });

  it("returns the style by IDENTITY when no registry is supplied + has no classRef", () => {
    const style: BuilderNodeStyle = { textColor: "#111" };
    assert.equal(resolveNodeStyleWithClass(style, undefined), style);
  });

  it("falls through to the node's own style (classRef stripped) for an UNKNOWN class id", () => {
    const resolved = resolveNodeStyleWithClass(
      { classRef: "deleted-class", textColor: "#abcabc" },
      classes,
    );
    assert.equal(resolved?.textColor, "#abcabc");
    assert.equal("classRef" in (resolved ?? {}), false);
  });

  it("passes undefined style through unchanged", () => {
    assert.equal(resolveNodeStyleWithClass(undefined, classes), undefined);
  });
});

describe("style-classes: stripClassRef / getNodeClassRef / countNodesLinkedToClass", () => {
  it("stripClassRef removes only classRef and is identity when absent", () => {
    const plain: BuilderNodeStyle = { textColor: "#111" };
    assert.equal(stripClassRef(plain), plain); // identity
    const stripped = stripClassRef({ classRef: "x", textColor: "#111" });
    assert.deepEqual(stripped, { textColor: "#111" });
  });

  it("getNodeClassRef reads the linked class id or null", () => {
    const linked: BuilderNode = {
      id: "n1",
      kind: "card",
      props: { variant: "outline", style: { classRef: "card-elevated" } },
      children: [],
    };
    const plain: BuilderNode = {
      id: "n2",
      kind: "card",
      props: { variant: "outline" },
      children: [],
    };
    assert.equal(getNodeClassRef(linked), "card-elevated");
    assert.equal(getNodeClassRef(plain), null);
  });

  it("countNodesLinkedToClass counts across a nested tree", () => {
    const tree: BuilderNodeTree = [
      {
        id: "root",
        kind: "container",
        props: { layout: "stack" },
        children: [
          { id: "a", kind: "card", props: { style: { classRef: "promo" } }, children: [] },
          { id: "b", kind: "card", props: { style: { classRef: "promo" } }, children: [] },
          { id: "c", kind: "card", props: { style: { classRef: "other" } }, children: [] },
        ],
      },
    ];
    assert.equal(countNodesLinkedToClass(tree, "promo"), 2);
    assert.equal(countNodesLinkedToClass(tree, "other"), 1);
    assert.equal(countNodesLinkedToClass(tree, "none"), 0);
  });

  it("countNodesLinkedToClasses (single pass) === per-class countNodesLinkedToClass", () => {
    // Deeper tree: nested children, a class linked at multiple depths, a class
    // with zero links, and a node whose classRef isn't in the queried set.
    const tree: BuilderNodeTree = [
      {
        id: "root",
        kind: "container",
        props: { style: { classRef: "promo" } },
        children: [
          { id: "a", kind: "card", props: { style: { classRef: "promo" } }, children: [] },
          { id: "b", kind: "card", props: { style: { classRef: "other" } }, children: [
            { id: "b1", kind: "heading", props: { style: { classRef: "promo" } } },
            { id: "b2", kind: "text", props: {} },
            { id: "b3", kind: "text", props: { style: { classRef: "untracked" } } },
          ] },
        ],
      },
      { id: "loose", kind: "card", props: { style: { classRef: "other" } }, children: [] },
    ];
    const ids = ["promo", "other", "none"];
    const batch = countNodesLinkedToClasses(tree, ids);
    const reference = Object.fromEntries(
      ids.map((id) => [id, countNodesLinkedToClass(tree, id)]),
    );
    assert.deepEqual(batch, reference);
    // sanity: exact expected values (promo×3, other×2, none×0) + "untracked"
    // node is ignored because it isn't in the queried id set.
    assert.deepEqual(batch, { promo: 3, other: 2, none: 0 });
  });

  it("countNodesLinkedToClasses ignores dangling refs named like prototype members", () => {
    // A node whose classRef is a deleted class named "constructor"/"toString"
    // (valid class-id strings) must NOT leak a phantom key — `ref in counts`
    // would have via the prototype chain.
    const tree: BuilderNodeTree = [
      { id: "a", kind: "card", props: { style: { classRef: "constructor" } }, children: [] },
      { id: "b", kind: "card", props: { style: { classRef: "toString" } }, children: [] },
      { id: "c", kind: "card", props: { style: { classRef: "promo" } }, children: [] },
    ];
    const ids = ["promo"]; // the prototype-named refs are NOT queried
    const batch = countNodesLinkedToClasses(tree, ids);
    assert.deepEqual(batch, { promo: 1 });
    assert.deepEqual(
      batch,
      Object.fromEntries(ids.map((id) => [id, countNodesLinkedToClass(tree, id)])),
    );
  });
});

describe("style-classes: styleClassIdFromName", () => {
  it("slugifies a name", () => {
    assert.equal(styleClassIdFromName("Elevated Card!", []), "elevated-card");
    assert.equal(styleClassIdFromName("  Hero  Title  ", []), "hero-title");
  });
  it("falls back to 'class' for an empty/symbol-only name", () => {
    assert.equal(styleClassIdFromName("   ", []), "class");
    assert.equal(styleClassIdFromName("!!!", []), "class");
  });
  it("de-duplicates against existing ids", () => {
    assert.equal(styleClassIdFromName("Card", ["card"]), "card-2");
    assert.equal(styleClassIdFromName("Card", ["card", "card-2"]), "card-3");
  });
});

// ── Tree pre-resolution (flatten classRefs) ────────────────────────────────

describe("style-classes: resolveBuilderTreeClassRefs", () => {
  const classes = registry({
    id: "promo",
    name: "Promo",
    style: { textColor: "#cc0000", radius: "pill" },
  });

  it("flattens every linked node's style and strips classRef", () => {
    const tree: BuilderNodeTree = [
      {
        id: "root",
        kind: "container",
        props: { layout: "stack" },
        children: [
          {
            id: "h",
            kind: "heading",
            props: { text: "Hi", level: 2, style: { classRef: "promo", fontWeight: 800 } },
          },
        ],
      },
    ];
    const flattened = resolveBuilderTreeClassRefs(tree, classes);
    const heading = (flattened[0] as Extract<BuilderNode, { kind: "container" }>)
      .children[0] as Extract<BuilderNode, { kind: "heading" }>;
    assert.equal(heading.props.style?.textColor, "#cc0000"); // from class
    assert.equal(heading.props.style?.radius, "pill"); // from class
    assert.equal(heading.props.style?.fontWeight, 800); // node
    assert.equal("classRef" in (heading.props.style ?? {}), false);
  });

  it("strips dangling classRefs even when no registry is supplied", () => {
    const tree: BuilderNodeTree = [
      { id: "h", kind: "heading", props: { text: "x", level: 2, style: { classRef: "gone" } } },
    ];
    const flattened = resolveBuilderTreeClassRefs(tree, undefined);
    const heading = flattened[0] as Extract<BuilderNode, { kind: "heading" }>;
    assert.equal("classRef" in (heading.props.style ?? {}), false);
  });
});

// ── End-to-end: the renderer honors linked classes ─────────────────────────

describe("style-classes: renderBuilderNodes honors classRef", () => {
  it("a class textColor cascades to inline CSS; the node override wins", () => {
    const classes = registry({
      id: "ink",
      name: "Ink",
      style: { textColor: "#123456", fontWeight: 700 },
    });
    const linkedHtml = render(
      [
        {
          id: "free:h",
          kind: "heading",
          props: { text: "Linked", level: 2, style: { classRef: "ink" } },
        },
      ],
      classes,
    );
    // The class color + weight are emitted from the merged style.
    assert.match(linkedHtml, /color:#123456/i);
    assert.match(linkedHtml, /font-weight:700/);

    const overrideHtml = render(
      [
        {
          id: "free:h",
          kind: "heading",
          props: { text: "Linked", level: 2, style: { classRef: "ink", textColor: "#abcdef" } },
        },
      ],
      classes,
    );
    assert.match(overrideHtml, /color:#abcdef/i); // override wins
    assert.match(overrideHtml, /font-weight:700/); // still inherited
  });

  it("an UNKNOWN class id renders the node's own style (never blanks)", () => {
    const html = render([
      {
        id: "free:h",
        kind: "heading",
        props: { text: "Dangling", level: 2, style: { classRef: "missing", textColor: "#ff0000" } },
      },
    ]);
    assert.match(html, /color:#ff0000/i);
  });

  it("a node with NO classRef is byte-identical with and without a registry present", () => {
    const node: BuilderNode = {
      id: "free:plain",
      kind: "heading",
      props: { text: "Plain", level: 2, style: { textColor: "#0a0a0a" } },
    };
    const withRegistry = render([node], registry({ id: "x", name: "X", style: { radius: "lg" } }));
    const withoutRegistry = render([node]);
    assert.equal(withRegistry, withoutRegistry);
  });

  it("a class can carry responsive layers that cascade through the merge", () => {
    const classes = registry({
      id: "stack-mobile",
      name: "Stack on mobile",
      style: { responsive: { mobile: { textColor: "#777777" } } },
    });
    const html = render(
      [
        {
          id: "free:p",
          kind: "paragraph",
          props: { text: "Responsive class", style: { classRef: "stack-mobile" } },
        },
      ],
      classes,
    );
    assert.match(html, /--bn-mobile-text-color:#777777/);
    assert.match(html, /data-builder-style-mobile-text-color/);
  });
});
