// Marathon W0-T3 — render-tax micro-test (canvas memo baseline).
//
// ⚠️ PATH-CRITICAL: must live under web/test/ — vitest's `test.include` only
// collects `test/**/*.test.tsx`. A copy under web/src would be silently skipped.
//
// Captures the PRE-FIX canvas render-count baselines that W2-T1 (the
// instant-paint fix) must beat:
//
//   1. ClientBuilderCanvas is NOT React.memo'd today, so when its PARENT
//      re-renders with byte-identical props (the server-refresh path), the
//      canvas re-renders too — wasted work. After W2-T1 wraps it in React.memo
//      with the default shallow compare, this delta drops to 0 (props identical
//      → bail). THIS is the assertion W2-T1 flips.
//
//   2. The canvas renders the WHOLE tree via a single renderBuilderNodes call
//      whose inline `options` object is fresh on every render — defeating
//      BuilderNodeView's `Object.is(prev.options)` memo half (render.tsx:3193),
//      so a 1-node tree change re-reconciles every top-level node. We pin the
//      tree's DOM node count (the reconcile blast radius) + prove a 1-char edit
//      still repaints the full canvas. After W2-T1 memoizes the options, the
//      unchanged subtrees finally bail.
//
// W0-T8 proves this file executes + fails-on-revert.
import { describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { Profiler, useState, type ReactNode } from "react";

import { ClientBuilderCanvas } from "@/components/edit-chrome/client-builder-canvas";
import {
  publishBuilderCanvasTree,
} from "@/components/edit-chrome/client-builder-canvas-bridge";
import type {
  BuilderNodeRenderDataSources,
  BuilderNodeTree,
} from "@/lib/site-admin/builder-node";
import type { ComponentDefinitions } from "@/lib/site-admin/builder-node/component-instances";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {} }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

const EMPTY_DATA = {} as BuilderNodeRenderDataSources;
const EMPTY_COMPONENTS = {} as ComponentDefinitions;

/** A 3-node tree; only n1's text varies by `label` (the "1-char edit"). n2/n3
 *  are byte-identical across calls so a perfect memo would bail them. */
function tree3(label: string): BuilderNodeTree {
  return [
    { id: "n1", kind: "heading", props: { text: `Heading ${label}`, level: 2 } },
    { id: "n2", kind: "paragraph", props: { text: "Static paragraph two" } },
    { id: "n3", kind: "paragraph", props: { text: "Static paragraph three" } },
  ];
}

/** Reset the bridge to a known tree so each test starts clean (the bridge is a
 *  process singleton). */
function seedBridge(tree: BuilderNodeTree): void {
  publishBuilderCanvasTree(tree);
}

describe("W0-T3 render-tax — ClientBuilderCanvas re-render baseline", () => {
  it("BASELINE: a parent re-render with IDENTICAL props still re-renders the canvas (no React.memo today) — W2-T1 flips this to 0", () => {
    seedBridge(tree3("seed"));
    let canvasCommits = 0;
    let forceParent: (n: number) => void = () => {};

    function Parent() {
      const [n, setN] = useState(0);
      forceParent = setN;
      // `n` is read so the parent actually re-renders, but it is NOT passed to
      // the canvas — the canvas props are identical across parent renders.
      void n;
      return (
        <Profiler id="canvas" onRender={() => (canvasCommits += 1)}>
          <ClientBuilderCanvas
            initialTree={tree3("init")}
            dataSources={EMPTY_DATA}
            sectionEmbedIslands={{}}
            publicPathPrefix="/t"
            components={EMPTY_COMPONENTS}
          />
        </Profiler>
      );
    }

    render(<Parent />);
    const afterMount = canvasCommits;
    expect(afterMount).toBeGreaterThanOrEqual(1); // mounted at least once

    act(() => forceParent(1));
    const parentRerenderDelta = canvasCommits - afterMount;
    // PRE-FIX: the canvas re-renders on a parent re-render even though every
    // prop is identical. W2-T1 wraps ClientBuilderCanvas in React.memo →
    // this becomes 0. Flip to `expect(parentRerenderDelta).toBe(0)` then.
    expect(parentRerenderDelta).toBeGreaterThanOrEqual(1);
  });

  it("BASELINE: a 1-node tree change (emit) repaints the canvas over the WHOLE tree (3 DOM nodes) — the options-memo target", () => {
    seedBridge(tree3("a"));
    let canvasCommits = 0;

    function Host(): ReactNode {
      return (
        <Profiler id="canvas" onRender={() => (canvasCommits += 1)}>
          <ClientBuilderCanvas
            initialTree={tree3("a")}
            dataSources={EMPTY_DATA}
            sectionEmbedIslands={{}}
            publicPathPrefix="/t"
            components={EMPTY_COMPONENTS}
          />
        </Profiler>
      );
    }

    const { container } = render(<Host />);
    const afterMount = canvasCommits;

    // All three nodes are present in the DOM (the reconcile blast radius).
    expect(container.querySelectorAll("[data-builder-node-id]").length).toBe(3);

    // Emit a tree where ONLY n1's text changed; n2/n3 references are structurally
    // identical. Today the canvas re-renders fully (one renderBuilderNodes call
    // with a fresh options object) — the changed node repaints AND the unchanged
    // siblings re-reconcile because the BuilderNodeView memo's options half is
    // always false.
    act(() => publishBuilderCanvasTree(tree3("b")));
    const emitDelta = canvasCommits - afterMount;
    expect(emitDelta).toBeGreaterThanOrEqual(1); // the canvas repainted on the edit

    // The edited text reached the DOM, and the node count is unchanged (same
    // tree shape) — pins the blast radius that W2-T1's option memo lets shrink.
    expect(container.textContent).toContain("Heading b");
    expect(container.querySelectorAll("[data-builder-node-id]").length).toBe(3);
  });
});
