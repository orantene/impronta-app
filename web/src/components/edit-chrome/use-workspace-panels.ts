"use client";

/**
 * use-workspace-panels — the Photoshop-style dockable-workspace state
 * (floating-panel pin/reset/registry + magnet-snap rect reads), peeled out of
 * edit-context.tsx (W4-F2 god-file decomposition). Pure client state: the
 * pinned layout persists via ./workspace-layout's versioned localStorage key.
 * Behavior is IDENTICAL to the former inline block — comments preserved.
 */

import { useCallback, useMemo, useRef, useState } from "react";

import {
  loadWorkspaceLayout,
  saveWorkspaceLayout,
  clearWorkspaceLayout,
  savedOffsetForPanel,
  type LayoutStorage,
  type PanelOffset,
  type WorkspaceLayoutV1,
} from "./workspace-layout";
import type { EditContextValue } from "./edit-context-types";

export function useWorkspacePanels() {
  // ── Photoshop-style dockable workspace ─────────────────────────────────
  // The pinned layout is read ONCE on mount (so panels can seed their initial
  // offset synchronously via getSavedPanelOffset) and held in a ref. Pin
  // rewrites it from the live panel offsets; Reset clears it + bumps a nonce
  // the panels watch to snap home. Each floating panel registers a pair of
  // getters (live offset + live rect) so Pin can snapshot every panel and the
  // magnet can edge-align against the others.
  const layoutStorage = useMemo<LayoutStorage | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      // Touch it once so a SecurityError (disabled storage) degrades to null
      // here rather than throwing on every save.
      return window.localStorage;
    } catch {
      return null;
    }
  }, []);
  // The pinned layout is read ONCE via a lazy useState initializer so the
  // panels' own initial `useState(seed)` reads it through getSavedPanelOffset
  // on their first render (before paint) — no flash of the home position, and
  // no ref-access-during-render. Pin rewrites it; Reset clears it + bumps a
  // nonce the panels watch to snap home.
  const [savedWorkspaceLayout, setSavedWorkspaceLayout] =
    useState<WorkspaceLayoutV1 | null>(() => loadWorkspaceLayout(layoutStorage));
  const hasSavedWorkspaceLayout = savedWorkspaceLayout != null;
  const [workspaceResetNonce, setWorkspaceResetNonce] = useState(0);
  // Live panel registry (getOffset + getRect per panel). A ref because it is
  // only ever read/written from event handlers (Pin) + the magnet move loop,
  // never during render.
  const workspacePanelsRef = useRef<
    Map<
      string,
      {
        getOffset: () => PanelOffset;
        getRect: () => { left: number; top: number; width: number; height: number } | null;
      }
    >
  >(new Map());
  const workspacePanelOffsetSettersRef = useRef<
    Map<
      string,
      (next: PanelOffset | ((prev: PanelOffset) => PanelOffset)) => void
    >
  >(new Map());

  const registerWorkspacePanelOffset = useCallback<
    EditContextValue["registerWorkspacePanelOffset"]
  >((panelId, setOffset) => {
    workspacePanelOffsetSettersRef.current.set(panelId, setOffset);
    return () => {
      if (workspacePanelOffsetSettersRef.current.get(panelId) === setOffset) {
        workspacePanelOffsetSettersRef.current.delete(panelId);
      }
    };
  }, []);

  const getWorkspacePanelOffset = useCallback<
    EditContextValue["getWorkspacePanelOffset"]
  >((panelId) => {
    return workspacePanelsRef.current.get(panelId)?.getOffset() ?? null;
  }, []);

  const getWorkspacePanelRect = useCallback<
    EditContextValue["getWorkspacePanelRect"]
  >((panelId) => {
    return workspacePanelsRef.current.get(panelId)?.getRect() ?? null;
  }, []);

  const setWorkspacePanelOffset = useCallback<
    EditContextValue["setWorkspacePanelOffset"]
  >((panelId, offset) => {
    const setter = workspacePanelOffsetSettersRef.current.get(panelId);
    setter?.(offset);
  }, []);

  const applyWorkspacePanelOffsetDelta = useCallback<
    EditContextValue["applyWorkspacePanelOffsetDelta"]
  >((panelId, delta) => {
    const setter = workspacePanelOffsetSettersRef.current.get(panelId);
    if (!setter) return;
    setter((prev) => ({
      x: prev.x + delta.x,
      y: prev.y + delta.y,
    }));
  }, []);

  const getSavedPanelOffset = useCallback<
    EditContextValue["getSavedPanelOffset"]
  >(
    (panelId) => savedOffsetForPanel(savedWorkspaceLayout, panelId),
    [savedWorkspaceLayout],
  );

  const registerWorkspacePanel = useCallback<
    EditContextValue["registerWorkspacePanel"]
  >((panelId, handles) => {
    workspacePanelsRef.current.set(panelId, handles);
    return () => {
      // Only delete if this exact registration is still current (a remount can
      // register the replacement before the old cleanup runs).
      if (workspacePanelsRef.current.get(panelId) === handles) {
        workspacePanelsRef.current.delete(panelId);
      }
    };
  }, []);

  const getOtherWorkspacePanelRects = useCallback<
    EditContextValue["getOtherWorkspacePanelRects"]
  >((panelId) => {
    const rects: Array<{ left: number; top: number; width: number; height: number }> = [];
    for (const [id, handles] of workspacePanelsRef.current) {
      if (id === panelId) continue;
      const rect = handles.getRect();
      if (rect) rects.push(rect);
    }
    return rects;
  }, []);

  const pinWorkspaceLayout = useCallback<
    EditContextValue["pinWorkspaceLayout"]
  >(() => {
    const panels: Record<string, PanelOffset> = {};
    for (const [id, handles] of workspacePanelsRef.current) {
      panels[id] = handles.getOffset();
    }
    const saved = saveWorkspaceLayout(layoutStorage, panels);
    if (saved) {
      setSavedWorkspaceLayout({ version: 1, panels });
    }
  }, [layoutStorage]);

  const resetWorkspaceLayout = useCallback<
    EditContextValue["resetWorkspaceLayout"]
  >(() => {
    clearWorkspaceLayout(layoutStorage);
    setSavedWorkspaceLayout(null);
    // Bump the nonce so every floating panel snaps its session offset home.
    setWorkspaceResetNonce((n) => n + 1);
  }, [layoutStorage]);

  // ── Canvas-geometry dirty signal (PR #1136 leftover) ─────────────────────
  // The anchored selection toolbar's rAF loop (selection-layer.tsx) only
  // re-measures occluders on a `geometryDirtyRef` signal (scroll / resize /
  // ResizeObserver / MutationObserver / selection change), so it skips idle
  // frames. A floating panel being DRAGGED moves via `useFloatingDrag`'s own
  // pointer listeners (floating-panel.tsx) — a completely separate component
  // tree with no direct signal into that ref. Same registry pattern as
  // `registerWorkspacePanel` above: a ref-held listener Set (no re-render per
  // drag tick), so `useFloatingDrag` can call `notifyCanvasGeometryDirty()` on
  // every drag tick and `selection-layer.tsx` can subscribe once on mount.
  const canvasGeometryDirtyListenersRef = useRef<Set<() => void>>(new Set());
  const registerCanvasGeometryDirtyListener = useCallback<
    EditContextValue["registerCanvasGeometryDirtyListener"]
  >((listener) => {
    canvasGeometryDirtyListenersRef.current.add(listener);
    return () => {
      canvasGeometryDirtyListenersRef.current.delete(listener);
    };
  }, []);
  const notifyCanvasGeometryDirty = useCallback<
    EditContextValue["notifyCanvasGeometryDirty"]
  >(() => {
    for (const listener of canvasGeometryDirtyListenersRef.current) {
      listener();
    }
  }, []);

  return {
    hasSavedWorkspaceLayout,
    workspaceResetNonce,
    pinWorkspaceLayout,
    resetWorkspaceLayout,
    getSavedPanelOffset,
    registerWorkspacePanel,
    getOtherWorkspacePanelRects,
    registerWorkspacePanelOffset,
    applyWorkspacePanelOffsetDelta,
    setWorkspacePanelOffset,
    getWorkspacePanelOffset,
    getWorkspacePanelRect,
    registerCanvasGeometryDirtyListener,
    notifyCanvasGeometryDirty,
  };
}
