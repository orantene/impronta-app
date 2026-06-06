// Marathon W0-T3b — client-canvas re-render CONTRACT (the W2-T1 runtime guardrail).
//
// ⚠️ PATH-CRITICAL: must live under web/test/ (vitest collects only
// `test/**/*.test.tsx`).
//
// W2-T1 wraps ClientBuilderCanvas in React.memo to stop the wasted re-render on
// every parent server-refresh. The HAZARD (plan TOP-RISK #2): the live tree
// arrives via the useSyncExternalStore bridge, but `dataSources` /
// `sectionEmbedIslands` / `components` arrive as PROPS re-identified on every
// server render of homepage-cms-sections.tsx. A hand-written memo comparator
// that omitted those props would stop a published hero/island edit (the
// server-refresh path) from repainting.
//
// This test pins BOTH propagation channels so W2-T1's memo (default shallow
// compare — NO custom comparator) is provably safe:
//   A. a bridge emit of a NEW tree repaints the canvas (useSyncExternalStore);
//   B. a parent re-render with FRESH-IDENTITY sectionEmbedIslands / dataSources
//      still propagates the new island/data (the server-refresh path).
//
// 0 tests referenced the canvas/bridge before this. This file is a HARD dep of
// W2-T1 and must STAY GREEN through the memo change. W0-T8 proves it executes +
// fails-on-revert.
import { describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { useState, type ReactNode } from "react";

import { ClientBuilderCanvas } from "@/components/edit-chrome/client-builder-canvas";
import { publishBuilderCanvasTree } from "@/components/edit-chrome/client-builder-canvas-bridge";
import type {
  BuilderNode,
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

function textTree(text: string): BuilderNodeTree {
  return [{ id: "h1", kind: "heading", props: { text, level: 2 } }];
}

/** A tree with a single section_embed node whose island content comes from the
 *  `sectionEmbedIslands` prop map (the server-refresh propagation channel). */
const EMBED_TREE: BuilderNodeTree = [
  {
    id: "emb1",
    kind: "section_embed",
    props: { sectionId: "s1", sectionTypeKey: "hero" },
  } as unknown as BuilderNode,
];

describe("W0-T3b client-canvas re-render contract", () => {
  it("A. a bridge emit of a NEW tree repaints the canvas (useSyncExternalStore propagation)", () => {
    publishBuilderCanvasTree(textTree("First"));

    function Host(): ReactNode {
      return (
        <ClientBuilderCanvas
          initialTree={textTree("First")}
          dataSources={EMPTY_DATA}
          sectionEmbedIslands={{}}
          publicPathPrefix="/t"
          components={EMPTY_COMPONENTS}
        />
      );
    }
    const { container } = render(<Host />);
    expect(container.textContent).toContain("First");

    // Emit a brand-new tree via the bridge → the canvas must paint it.
    act(() => publishBuilderCanvasTree(textTree("Second")));
    expect(container.textContent).toContain("Second");
    expect(container.textContent).not.toContain("First");
  });

  it("B. a parent re-render with FRESH-IDENTITY sectionEmbedIslands still propagates the new island (the server-refresh repaint W2-T1's memo must NOT block)", () => {
    publishBuilderCanvasTree(EMBED_TREE);

    let setIslands: (next: Readonly<Record<string, ReactNode>>) => void = () => {};
    function Parent(): ReactNode {
      const [islands, setI] = useState<Readonly<Record<string, ReactNode>>>({
        emb1: <div data-island>island-v1</div>,
      });
      setIslands = setI;
      return (
        <ClientBuilderCanvas
          initialTree={EMBED_TREE}
          dataSources={EMPTY_DATA}
          sectionEmbedIslands={islands}
          publicPathPrefix="/t"
          components={EMPTY_COMPONENTS}
        />
      );
    }
    const { container } = render(<Parent />);
    expect(container.textContent).toContain("island-v1");

    // Server re-render hands a NEW islands object identity with NEW content for
    // the same embed id. The canvas MUST show v2. If a custom React.memo
    // comparator omitted sectionEmbedIslands, this would still show v1 — exactly
    // the published-island staleness W2-T1 must avoid.
    act(() =>
      setIslands({ emb1: <div data-island>island-v2</div> }),
    );
    expect(container.textContent).toContain("island-v2");
    expect(container.textContent).not.toContain("island-v1");
  });

  it("B2. a parent re-render with FRESH-IDENTITY dataSources re-renders against the new snapshot", () => {
    // dataSources is also re-identified on each server render. We can't easily
    // assert data-bound DOM without a fixture, but we CAN prove the canvas does
    // not freeze on the old object: a fresh dataSources identity combined with a
    // bridge tree change repaints. (Pins that the canvas reads current props.)
    publishBuilderCanvasTree(textTree("alpha"));
    let bumpData: () => void = () => {};
    function Parent(): ReactNode {
      const [, setData] = useState<BuilderNodeRenderDataSources>(
        () => ({}) as BuilderNodeRenderDataSources,
      );
      bumpData = () => setData({} as BuilderNodeRenderDataSources);
      return (
        <ClientBuilderCanvas
          initialTree={textTree("alpha")}
          dataSources={{} as BuilderNodeRenderDataSources}
          sectionEmbedIslands={{}}
          publicPathPrefix="/t"
          components={EMPTY_COMPONENTS}
        />
      );
    }
    const { container } = render(<Parent />);
    act(() => {
      bumpData();
      publishBuilderCanvasTree(textTree("omega"));
    });
    expect(container.textContent).toContain("omega");
  });
});
