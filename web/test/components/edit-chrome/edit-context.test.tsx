// Smoke test for edit-context.tsx (6,400+ LOC). This is the most under-
// audited high-risk god-file in the codebase — every builder mutation,
// inspector, and publish-preflight check flows through it. We can't
// smoke-test the full provider behaviour without a composition fixture,
// but we CAN prove:
//   1. EditProvider mounts with minimal props (tenantId only).
//   2. The provider's context value is delivered to children via
//      useEditContext() — i.e. the React.createContext / Provider
//      wiring still works.
//   3. useMaybeEditContext() returns null outside the provider (the
//      escape hatch components rely on when mounted on public surfaces).
//
// Marathon W0-T2 EXTENDS this file (it must live under web/test/ — vitest's
// test.include only collects test/**/*.test.tsx) with the provider-render
// seatbelt: selection flip, drawer mutex, undo/redo surface, AND a render-count
// probe that captures the PRE-FIX hover baseline (the number Wave 2's hover
// micro-store must beat). W0-T8 proves these execute + fail-on-revert.
import { describe, expect, it, vi } from "vitest";
import { act, render, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  EditProvider,
  useEditContext,
  useMaybeEditContext,
  type EditContextValue,
} from "@/components/edit-chrome/edit-context";
// W2 (selection-bridge) — selection READS moved out of the context value into a
// useSyncExternalStore micro-store. The setters/mutators stay on the context;
// the live VALUE is published to the bridge from the provider's effects, so we
// assert against the bridge snapshots (read after the act() that flushed them).
import {
  getSelectedSectionIdSnapshot,
  getAdditionalSelectedIdsSnapshot,
} from "@/components/edit-chrome/selection-bridge";
// WS2 — canUndo/canRedo moved to the history-bridge micro-store (no longer on
// the context value); assert against its snapshots.
import {
  getCanUndoSnapshot,
  getCanRedoSnapshot,
} from "@/components/edit-chrome/history-bridge";
import type { CompositionData } from "@/lib/site-admin/edit-mode/composition-actions";
import { SITE_HEADER_SELECTION_ID } from "@/lib/site-admin/site-header/selection-id";

vi.mock("next/navigation", () => {
  // STABLE router singleton — Next's real useRouter returns a stable reference
  // across renders. A fresh object per call would make every `[router]`-dep
  // callback (e.g. queueRouterRefresh → commitBuilderTreeMutation →
  // executeBuilderNodeOperation) churn on EVERY render, masking the W2-T4a
  // selection-quiet assertion.
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

/**
 * Minimal composition fixture so `liveSectionIds` is non-empty and a selection
 * STICKS (the provider's selection-sync effect clears any selected id that is
 * not in the live slot set — without this, every setSelectedSectionId is
 * immediately reverted to null). Only the fields the provider reads are filled;
 * cast through `unknown` to keep the fixture minimal.
 */
function compositionWithSections(sectionIds: string[]): CompositionData {
  return {
    locale: "en",
    pageId: "page-1",
    pageVersion: 1,
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
      main: sectionIds.map((sectionId, i) => ({
        sectionId,
        sortOrder: i,
        sectionTypeKey: "hero",
        name: `Section ${i}`,
      })),
    },
    builderTree: [],
    slotDefs: [],
    library: [],
    availableLocales: ["en"],
  } as unknown as CompositionData;
}

/** A consumer that counts its own renders and re-exposes the live context so a
 *  test can call setters via act() and read the resulting state. */
function makeRenderCountedConsumer() {
  const state = { renders: 0, ctx: null as EditContextValue | null };
  function Consumer() {
    state.renders += 1;
    state.ctx = useEditContext();
    return null;
  }
  return { state, Consumer };
}

describe("edit-context.tsx smoke", () => {
  it("useMaybeEditContext returns null outside EditProvider", () => {
    const { result } = renderHook(() => useMaybeEditContext());
    expect(result.current).toBeNull();
  });

  it("useEditContext throws outside EditProvider", () => {
    // Suppress the React error-boundary noise that renderHook prints
    // to console.error when the hook throws — the assertion is the proof.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useEditContext())).toThrow(
      /useEditContext must be used within EditProvider/,
    );
    spy.mockRestore();
  });

  it("EditProvider delivers tenantId + workspacePlan defaults via context", () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <EditProvider tenantId="tenant-smoke">{children}</EditProvider>
    );
    const { result } = renderHook(() => useEditContext(), { wrapper });
    expect(result.current.tenantId).toBe("tenant-smoke");
    // workspacePlan defaults to null → normalized via builderPlanAllows;
    // the contract is that we always get a string field back.
    expect(typeof result.current.workspacePlan).toBe("string");
    // selectedSectionId is null at first paint (now lives in the selection-bridge).
    expect(getSelectedSectionIdSnapshot()).toBeNull();
  });
});

// ── W0-T2 — provider-render seatbelt ───────────────────────────────────────

describe("edit-context.tsx W0-T2 — selection", () => {
  it("(a) selecting a section flips selectedSectionId and a later plain select clears the multi-select set", () => {
    const { state, Consumer } = makeRenderCountedConsumer();
    render(
      <EditProvider
        tenantId="t"
        workspacePlan="studio"
        initialComposition={compositionWithSections(["sec-1", "sec-2"])}
      >
        <Consumer />
      </EditProvider>,
    );
    const ctx = () => state.ctx!;

    // Plain select sticks (the section is live).
    act(() => ctx().setSelectedSectionId("sec-1"));
    expect(getSelectedSectionIdSnapshot()).toBe("sec-1");

    // Extend selection to a second live section → it lands in the multi-set.
    act(() => ctx().extendSelection("sec-2"));
    expect(getAdditionalSelectedIdsSnapshot().has("sec-2")).toBe(true);

    // A plain select of a different section CLEARS the multi-set (plain-click
    // semantics) and re-seats the primary.
    act(() => ctx().setSelectedSectionId("sec-2"));
    expect(getSelectedSectionIdSnapshot()).toBe("sec-2");
    expect(getAdditionalSelectedIdsSnapshot().size).toBe(0);
  });

  it("setSelectedSectionId(null) clears the primary selection", () => {
    const { state, Consumer } = makeRenderCountedConsumer();
    render(
      <EditProvider
        tenantId="t"
        workspacePlan="studio"
        initialComposition={compositionWithSections(["sec-1"])}
      >
        <Consumer />
      </EditProvider>,
    );
    const ctx = () => state.ctx!;
    act(() => ctx().setSelectedSectionId("sec-1"));
    expect(getSelectedSectionIdSnapshot()).toBe("sec-1");
    act(() => ctx().setSelectedSectionId(null));
    expect(getSelectedSectionIdSnapshot()).toBeNull();
  });
});

describe("edit-context.tsx W0-T2 — drawer mutex", () => {
  it("(b) openTheme() flips themeOpen true and leaves the other right-rail drawers false", () => {
    const { state, Consumer } = makeRenderCountedConsumer();
    // workspacePlan must allow shell edit (openTheme no-ops on free plans).
    render(
      <EditProvider tenantId="t" workspacePlan="studio">
        <Consumer />
      </EditProvider>,
    );
    const ctx = () => state.ctx!;

    act(() => ctx().openTheme());
    expect(ctx().themeOpen).toBe(true);
    expect(ctx().assetsOpen).toBe(false);
    expect(ctx().publishOpen).toBe(false);
    expect(ctx().collectionsOpen).toBe(false);

    // Opening another drawer is mutually exclusive — theme closes.
    act(() => ctx().openAssets());
    expect(ctx().assetsOpen).toBe(true);
    expect(ctx().themeOpen).toBe(false);
  });
});

describe("edit-context.tsx W0-T2 — undo/redo surface", () => {
  it("(c) a fresh provider has empty undo/redo stacks and undo()/redo() are no-op-safe", async () => {
    const { state, Consumer } = makeRenderCountedConsumer();
    render(
      <EditProvider tenantId="t" workspacePlan="studio">
        <Consumer />
      </EditProvider>,
    );
    const ctx = () => state.ctx!;
    expect(getCanUndoSnapshot()).toBe(false);
    expect(getCanRedoSnapshot()).toBe(false);
    // Calling undo/redo on empty stacks must not throw (guarded internally).
    await act(async () => {
      await ctx().undo();
      await ctx().redo();
    });
    expect(getCanUndoSnapshot()).toBe(false);
    expect(getCanRedoSnapshot()).toBe(false);
  });
});

// ── W2-T4a — selection-ref fix: action callbacks stay stable across a click ──

describe("edit-context.tsx W2-T4a — action-callback identity is selection-quiet", () => {
  it("a section selection does NOT recreate the builder-node action callbacks that depend only on executeBuilderNodeOperation", () => {
    const { state, Consumer } = makeRenderCountedConsumer();
    render(
      <EditProvider
        tenantId="t"
        workspacePlan="studio"
        initialComposition={compositionWithSections(["sec-1", "sec-2"])}
      >
        <Consumer />
      </EditProvider>,
    );
    const ctx = () => state.ctx!;

    // insertBuilderNode / moveBuilderNodeToIndex derive from
    // executeBuilderNodeOperation and do NOT read selection in their own bodies.
    // Before W2-T4a, executeBuilderNodeOperation listed selectedSectionId /
    // selectedBuilderNodeId in its deps purely for an audit annotation, so EVERY
    // selection change recreated it → recreated these dependent callbacks → a
    // fresh context `value`. W2-T4a reads selection from refs and drops it from
    // executeBuilderNodeOperation's deps, so these keep a STABLE identity across
    // a click — closing the leak that would otherwise re-open the GATE-C split.
    act(() => ctx().setSelectedSectionId("sec-1"));
    const insertBefore = ctx().insertBuilderNode;
    const moveBefore = ctx().moveBuilderNodeToIndex;
    // W2-T4a (extended) — removeBuilderNode used to churn on selection too
    // (it read live selection in its body for post-delete focus alignment).
    // It now reads selection from refs, so its identity is stable across a click.
    const removeBefore = ctx().removeBuilderNode;
    const pasteBefore = ctx().pasteCopiedBuilderNode;

    // Change the selection.
    act(() => ctx().setSelectedSectionId("sec-2"));

    // ✅ W2-T4a: identical references — the selection change did not churn them.
    expect(ctx().insertBuilderNode).toBe(insertBefore);
    expect(ctx().moveBuilderNodeToIndex).toBe(moveBefore);
    expect(ctx().removeBuilderNode).toBe(removeBefore);
    expect(ctx().pasteCopiedBuilderNode).toBe(pasteBefore);

    // W2-T4a final state: removeBuilderNode / duplicateBuilderNode /
    // ungroupSelectedBuilderNode / pasteBuilderNodeClipboard /
    // saveSelectedNodeAsComponent etc. now ALL read selection from refs, so
    // NONE of them churn on a selection change. That removes the last selection
    // variable from the value-memo deps (directly OR via a callback) — proven
    // by the value-ref-stable assertion in the W2 block below.
  });
});

// ── W2-T4 — dirty micro-store: a dirty flip doesn't re-render the chrome ──────

describe("edit-context.tsx W2-T4 — dirty is off the context value", () => {
  it("setDirty(true) does NOT re-render a dirty-agnostic context consumer (dirty moved to the bridge, out of the value-memo deps)", () => {
    const { state, Consumer } = makeRenderCountedConsumer();
    render(
      <EditProvider tenantId="t" workspacePlan="studio">
        <Consumer />
      </EditProvider>,
    );
    const ctx = () => state.ctx!;
    const before = state.renders;

    // The first edit of a burst flips `dirty` false→true. Before W2-T4 that
    // rebuilt the whole context value → every consumer re-rendered. Now `dirty`
    // is published to the dirty-bridge and dropped from the value-memo deps, so
    // a dirty-agnostic consumer (this one reads useEditContext() but not dirty)
    // is not woken — the value identity is stable across the flip.
    act(() => ctx().setDirty(true));

    // ✅ W2-T4: 0 re-renders of the dirty-agnostic consumer.
    expect(state.renders - before).toBe(0);
  });
});

describe("edit-context.tsx W0-T2/W2-T3 — hover render-count probe (post-fix: hover off the value)", () => {
  it("(d) W2-T3: a hover-setter call does NOT re-render a hover-agnostic context consumer (hover moved to the bridge, out of the value-memo deps)", () => {
    const { state, Consumer } = makeRenderCountedConsumer();
    render(
      <EditProvider tenantId="t" workspacePlan="studio">
        <Consumer />
      </EditProvider>,
    );
    const ctx = () => state.ctx!;
    const before = state.renders;

    act(() => ctx().setHoveredBuilderNodeId("node-x"));

    const hoverRenderDelta = state.renders - before;
    // ✅ W2-T3 LANDED: hover moved into the `hover-bridge` useSyncExternalStore
    // micro-store and was dropped from the value-memo deps. A hover-agnostic
    // consumer (this one reads useEditContext() but never the hovered id) is no
    // longer woken — the setter just publishes to the bridge, the context value
    // does NOT rebuild. This assertion FLIPPED from `>= 1` (pre-fix baseline)
    // to `=== 0`: the count proof that a hover no longer re-renders the chrome.
    expect(hoverRenderDelta).toBe(0);

    // Setting the SAME hovered id again still must NOT re-render — the bridge
    // no-ops on an identical primitive (Object.is), so no listener fires.
    const afterFirst = state.renders;
    act(() => ctx().setHoveredBuilderNodeId("node-x"));
    expect(state.renders).toBe(afterFirst);
  });

  it("W2-T3: a hovered-SECTION setter no longer re-renders a hover-agnostic consumer", () => {
    const { state, Consumer } = makeRenderCountedConsumer();
    render(
      <EditProvider tenantId="t" workspacePlan="studio">
        <Consumer />
      </EditProvider>,
    );
    const ctx = () => state.ctx!;
    const before = state.renders;
    act(() => ctx().setHoveredSectionId("sec-hover"));
    // ✅ W2-T3: same as the node-hover case — section hover publishes to the
    // bridge, not the context value. FLIPPED from `>= 1` to `=== 0`.
    expect(state.renders - before).toBe(0);
  });
});

// ── W2 — selection micro-store: selection moves OFF the context value ─────────
//
// The four selection slices (selectedSectionId / selectedBuilderNodeId + the two
// multi-select Sets) no longer live in the value-memo object NOR its dependency
// array — they are published to the `selection-bridge` micro-store, and only the
// handful of readers that call the bridge hooks re-render on a selection change.
//
// W2-T4a CLOSED: a selection change now leaves the value memo's REFERENCE
// unchanged. The four selection slices were already off the value object + its
// dep array (selection-bridge). The remaining leak — several ACTION callbacks
// (removeBuilderNode / saveSelectedNodeAsComponent / the multi-select mutators /
// ungroup / paste / getCopiedBuilderNodePastePreview, and dispatch's
// section.applyFieldEdit·rename branches) that read live selection in their
// bodies and listed it in their deps — is now closed: they read selection from
// refs (synced every render) and dropped it from their deps. So a click no
// longer churns ANY callback that feeds the value memo → the value ref is
// stable → a selection-agnostic consumer re-renders ZERO times. The assertions
// below FLIPPED from `<= 1` to `=== 0` and now also pin the value REFERENCE.
describe("edit-context.tsx W2 — selection is off the context value", () => {
  it("setSelectedSectionId does NOT re-render a selection-agnostic consumer and keeps the context value reference stable (Object.is)", () => {
    const { state, Consumer } = makeRenderCountedConsumer();
    render(
      <EditProvider
        tenantId="t"
        workspacePlan="studio"
        initialComposition={compositionWithSections(["sec-1", "sec-2"])}
      >
        <Consumer />
      </EditProvider>,
    );
    const ctx = () => state.ctx!;
    // Establish a baseline selection so the measured flip is sec-1 → sec-2 (a
    // genuine selection change, not the first null → sec-1 transition which can
    // also flush composition-derived state).
    act(() => ctx().setSelectedSectionId("sec-1"));
    const valueBefore = state.ctx;
    const before = state.renders;

    act(() => ctx().setSelectedSectionId("sec-2"));

    // ✅ W2-T4a: the value REFERENCE is unchanged across the selection change —
    // no callback that feeds the value memo churned, so the memo did not rebuild.
    expect(Object.is(state.ctx, valueBefore)).toBe(true);
    // ✅ ...and a selection-agnostic consumer re-renders ZERO times.
    expect(state.renders - before).toBe(0);
    // The selection DID change, proven via the bridge snapshot.
    expect(getSelectedSectionIdSnapshot()).toBe("sec-2");
  });

  it("extendSelection publishes the additional-selected Set to the bridge and keeps the context value reference stable", () => {
    const { state, Consumer } = makeRenderCountedConsumer();
    render(
      <EditProvider
        tenantId="t"
        workspacePlan="studio"
        initialComposition={compositionWithSections(["sec-1", "sec-2"])}
      >
        <Consumer />
      </EditProvider>,
    );
    const ctx = () => state.ctx!;
    act(() => ctx().setSelectedSectionId("sec-1"));
    const valueBefore = state.ctx;
    const before = state.renders;

    act(() => ctx().extendSelection("sec-2"));

    // ✅ W2-T4a: the additional-selected Set is published to the bridge AND the
    // multi-select mutators read it via refs, so the value ref is unchanged and
    // a selection-agnostic consumer re-renders ZERO times.
    expect(Object.is(state.ctx, valueBefore)).toBe(true);
    expect(state.renders - before).toBe(0);
    expect(getAdditionalSelectedIdsSnapshot().has("sec-2")).toBe(true);
  });

  it("the selection-bridge Set publisher is referentially STABLE when membership is unchanged (no useSyncExternalStore loop)", () => {
    const { state, Consumer } = makeRenderCountedConsumer();
    render(
      <EditProvider
        tenantId="t"
        workspacePlan="studio"
        initialComposition={compositionWithSections(["sec-1", "sec-2"])}
      >
        <Consumer />
      </EditProvider>,
    );
    const ctx = () => state.ctx!;
    act(() => ctx().setSelectedSectionId("sec-1"));
    act(() => ctx().extendSelection("sec-2"));
    const refA = getAdditionalSelectedIdsSnapshot();
    // Re-extend the SAME id — membership is unchanged, so the bridge must keep
    // the same Set reference (the publisher no-ops by size + every-member-present).
    act(() => ctx().extendSelection("sec-2"));
    const refB = getAdditionalSelectedIdsSnapshot();
    expect(refB).toBe(refA);
    expect(refB.has("sec-2")).toBe(true);
  });
});
