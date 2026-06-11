// WS2 — value-memo stabilization guard.
//
// ⚠️ PATH-CRITICAL: the React-rendering harness must live under web/test/ —
// vitest collects only `test/**/*.test.tsx`, and `tsx --test` has no DOM for
// EditProvider.
//
// The load-bearing WS2 claim: after hoisting `builderTree` (→ builder-tree-bridge)
// and `canUndo`/`canRedo` (→ history-bridge) out of the EditProvider value memo,
// a real builder-node edit — AND an undo of it — no longer rebuilds the context
// value object. Every `useEditContext()` consumer reads that object by reference,
// so a STABLE value reference across an edit is exactly "the ~56 action-only
// consumers do not re-render on each keystroke / ⌘Z" — the instant-feel + fast-
// undo win this workstream is about.
//
// This drives the REAL EditProvider (select → patchSelectedBuilderNodesStyle →
// commit → optimistic apply → history push) and asserts the captured `value`
// reference is identical before and after. It deliberately mirrors the seed +
// mocks of edit-context.undo.test.tsx so it exercises the same real closures.
//
// NOTE: this proves the CONTEXT-VALUE reference is stable (the precondition for
// the perf win). It does NOT measure wall-clock render time / profiler commits —
// that needs a live-editor React-profiler pass, which a unit test can't do.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";

const saveDraftMock = vi.fn();
const loadCompositionMock = vi.fn();

// IMPORTANT: useRouter() must return a STABLE object (as Next.js does in
// production). A fresh object per render recreates `queueRouterRefresh` (deps:
// [router]) and cascades into every mutator callback — a harness artifact that
// would mask the value-stability this test pins. The single shared `router`
// here mirrors the real Next.js identity guarantee.
vi.mock("next/navigation", () => {
  const router = {
    push: () => {},
    replace: () => {},
    prefetch: () => {},
    back: () => {},
    forward: () => {},
    refresh: () => {},
  };
  return {
    useRouter: () => router,
    usePathname: () => "/admin/website",
    useSearchParams: () => new URLSearchParams(),
  };
});

vi.mock("@/lib/site-admin/edit-mode/composition-actions", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return {
    ...actual,
    saveDraftHomepageAction: (...args: unknown[]) => saveDraftMock(...args),
    loadHomepageCompositionAction: (...args: unknown[]) =>
      loadCompositionMock(...args),
  };
});

import {
  EditProvider,
  useEditContext,
  type EditContextValue,
} from "@/components/edit-chrome/edit-context";
import { getBuilderTreeSnapshot } from "@/components/edit-chrome/builder-tree-bridge";
import {
  getCanUndoSnapshot,
  getCanRedoSnapshot,
} from "@/components/edit-chrome/history-bridge";
import type { CompositionData } from "@/lib/site-admin/edit-mode/composition-actions";
import type { BuilderNode, BuilderNodeTree } from "@/lib/site-admin/builder-node";

const PAGE_ID = "page-stability";

const SEED_TREE: BuilderNodeTree = [
  { id: "blk1", kind: "heading", props: { text: "Headline", level: 2 } },
];
const SECTION_ID = "sec-hero";
const SECTION_SLOT = "main";

function composition(pageVersion: number): CompositionData {
  return {
    locale: "en",
    pageId: PAGE_ID,
    pageVersion,
    liveSitePublishedAt: null,
    metadata: {
      title: "Test",
      metaDescription: null,
      introTagline: null,
      ogTitle: null,
      ogDescription: null,
      ogImageUrl: null,
      canonicalUrl: null,
      noindex: false,
    },
    slots: {
      [SECTION_SLOT]: [
        {
          sectionId: SECTION_ID,
          sortOrder: 0,
          sectionTypeKey: "hero",
          name: "Hero",
          visibility: "always",
        },
      ],
    },
    builderTree: SEED_TREE,
    slotDefs: [],
    library: [],
    availableLocales: ["en"],
  } as unknown as CompositionData;
}

function mountProvider(pageVersion = 5) {
  const ref = { current: null as EditContextValue | null };
  function Consumer() {
    ref.current = useEditContext();
    return null;
  }
  const utils = render(
    <EditProvider
      tenantId="t"
      workspacePlan="studio"
      initialComposition={composition(pageVersion)}
    >
      <Consumer />
    </EditProvider>,
  );
  return { ctx: () => ref.current!, utils };
}

function headingStyle(): Record<string, unknown> | null {
  const node = getBuilderTreeSnapshot()[0] as Extract<
    BuilderNode,
    { kind: "heading" }
  >;
  return (node.props.style as Record<string, unknown> | undefined) ?? null;
}

async function patchSeededNode(
  ctx: () => EditContextValue,
  patch: Record<string, unknown>,
): Promise<void> {
  await act(async () => {
    ctx().selectBuilderNode("blk1");
  });
  await act(async () => {
    await ctx().patchSelectedBuilderNodesStyle(JSON.stringify(patch));
  });
}

beforeEach(() => {
  saveDraftMock.mockReset();
  loadCompositionMock.mockReset();
  if (typeof window !== "undefined") window.localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

// The save mock ECHOES the expectedVersion it receives (and returns a null
// savedAt). This is deliberate: a real pageVersion bump / savedAt change is a
// LEGITIMATE value-memo dep (it happens once per save, not once per keystroke),
// so letting the version advance would mask the thing we're actually pinning.
// Echoing keeps setPageVersion/setLastDraftSavedAt as no-op state updates (same
// value → React bails), ISOLATING the tree change + history-depth flip — exactly
// the two things WS2 hoisted out of the memo. If a future regression puts either
// back into the memo deps, the value reference changes and this test fails.
function echoSaveMock() {
  saveDraftMock.mockImplementation((input: { expectedVersion?: number }) =>
    Promise.resolve({
      ok: true,
      pageVersion: input?.expectedVersion ?? 5,
      savedAt: null,
    }),
  );
}

describe("WS2 — context value reference stays stable across an edit + undo", () => {
  it("a builderTree edit does NOT rebuild the EditProvider value object", async () => {
    echoSaveMock();
    const { ctx } = mountProvider(5);

    // Capture the value reference BEFORE the edit (after mount effects settle).
    let valueBeforeEdit: EditContextValue | null = null;
    await act(async () => {
      valueBeforeEdit = ctx();
    });
    expect(valueBeforeEdit).not.toBeNull();

    // Drive a REAL edit (select → patch style → commit → optimistic apply →
    // history push). The tree changes and canUndo flips false→true.
    await patchSeededNode(ctx, { textColor: "#ff0000" });
    expect(headingStyle()?.textColor).toBe("#ff0000");
    expect(getCanUndoSnapshot()).toBe(true);

    // THE GUARD: the context value object is the SAME reference — the tree change
    // and the history-depth flip went through the micro-stores, not the memo.
    expect(ctx()).toBe(valueBeforeEdit);
  });

  it("an undo does NOT rebuild the EditProvider value object", async () => {
    echoSaveMock();
    const { ctx } = mountProvider(5);

    await patchSeededNode(ctx, { textColor: "#ff0000" });
    expect(getCanUndoSnapshot()).toBe(true);
    expect(getCanRedoSnapshot()).toBe(false);

    // Capture the reference AFTER the edit, then undo.
    let valueAfterEdit: EditContextValue | null = null;
    await act(async () => {
      valueAfterEdit = ctx();
    });

    await act(async () => {
      await ctx().undo();
    });

    // The undo reverted the tree + flipped canUndo→false / canRedo→true...
    expect(headingStyle()?.textColor).toBeUndefined();
    expect(getCanUndoSnapshot()).toBe(false);
    expect(getCanRedoSnapshot()).toBe(true);
    // ...all through the micro-stores — the value object is unchanged.
    expect(ctx()).toBe(valueAfterEdit);
  });
});
