// Marathon W0-T3 — render-tax micro-test (canvas memo baseline).
//
// ⚠️ PATH-CRITICAL: must live under web/test/ — vitest's `test.include` only
// collects `test/**/*.test.tsx`. A copy under web/src would be silently skipped.
//
// Captures the PRE-FIX canvas render-count baselines that W2-T1 (the
// instant-paint fix) must beat:
//
//   1. ClientBuilderCanvas is NOW React.memo'd (W2-T1), so when its PARENT
//      re-renders with byte-identical props (the server-refresh path), the
//      canvas bails — no wasted work. The delta is 0 (props identical → bail).
//      THIS assertion was FLIPPED by W2-T1 from `>= 1` to `=== 0`.
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

// W2-T1 PROBE: count how often the component's render body actually executes.
// `React.Profiler.onRender` is NOT a valid probe for a React.memo bail — it
// fires when the Profiler boundary itself commits (the parent re-render
// re-creates the <Profiler> element), even when the memoized child bails
// (empirically verified). So we instead spy on `renderFreeformPageRootTree` —
// the single function `ClientBuilderCanvas` calls IN its render body (it
// returns `renderFreeformPageRootTree(tree, options)`; it no longer calls
// `renderBuilderNodes` directly). If React.memo bails, the body never runs
// → 0 calls. The barrel is mocked-through (real impl wrapped) so DOM still
// renders for the emit/DOM-count assertions in the second test.
const renderCalls = { n: 0 };
vi.mock("@/lib/site-admin/builder-node", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/site-admin/builder-node")>();
  return {
    ...actual,
    renderFreeformPageRootTree: (
      ...args: Parameters<typeof actual.renderFreeformPageRootTree>
    ) => {
      renderCalls.n += 1;
      return actual.renderFreeformPageRootTree(...args);
    },
  };
});

const EMPTY_DATA = {} as BuilderNodeRenderDataSources;
const EMPTY_COMPONENTS = {} as ComponentDefinitions;
// Stable empty-islands identity. W2-T1's React.memo uses the DEFAULT shallow
// prop compare, so to prove a parent re-render bails we must hand IDENTICAL prop
// identities across renders. An inline `{}` would be a fresh identity each render
// (correctly defeating the memo — that's the W0-T3b fresh-island repaint
// contract), which is the wrong thing to assert HERE.
const EMPTY_ISLANDS = {} as Readonly<Record<string, ReactNode>>;

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
  it("W2-T1: a parent re-render with IDENTICAL props does NOT re-render the canvas (React.memo bails)", () => {
    seedBridge(tree3("seed"));
    let forceParent: (n: number) => void = () => {};

    // Stable prop identities so the default shallow compare can prove the bail.
    // (A fresh `tree3()` / `{}` per render would be a NEW identity and correctly
    // defeat the memo — that's the W0-T3b fresh-island contract, not this test.)
    const STABLE_INITIAL = tree3("init");

    function Parent() {
      const [n, setN] = useState(0);
      forceParent = setN;
      // `n` is read so the parent actually re-renders, but it is NOT passed to
      // the canvas — the canvas props are identical across parent renders.
      void n;
      return (
        <ClientBuilderCanvas
          initialTree={STABLE_INITIAL}
          dataSources={EMPTY_DATA}
          sectionEmbedIslands={EMPTY_ISLANDS}
          publicPathPrefix="/t"
          components={EMPTY_COMPONENTS}
        />
      );
    }

    render(<Parent />);
    const afterMount = renderCalls.n;
    expect(afterMount).toBeGreaterThanOrEqual(1); // body ran at least once

    act(() => forceParent(1));
    const parentRerenderDelta = renderCalls.n - afterMount;
    // ✅ W2-T1 LANDED: ClientBuilderCanvas is now React.memo'd (default shallow
    // compare). A parent re-render with byte-identical prop identities bails →
    // the component's render body (renderBuilderNodes) does NOT run again. This
    // assertion FLIPPED from `>= 1` (pre-fix baseline) to `=== 0` — the
    // instant-paint count win at the seatbelt level.
    //
    // NB: probed via the renderBuilderNodes call count, NOT a React.Profiler —
    // a Profiler's onRender fires when its own boundary commits on the parent
    // re-render even when a memoized child bails (verified), so it cannot
    // observe the bail.
    expect(parentRerenderDelta).toBe(0);
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
