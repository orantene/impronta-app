/**
 * PERF (A2 + A3) — per-NODE canvas memo granularity, proven on a REAL React
 * commit cycle (jsdom + react-dom/client), not renderToStaticMarkup.
 *
 * What is locked here:
 *   A2 (shipped #999): `renderBuilderNodes` / `renderFreeformPageRootTree`
 *     preserve options identity (WeakMap caches), so a re-render with the SAME
 *     tree + SAME options reference re-renders NOTHING.
 *   A3 (this change): `renderChildren` (and the data-bound / instance /
 *     carousel / tabs child paths) emit every child through the memoized
 *     `BuilderNodeView` boundary, so an immutable patch to ONE node re-renders
 *     exactly that node's ancestor path — unchanged SIBLING subtrees bail, even
 *     inside the same root block.
 *   Repaint guarantee: a NEW options identity (theme / style-class / locale /
 *     dataSources change on the canvas useMemo) repaints EVERY node — the memo
 *     must never suppress those.
 *
 * Probe: `options.renderSectionEmbed` is invoked during the render of a
 * `section_embed` node, so counting its calls per node id observably counts
 * which subtrees React actually re-rendered. No react internals, no spies on
 * the renderer.
 *
 * NEGATIVE-TEST PROTOCOL (verified by hand when this file was authored — see
 * PR body): (1) reverting renderChildren to call renderBuilderNode(child,
 * options) directly makes the "sibling subtrees bail" test FAIL (embed-inner /
 * embed-side re-render on an unrelated patch); (2) making
 * normalizeBuilderNodeRenderOptions return a fresh object makes the
 * "no-op re-render renders nothing" test FAIL. Both restored.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { JSDOM } from "jsdom";

// ── jsdom globals BEFORE react-dom/client touches document ──────────────────
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
});
const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});
g.HTMLElement = dom.window.HTMLElement;
g.HTMLIFrameElement = dom.window.HTMLIFrameElement;
g.Element = dom.window.Element;
g.Node = dom.window.Node;
g.MutationObserver = dom.window.MutationObserver;
g.CustomEvent = dom.window.CustomEvent;
g.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
g.requestAnimationFrame = (cb: FrameRequestCallback) =>
  setTimeout(() => cb(Date.now()), 0) as unknown as number;
g.cancelAnimationFrame = (id: number) => clearTimeout(id);
g.IS_REACT_ACT_ENVIRONMENT = true;

/* eslint-disable import/first -- jsdom globals must exist before these load */
import { act } from "react";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  renderFreeformPageRootTree,
  type BuilderNode,
  type BuilderNodeRenderOptions,
  type BuilderNodeTree,
} from "@/lib/site-admin/builder-node";
/* eslint-enable import/first */

// ── fixture tree ─────────────────────────────────────────────────────────────
// root-1 (container)
//   ├── para-a          (paragraph)
//   ├── branch          (container)
//   │     ├── embed-inner (section_embed)  ← must bail when para-b changes
//   │     └── para-b      (paragraph)      ← the patched node
//   └── embed-side      (section_embed)    ← must bail when para-b changes
// root-2 (container)
//   └── embed-2         (section_embed)    ← must bail on any root-1 patch
function makeTree(paraBText: string): BuilderNodeTree {
  return [
    {
      id: "root-1",
      kind: "container",
      props: { layout: "stack" },
      children: [
        { id: "para-a", kind: "paragraph", props: { text: "alpha" } },
        {
          id: "branch",
          kind: "container",
          props: { layout: "stack" },
          children: [
            {
              id: "embed-inner",
              kind: "section_embed",
              props: { sectionTypeKey: "custom" },
            },
            { id: "para-b", kind: "paragraph", props: { text: paraBText } },
          ],
        },
        {
          id: "embed-side",
          kind: "section_embed",
          props: { sectionTypeKey: "custom" },
        },
      ],
    },
    {
      id: "root-2",
      kind: "container",
      props: { layout: "stack" },
      children: [
        {
          id: "embed-2",
          kind: "section_embed",
          props: { sectionTypeKey: "custom" },
        },
      ],
    },
  ] as BuilderNodeTree;
}

/** Immutably patch para-b's text — re-identifies para-b → branch → root-1 →
 * tree, exactly like patchBuilderNodeProps does. Every OTHER node keeps its
 * previous object identity. */
function patchParaB(tree: BuilderNodeTree, text: string): BuilderNodeTree {
  return tree.map((root) => {
    if (root.id !== "root-1") return root;
    const r = root as Extract<BuilderNode, { kind: "container" }>;
    return {
      ...r,
      children: r.children.map((child) => {
        if (child.id !== "branch") return child;
        const b = child as Extract<BuilderNode, { kind: "container" }>;
        return {
          ...b,
          children: b.children.map((inner) =>
            inner.id === "para-b"
              ? { ...inner, props: { ...inner.props, text } }
              : inner,
          ),
        };
      }),
    } as BuilderNode;
  });
}

// ── probe options ────────────────────────────────────────────────────────────
const embedRenderLog: string[] = [];
function makeOptions(): BuilderNodeRenderOptions {
  return {
    mode: "freeform",
    includeRendererStyles: false,
    includeFontLinks: false,
    renderSectionEmbed: (node: BuilderNode) => {
      embedRenderLog.push(node.id);
      return <div data-probe-embed={node.id} />;
    },
  };
}

function Host({
  tree,
  options,
}: {
  tree: BuilderNodeTree;
  options: BuilderNodeRenderOptions;
}): ReactNode {
  return renderFreeformPageRootTree(tree, options);
}

function mount(): { root: Root; container: HTMLElement } {
  const container = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(container);
  const root = createRoot(container);
  return { root, container };
}

function drain(): string[] {
  return embedRenderLog.splice(0, embedRenderLog.length);
}

test("per-node canvas memo: bail + granularity + repaint guarantees", async (t) => {
  const options = makeOptions();
  const tree1 = makeTree("bravo");
  const { root, container } = mount();

  await t.test("initial mount renders every embed exactly once", () => {
    act(() => {
      root.render(<Host tree={tree1} options={options} />);
    });
    assert.deepEqual(
      drain().sort(),
      ["embed-2", "embed-inner", "embed-side"],
      "each section_embed painted once on mount",
    );
    assert.equal(
      container.querySelectorAll("[data-probe-embed]").length,
      3,
      "probe DOM present",
    );
  });

  await t.test(
    "A2 — same tree + same options re-render renders NOTHING",
    () => {
      act(() => {
        root.render(<Host tree={tree1} options={options} />);
      });
      assert.deepEqual(
        drain(),
        [],
        "identity-stable re-render must bail at every node (normalized-options WeakMap + BuilderNodeView memo)",
      );
    },
  );

  const tree2 = patchParaB(tree1, "charlie");

  await t.test(
    "A3 — patching ONE node re-renders only its ancestor path; sibling subtrees bail",
    () => {
      act(() => {
        root.render(<Host tree={tree2} options={options} />);
      });
      assert.deepEqual(
        drain(),
        [],
        "embed-inner (sibling of the patched node), embed-side (sibling of its ancestor) and embed-2 (other root block) must all keep their previous vdom",
      );
      const paraB = container.querySelector('[data-builder-node-id="para-b"]');
      assert.ok(paraB, "patched node present");
      assert.equal(
        paraB.textContent,
        "charlie",
        "the patched node's new text actually painted (the bail did not swallow the edit)",
      );
    },
  );

  await t.test(
    "repaint guarantee — a NEW options identity repaints EVERY node",
    () => {
      // The canvas useMemo produces a new options object when theme /
      // style-classes / component defaults / locale / dataSources change. The
      // memo must never suppress that repaint.
      act(() => {
        root.render(<Host tree={tree2} options={makeOptions()} />);
      });
      assert.deepEqual(
        drain().sort(),
        ["embed-2", "embed-inner", "embed-side"],
        "fresh options identity must invalidate every BuilderNodeView boundary",
      );
    },
  );

  act(() => {
    root.unmount();
  });
});
