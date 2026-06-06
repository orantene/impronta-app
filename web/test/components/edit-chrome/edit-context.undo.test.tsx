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
// W1-T4 — visibility/rename section mutations.
const setVisibilityMock = vi.fn();
const saveSectionDraftMock = vi.fn();
const loadSectionForEditMock = vi.fn();

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

// W1-T4 — section visibility/rename go through section-actions, which the
// provider's dispatch() calls directly. Mock them so we can drive the
// sectionMeta history path without a real Supabase round-trip.
vi.mock("@/lib/site-admin/edit-mode/section-actions", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return {
    ...actual,
    setSectionVisibilityAction: (...args: unknown[]) => setVisibilityMock(...args),
    saveSectionDraftAction: (...args: unknown[]) => saveSectionDraftMock(...args),
    loadSectionForEditAction: (...args: unknown[]) => loadSectionForEditMock(...args),
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

// W1-T4 — a real section in a slot so visibility/rename have a target. Starts
// "always" / "Hero". sortOrder + sectionTypeKey mirror a live composition row.
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

/** Read the seeded section's slot ref off the live composition. */
function sectionRef(ctx: EditContextValue) {
  return ctx.slots[SECTION_SLOT]?.find((e) => e.sectionId === SECTION_ID) ?? null;
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
  setVisibilityMock.mockReset();
  saveSectionDraftMock.mockReset();
  loadSectionForEditMock.mockReset();
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
    // W3-T2(c/d) — the operator's rejected tree is parked, so the conflict is
    // recoverable rather than silently discarded.
    expect(ctx().hasConflictRecovery).toBe(true);
  });

  it("W3-T2: keepMyVersionAfterConflict re-applies the rejected tree on the reloaded base — CAS re-issues at the fresh version and the edit survives", async () => {
    // First save loses the race; the second (keep-mine) lands on the new base.
    saveDraftMock
      .mockResolvedValueOnce({
        ok: false,
        code: "VERSION_CONFLICT",
        error: "The page changed elsewhere.",
      })
      .mockResolvedValueOnce({ ok: true, pageVersion: 10 });
    loadCompositionMock.mockResolvedValue({ ok: true, data: composition(9) });
    const { ctx } = mountProvider(5);

    await patchSeededNode(ctx, { textColor: "#ff0000" });
    await act(async () => {
      await new Promise((r) => setTimeout(r, SAVE_DEBOUNCE_WAIT));
    });

    // Conflict: rolled back + recovery armed at the reloaded version (9).
    expect(headingStyle(ctx())?.textColor).toBeUndefined();
    expect(ctx().hasConflictRecovery).toBe(true);
    expect(ctx().pageVersion).toBe(9);

    // Keep my version → re-apply the parked tree on top of the fresh base.
    await act(async () => {
      await ctx().keepMyVersionAfterConflict();
    });

    // The rejected edit is back on the live tree.
    expect(headingStyle(ctx())?.textColor).toBe("#ff0000");
    // The re-issued CAS used the RELOADED version (9), not the stale 5.
    expect(saveDraftMock).toHaveBeenCalledTimes(2);
    expect(saveDraftMock.mock.calls[1][0]).toMatchObject({ expectedVersion: 9 });
    // The save landed, version advanced, and the recovery is cleared.
    expect(ctx().pageVersion).toBe(10);
    expect(ctx().hasConflictRecovery).toBe(false);
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
    // Drain the save debounce + persist debounce + the W1-T5(a) RE-STAMP persist
    // that fires ~500ms after the save bumps pageVersion to 6.
    await act(async () => {
      await new Promise((r) => setTimeout(r, SAVE_DEBOUNCE_WAIT));
    });

    const raw = window.localStorage.getItem(UNDO_LS_KEY);
    expect(raw).not.toBeNull();
    // W1-T5(a) — the persisted payload is now a VERSIONED envelope
    // { baseVersion, entries } (was a bare array). The save success path
    // re-stamps it synchronously with the server's confirmed version (6).
    const envelope = JSON.parse(raw!) as {
      baseVersion: number;
      entries: Array<{ kind: string }>;
    };
    expect(envelope.entries.length).toBeGreaterThanOrEqual(1);
    expect(envelope.entries[0].kind).toBe("builderTree");
    expect(envelope.baseVersion).toBe(6);

    // Unmount (simulate closing the tab) and remount at the SAME version the
    // stack was stamped with — the provider rehydrates the persisted entry
    // (same-session reload: baseVersion === loaded version).
    utils.unmount();
    const second = mountProvider(6);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(second.ctx().canUndo).toBe(true);
  });

  it("W1-T5(a): a STALE persisted stack (baseVersion ≠ loaded version) is DROPPED on rehydrate", async () => {
    saveDraftMock.mockResolvedValue({ ok: true, pageVersion: 6 });
    const { ctx, utils } = mountProvider(5);
    await patchSeededNode(ctx, { textColor: "#112233" });
    await act(async () => {
      await new Promise((r) => setTimeout(r, SAVE_DEBOUNCE_WAIT));
    });
    // The stack persisted at baseVersion 6. Simulate a CONCURRENT session having
    // advanced the page to 9 while this stack sat in localStorage: remount at 9.
    utils.unmount();
    const second = mountProvider(9);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    // The stale stack is dropped — replaying its trees at v9 would clobber the
    // other session's work, so undo is empty rather than dangerous.
    expect(second.ctx().canUndo).toBe(false);
  });
});

// ── W1-T4 — undo coverage for visibility + rename ───────────────────────────
//
// Before W1-T4 setSectionVisibility + renameSection did optimistic-apply +
// revert-on-error but pushed NO HistoryEntry, so ⌘Z silently reverted an
// UNRELATED earlier edit. These pin: a visibility toggle and a rename each push
// exactly one undoable entry, ⌘Z reverts THAT change (and nothing else),
// redo re-applies it, and the replay persists through the section dispatch
// (recordHistory:false → no double entry).

describe("W1-T4 visibility + rename undo (REAL EditProvider)", () => {
  it("hide → ⌘Z UN-hides; pushes exactly one entry and reverts nothing else", async () => {
    setVisibilityMock.mockResolvedValue({ ok: true, version: 2, visibility: "hidden" });
    const { ctx } = mountProvider(5);

    expect(ctx().canUndo).toBe(false);
    expect(sectionRef(ctx())?.visibility).toBe("always");

    // Operator hides the section.
    await act(async () => {
      await ctx().setSectionVisibility(SECTION_ID, "hidden");
    });
    expect(sectionRef(ctx())?.visibility).toBe("hidden");
    // Exactly one undoable entry; nothing on the redo stack yet.
    expect(ctx().canUndo).toBe(true);
    expect(ctx().canRedo).toBe(false);

    // ⌘Z — the replay re-dispatches setSectionVisibility("always").
    setVisibilityMock.mockResolvedValue({ ok: true, version: 3, visibility: "always" });
    await act(async () => {
      await ctx().undo();
    });
    // Un-hidden, and the entry moved to redo.
    expect(sectionRef(ctx())?.visibility).toBe("always");
    expect(ctx().canUndo).toBe(false);
    expect(ctx().canRedo).toBe(true);

    // The undo replay was a real dispatch (recordHistory:false) — the action
    // fired twice total (hide + un-hide), never pushing a 2nd undo entry.
    expect(setVisibilityMock).toHaveBeenCalledTimes(2);

    // Redo re-hides.
    setVisibilityMock.mockResolvedValue({ ok: true, version: 4, visibility: "hidden" });
    await act(async () => {
      await ctx().redo();
    });
    expect(sectionRef(ctx())?.visibility).toBe("hidden");
    expect(ctx().canRedo).toBe(false);
    expect(ctx().canUndo).toBe(true);
  });

  it("rename → ⌘Z restores the previous name (one entry, redo re-applies)", async () => {
    // The dispatch loads the section fresh (loadedSection is null on mount).
    loadSectionForEditMock.mockResolvedValue({
      ok: true,
      section: {
        id: SECTION_ID,
        sectionTypeKey: "hero",
        schemaVersion: 1,
        name: "Hero",
        version: 1,
        props: {},
      },
    });
    saveSectionDraftMock.mockResolvedValue({ ok: true, version: 2 });
    const { ctx } = mountProvider(5);

    expect(sectionRef(ctx())?.name).toBe("Hero");

    await act(async () => {
      await ctx().renameSection(SECTION_ID, "Welcome");
    });
    expect(sectionRef(ctx())?.name).toBe("Welcome");
    expect(ctx().canUndo).toBe(true);
    expect(ctx().canRedo).toBe(false);

    // ⌘Z restores "Hero". The replay re-loads + re-saves under recordHistory:false.
    loadSectionForEditMock.mockResolvedValue({
      ok: true,
      section: {
        id: SECTION_ID,
        sectionTypeKey: "hero",
        schemaVersion: 1,
        name: "Welcome",
        version: 2,
        props: {},
      },
    });
    saveSectionDraftMock.mockResolvedValue({ ok: true, version: 3 });
    await act(async () => {
      await ctx().undo();
    });
    expect(sectionRef(ctx())?.name).toBe("Hero");
    expect(ctx().canUndo).toBe(false);
    expect(ctx().canRedo).toBe(true);

    // Two saves total (rename + undo-replay) — the replay never pushed a 2nd entry.
    expect(saveSectionDraftMock).toHaveBeenCalledTimes(2);
  });

  it("a visibility entry survives reload (persisted + rehydrated as kind 'sectionMeta')", async () => {
    setVisibilityMock.mockResolvedValue({ ok: true, version: 2, visibility: "hidden" });
    const { ctx, utils } = mountProvider(5);

    await act(async () => {
      await ctx().setSectionVisibility(SECTION_ID, "hidden");
    });
    // Drain the ~500ms localStorage persist debounce.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 700));
    });

    const raw = window.localStorage.getItem(UNDO_LS_KEY);
    expect(raw).not.toBeNull();
    const envelope = JSON.parse(raw!) as {
      baseVersion: number;
      entries: Array<{ kind: string }>;
    };
    expect(envelope.entries.some((e) => e.kind === "sectionMeta")).toBe(true);
    // A visibility toggle bumps the SECTION version, NOT the page version, so
    // the stack is stamped at the unchanged page version (5).
    expect(envelope.baseVersion).toBe(5);

    // Remount at the same page version — the sectionMeta entry is recognised +
    // rehydrated (not dropped).
    utils.unmount();
    const second = mountProvider(5);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(second.ctx().canUndo).toBe(true);
  });
});
