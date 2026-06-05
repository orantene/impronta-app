// Marathon W0-T4 — undo/redo + CAS seatbelt (the hard prerequisite for ALL
// Wave-1 / Wave-3 history work).
//
// ⚠️ PATH-CRITICAL: the React-rendering harness must live under web/test/ —
// vitest collects only `test/**/*.test.tsx`, and `tsx --test` has no DOM for
// EditProvider. (The pure stack-mechanics mirror stays under src on tsx; this
// file covers the async-persistence / optimistic-CAS half it omits.)
//
// This drives the REAL EditProvider closures (commitBuilderTreeMutation →
// debounce → flushBuilderTreeSave → persistBuilderTree → undo/redo) with a
// jsdom mount + a mocked saveDraftHomepageAction / loadHomepageCompositionAction.
// It is NOT the drifted re-implementation — it exercises the actual provider via
// a builder-node patch on a seeded freeform tree.
//
// Pins: builderTree-kind undo/redo round-trip, the success path (pageVersion
// bump + lastConfirmed advance), VERSION_CONFLICT recovery (rollback +
// refreshComposition + BOTH stacks wiped + saving cleared + version refreshed),
// network-failure rollback (NO refresh), and the localStorage undo
// persist + rehydrate-across-reload.
//
// W0-T8 proves this file executes + fails-on-revert.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";

// ── server-action mocks (declared before the provider import) ───────────────
const saveDraftMock = vi.fn();
const loadCompositionMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: () => {},
    replace: () => {},
    prefetch: () => {},
    back: () => {},
    forward: () => {},
    refresh: () => {},
  }),
  usePathname: () => "/admin/website",
  useSearchParams: () => new URLSearchParams(),
}));

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
import type { CompositionData } from "@/lib/site-admin/edit-mode/composition-actions";
import type { BuilderNode, BuilderNodeTree } from "@/lib/site-admin/builder-node";

const PAGE_ID = "page-undo";
const UNDO_LS_KEY = `builder_undo_stack_v1:${PAGE_ID}`;
const SAVE_DEBOUNCE_WAIT = 1100; // > 750ms save debounce + 500ms persist debounce

const SEED_TREE: BuilderNodeTree = [
  { id: "blk1", kind: "heading", props: { text: "Headline", level: 2 } },
];

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
    slots: {},
    builderTree: SEED_TREE,
    slotDefs: [],
    library: [],
    availableLocales: ["en"],
  } as unknown as CompositionData;
}

/** Mount the provider, return a getter for the live context value. */
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

/** Read the heading node's style off the live tree. */
function headingStyle(ctx: EditContextValue): Record<string, unknown> | null {
  const node = ctx.builderTree[0] as Extract<BuilderNode, { kind: "heading" }>;
  return (node.props.style as Record<string, unknown> | undefined) ?? null;
}

/** Select the seeded node and patch its style — the real builderTree mutation
 *  path (commit → push history → arm debounce). */
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

describe("W0-T4 undo/redo + CAS (REAL EditProvider)", () => {
  it("a builderTree patch pushes ONE undo entry; undo→redo round-trips the change through the real closures", async () => {
    saveDraftMock.mockResolvedValue({ ok: true, pageVersion: 6 });
    const { ctx } = mountProvider(5);

    expect(ctx().canUndo).toBe(false);
    await patchSeededNode(ctx, { textColor: "#ff0000" });

    // Optimistic apply pushed exactly one entry; the style is live.
    expect(ctx().canUndo).toBe(true);
    expect(ctx().canRedo).toBe(false);
    expect(headingStyle(ctx())?.textColor).toBe("#ff0000");

    // Undo reverts the style and moves the entry to the redo stack.
    await act(async () => {
      await ctx().undo();
    });
    expect(ctx().canUndo).toBe(false);
    expect(ctx().canRedo).toBe(true);
    expect(headingStyle(ctx())?.textColor).toBeUndefined();

    // Redo re-applies it.
    await act(async () => {
      await ctx().redo();
    });
    expect(ctx().canRedo).toBe(false);
    expect(headingStyle(ctx())?.textColor).toBe("#ff0000");
  });

  it("the SUCCESS save path fires saveDraftHomepageAction once and bumps pageVersion to the server value", async () => {
    saveDraftMock.mockResolvedValue({ ok: true, pageVersion: 6 });
    const { ctx } = mountProvider(5);
    await patchSeededNode(ctx, { textColor: "#00ff00" });

    // Drain the save debounce.
    await act(async () => {
      await new Promise((r) => setTimeout(r, SAVE_DEBOUNCE_WAIT));
    });

    expect(saveDraftMock).toHaveBeenCalledTimes(1);
    // The mocked action received the CAS expectedVersion = the loaded version.
    expect(saveDraftMock.mock.calls[0][0]).toMatchObject({ expectedVersion: 5 });
    expect(ctx().pageVersion).toBe(6);
    expect(ctx().saving).toBe(false);
  });

  it("VERSION_CONFLICT recovery: rolls back the optimistic tree, refreshes composition, WIPES both undo+redo stacks, clears saving, and refreshes the version", async () => {
    saveDraftMock.mockResolvedValue({
      ok: false,
      code: "VERSION_CONFLICT",
      error: "The page changed elsewhere.",
    });
    // refreshComposition reloads the authoritative composition at a new version.
    loadCompositionMock.mockResolvedValue({ ok: true, data: composition(9) });
    const { ctx } = mountProvider(5);

    await patchSeededNode(ctx, { textColor: "#ff0000" });
    expect(ctx().canUndo).toBe(true); // optimistic entry present

    await act(async () => {
      await new Promise((r) => setTimeout(r, SAVE_DEBOUNCE_WAIT));
    });

    expect(saveDraftMock).toHaveBeenCalledTimes(1);
    expect(loadCompositionMock).toHaveBeenCalledTimes(1); // refreshComposition ran
    // Optimistic style rolled back.
    expect(headingStyle(ctx())?.textColor).toBeUndefined();
    // Both stacks wiped by refreshComposition (the documented harsh-but-safe
    // behavior W1-T5 will soften with a toast — pinned here so that change is
    // deliberate, not accidental).
    expect(ctx().canUndo).toBe(false);
    expect(ctx().canRedo).toBe(false);
    // No stuck spinner; version advanced to the server's.
    expect(ctx().saving).toBe(false);
    expect(ctx().pageVersion).toBe(9);
  });

  it("a NETWORK failure rolls back the optimistic tree but does NOT refreshComposition (transient error keeps editor state)", async () => {
    saveDraftMock.mockResolvedValue({
      ok: false,
      code: "network",
      error: "Network error.",
    });
    const { ctx } = mountProvider(5);

    await patchSeededNode(ctx, { textColor: "#0000ff" });
    await act(async () => {
      await new Promise((r) => setTimeout(r, SAVE_DEBOUNCE_WAIT));
    });

    expect(saveDraftMock).toHaveBeenCalledTimes(1);
    expect(loadCompositionMock).not.toHaveBeenCalled(); // NO refresh on network error
    expect(headingStyle(ctx())?.textColor).toBeUndefined(); // rolled back
    expect(ctx().saving).toBe(false);
    // Version unchanged — the conflict path is the only one that re-versions.
    expect(ctx().pageVersion).toBe(5);
  });

  it("undo history PERSISTS to localStorage and REHYDRATES across a remount (undo-survives-reload)", async () => {
    saveDraftMock.mockResolvedValue({ ok: true, pageVersion: 6 });
    const { ctx, utils } = mountProvider(5);

    await patchSeededNode(ctx, { textColor: "#ff8800" });
    // Drain BOTH the save debounce and the ~500ms localStorage persist debounce.
    await act(async () => {
      await new Promise((r) => setTimeout(r, SAVE_DEBOUNCE_WAIT));
    });

    const raw = window.localStorage.getItem(UNDO_LS_KEY);
    expect(raw).not.toBeNull();
    const persisted = JSON.parse(raw!) as Array<{ kind: string }>;
    expect(persisted.length).toBeGreaterThanOrEqual(1);
    expect(persisted[0].kind).toBe("builderTree");

    // Unmount (simulate closing the tab) and remount at the new version — the
    // provider should rehydrate the persisted undo entry.
    utils.unmount();
    const second = mountProvider(6);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(second.ctx().canUndo).toBe(true);
  });
});
