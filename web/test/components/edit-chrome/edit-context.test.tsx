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
import type { CompositionData } from "@/lib/site-admin/edit-mode/composition-actions";
import { SITE_HEADER_SELECTION_ID } from "@/lib/site-admin/site-header/selection-id";

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
    // selectedSectionId is null at first paint.
    expect(result.current.selectedSectionId).toBeNull();
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
    expect(ctx().selectedSectionId).toBe("sec-1");

    // Extend selection to a second live section → it lands in the multi-set.
    act(() => ctx().extendSelection("sec-2"));
    expect(ctx().additionalSelectedIds.has("sec-2")).toBe(true);

    // A plain select of a different section CLEARS the multi-set (plain-click
    // semantics) and re-seats the primary.
    act(() => ctx().setSelectedSectionId("sec-2"));
    expect(ctx().selectedSectionId).toBe("sec-2");
    expect(ctx().additionalSelectedIds.size).toBe(0);
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
    expect(ctx().selectedSectionId).toBe("sec-1");
    act(() => ctx().setSelectedSectionId(null));
    expect(ctx().selectedSectionId).toBeNull();
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
    expect(ctx().canUndo).toBe(false);
    expect(ctx().canRedo).toBe(false);
    // Calling undo/redo on empty stacks must not throw (guarded internally).
    await act(async () => {
      await ctx().undo();
      await ctx().redo();
    });
    expect(ctx().canUndo).toBe(false);
    expect(ctx().canRedo).toBe(false);
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
