"use client";

/**
 * EditContext — session state for the in-place visual editor.
 *
 * Two concerns live here:
 *   1. Inspector state (Phase 2) — selected section + server-truth payload +
 *      working-copy draftProps + autosave status.
 *   2. Composition state (Phase 3) — the full draft homepage composition
 *      (slots + metadata + pageVersion) the client mutates for insert /
 *      remove / move, plus an undo/redo history stack.
 *
 * The server is always the source of truth. Composition mutations run as
 * optimistic updates on the local state, then save against the CAS guard on
 * pageVersion. A VERSION_CONFLICT forces a full reload and discards unsaved
 * mutations — the operator is told, but we don't try to auto-merge.
 *
 * History is a simple three-stack record (past/present/future). Every
 * concrete mutation pushes the pre-mutation snapshot onto past and clears
 * future. Undo swaps past<→present, pushing present onto future. Redo does
 * the reverse. Snapshots capture { slots, metadata } — pageVersion is
 * tracked separately because CAS is a server concern, not a user concern.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

import {
  createAndInsertSectionAction,
  loadHomepageCompositionAction,
  saveHomepageCompositionAction,
  type CompositionData,
  type CompositionLibraryEntry,
  type CompositionSectionRef,
  type CompositionSlotDef,
} from "@/lib/site-admin/edit-mode/composition-actions";

export type EditDevice = "desktop" | "tablet" | "mobile";

export interface LoadedSection {
  id: string;
  sectionTypeKey: string;
  schemaVersion: number;
  version: number;
  name: string;
  props: Record<string, unknown>;
}

export interface PageMetadata {
  title: string;
  metaDescription: string | null;
  introTagline: string | null;
}

export interface CompositionSnapshot {
  slots: Record<string, CompositionSectionRef[]>;
  metadata: PageMetadata;
}

export interface LibraryTarget {
  slotKey: string;
  /** null → prepend to slot. Otherwise insert after this sort order. */
  insertAfterSortOrder: number | null;
}

export interface EditContextValue {
  tenantId: string;
  locale: string;

  /** Section the inspector is operating on. Null → "Select a section". */
  selectedSectionId: string | null;
  setSelectedSectionId: (id: string | null) => void;

  /** Section under the cursor, for hover outline. */
  hoveredSectionId: string | null;
  setHoveredSectionId: (id: string | null) => void;

  device: EditDevice;
  setDevice: (d: EditDevice) => void;

  /** Inspector autosave state. */
  dirty: boolean;
  setDirty: (d: boolean) => void;
  saving: boolean;
  setSaving: (s: boolean) => void;

  /** Server-truth payload for the selected section. */
  loadedSection: LoadedSection | null;
  setLoadedSection: (s: LoadedSection | null) => void;

  /** Working copy the inspector mutates. */
  draftProps: Record<string, unknown> | null;
  setDraftProps: (
    updater:
      | Record<string, unknown>
      | null
      | ((prev: Record<string, unknown> | null) => Record<string, unknown> | null),
  ) => void;

  // ── composition state ──────────────────────────────────────────────────
  compositionLoaded: boolean;
  compositionLoading: boolean;
  compositionError: string | null;
  pageVersion: number | null;
  pageMetadata: PageMetadata | null;
  slots: Record<string, CompositionSectionRef[]>;
  slotDefs: CompositionSlotDef[];
  library: CompositionLibraryEntry[];

  refreshComposition: () => Promise<void>;
  insertSection: (
    target: LibraryTarget,
    sectionTypeKey: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  removeSection: (sectionId: string) => Promise<{ ok: boolean; error?: string }>;
  moveSection: (
    sectionId: string,
    direction: "up" | "down",
  ) => Promise<{ ok: boolean; error?: string }>;

  // ── history ──
  canUndo: boolean;
  canRedo: boolean;
  undo: () => Promise<void>;
  redo: () => Promise<void>;

  // ── library overlay ──
  libraryTarget: LibraryTarget | null;
  openLibrary: (target: LibraryTarget) => void;
  closeLibrary: () => void;

  // ── publish drawer ──
  publishOpen: boolean;
  openPublish: () => void;
  closePublish: () => void;
}

const EditContext = createContext<EditContextValue | null>(null);

const DEFAULT_METADATA: PageMetadata = {
  title: "Homepage",
  metaDescription: null,
  introTagline: null,
};

function cloneSnapshot(s: CompositionSnapshot): CompositionSnapshot {
  return {
    metadata: { ...s.metadata },
    slots: Object.fromEntries(
      Object.entries(s.slots).map(([k, v]) => [k, v.map((e) => ({ ...e }))]),
    ),
  };
}

function stripSnapshotForSave(s: CompositionSnapshot) {
  const slots: Record<string, Array<{ sectionId: string; sortOrder: number }>> =
    {};
  for (const [k, v] of Object.entries(s.slots)) {
    slots[k] = v.map((e) => ({ sectionId: e.sectionId, sortOrder: e.sortOrder }));
  }
  return {
    metadata: s.metadata,
    slots,
  };
}

interface EditProviderProps {
  tenantId: string;
  /** Falls back to `en` if omitted; edit chrome today operates on the platform default. */
  locale?: string;
  children: ReactNode;
}

export function EditProvider({
  tenantId,
  locale = "en",
  children,
}: EditProviderProps) {
  const router = useRouter();

  // ── inspector state ─────────────────────────────────────────────────
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(
    null,
  );
  const [hoveredSectionId, setHoveredSectionId] = useState<string | null>(null);
  const [device, setDevice] = useState<EditDevice>("desktop");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadedSection, setLoadedSection] = useState<LoadedSection | null>(
    null,
  );
  const [draftPropsState, setDraftPropsState] = useState<Record<
    string,
    unknown
  > | null>(null);

  const setDraftProps = useCallback<EditContextValue["setDraftProps"]>(
    (updater) => {
      if (typeof updater === "function") {
        setDraftPropsState((prev) => updater(prev));
      } else {
        setDraftPropsState(updater);
      }
    },
    [],
  );

  // ── composition state ───────────────────────────────────────────────
  const [compositionLoaded, setCompositionLoaded] = useState(false);
  const [compositionLoading, setCompositionLoading] = useState(false);
  const [compositionError, setCompositionError] = useState<string | null>(null);
  const [pageVersion, setPageVersion] = useState<number | null>(null);
  const [pageMetadata, setPageMetadata] = useState<PageMetadata | null>(null);
  const [slots, setSlots] = useState<Record<string, CompositionSectionRef[]>>(
    {},
  );
  const [slotDefs, setSlotDefs] = useState<CompositionSlotDef[]>([]);
  const [library, setLibrary] = useState<CompositionLibraryEntry[]>([]);

  // history stacks
  const [past, setPast] = useState<CompositionSnapshot[]>([]);
  const [future, setFuture] = useState<CompositionSnapshot[]>([]);

  // library overlay target
  const [libraryTarget, setLibraryTarget] = useState<LibraryTarget | null>(
    null,
  );

  // publish drawer state
  const [publishOpen, setPublishOpen] = useState(false);

  const applyComposition = useCallback((data: CompositionData) => {
    setPageVersion(data.pageVersion);
    setPageMetadata(data.metadata);
    setSlots(data.slots);
    setSlotDefs(data.slotDefs);
    setLibrary(data.library);
    setCompositionLoaded(true);
    setCompositionError(null);
  }, []);

  const refreshComposition = useCallback(async () => {
    setCompositionLoading(true);
    try {
      const res = await loadHomepageCompositionAction({ locale });
      if (res.ok) {
        applyComposition(res.data);
        // Reloading authoritative state also clears history — the stack
        // captures only session-local mutations and stale snapshots would
        // confuse undo after a concurrent edit.
        setPast([]);
        setFuture([]);
      } else {
        setCompositionError(res.error);
      }
    } catch (err) {
      setCompositionError(
        err instanceof Error ? err.message : "Failed to load composition.",
      );
    } finally {
      setCompositionLoading(false);
    }
  }, [locale, applyComposition]);

  // Initial load: only once per provider lifetime. Subsequent reloads go
  // through refreshComposition on mutation conflicts or explicit refresh.
  const initialLoadRef = useRef(false);
  useEffect(() => {
    if (initialLoadRef.current) return;
    initialLoadRef.current = true;
    void refreshComposition();
  }, [refreshComposition]);

  // ── mutation helper ─────────────────────────────────────────────────
  const currentSnapshot = useCallback<() => CompositionSnapshot>(() => {
    return {
      slots,
      metadata: pageMetadata ?? DEFAULT_METADATA,
    };
  }, [slots, pageMetadata]);

  /**
   * Run a snapshot-producing mutation. Captures pre-state onto the history
   * stack, clears the redo stack, applies the optimistic slots/metadata
   * locally, then saves via CAS. On conflict or server error, rolls back.
   * Triggers `router.refresh()` on success so the server-rendered page
   * picks up the new composition.
   */
  const dispatchMutation = useCallback(
    async (
      compute: (prev: CompositionSnapshot) => CompositionSnapshot | null,
    ): Promise<{ ok: boolean; error?: string }> => {
      if (pageVersion === null) {
        return { ok: false, error: "Composition not loaded yet." };
      }
      const snap = currentSnapshot();
      const next = compute(snap);
      if (!next) return { ok: false, error: "Mutation produced no change." };

      // optimistic apply
      setPast((p) => [...p, cloneSnapshot(snap)]);
      setFuture([]);
      setSlots(next.slots);
      setPageMetadata(next.metadata);
      setSaving(true);

      const save = await saveHomepageCompositionAction({
        locale,
        expectedVersion: pageVersion,
        ...stripSnapshotForSave(next),
      });
      setSaving(false);
      if (!save.ok) {
        // roll back the optimistic apply
        setSlots(snap.slots);
        setPageMetadata(snap.metadata);
        setPast((p) => p.slice(0, -1));
        if (save.code === "VERSION_CONFLICT") {
          await refreshComposition();
        }
        return { ok: false, error: save.error };
      }
      setPageVersion(save.pageVersion);
      router.refresh();
      return { ok: true };
    },
    [pageVersion, currentSnapshot, locale, refreshComposition, router],
  );

  // ── insert ─────────────────────────────────────────────────────────
  const insertSection = useCallback<EditContextValue["insertSection"]>(
    async (target, sectionTypeKey) => {
      if (pageVersion === null) {
        return { ok: false, error: "Composition not loaded yet." };
      }
      const snap = currentSnapshot();
      // capture history + clear future BEFORE the round-trip so if the
      // operator navigates away mid-flight, undo still sees the pre-state
      setPast((p) => [...p, cloneSnapshot(snap)]);
      setFuture([]);
      setSaving(true);

      const res = await createAndInsertSectionAction({
        locale,
        expectedVersion: pageVersion,
        metadata: snap.metadata,
        slots: stripSnapshotForSave(snap).slots,
        targetSlotKey: target.slotKey,
        insertAfterSortOrder: target.insertAfterSortOrder,
        sectionTypeKey,
      });
      setSaving(false);

      if (!res.ok) {
        setPast((p) => p.slice(0, -1));
        if (res.code === "VERSION_CONFLICT") {
          await refreshComposition();
        }
        return { ok: false, error: res.error };
      }
      // Reload authoritative composition — avoids drift between our local
      // splice guess and the server's (identical) result.
      await refreshComposition();
      router.refresh();
      return { ok: true };
    },
    [pageVersion, currentSnapshot, locale, refreshComposition, router],
  );

  // ── remove ─────────────────────────────────────────────────────────
  const removeSection = useCallback<EditContextValue["removeSection"]>(
    async (sectionId) => {
      return dispatchMutation((prev) => {
        const nextSlots: Record<string, CompositionSectionRef[]> = {};
        let removed = false;
        for (const [slotKey, entries] of Object.entries(prev.slots)) {
          const kept = entries.filter((e) => e.sectionId !== sectionId);
          if (kept.length !== entries.length) removed = true;
          // Renumber to keep sortOrder dense; save schema allows gaps but
          // keeps comparisons cleaner.
          nextSlots[slotKey] = kept.map((e, i) => ({ ...e, sortOrder: i }));
        }
        if (!removed) return null;
        return { slots: nextSlots, metadata: prev.metadata };
      });
    },
    [dispatchMutation],
  );

  // ── move up/down ───────────────────────────────────────────────────
  const moveSection = useCallback<EditContextValue["moveSection"]>(
    async (sectionId, direction) => {
      return dispatchMutation((prev) => {
        // Find the section across slots
        let slotKey: string | null = null;
        let idx = -1;
        for (const [k, entries] of Object.entries(prev.slots)) {
          const i = entries.findIndex((e) => e.sectionId === sectionId);
          if (i !== -1) {
            slotKey = k;
            idx = i;
            break;
          }
        }
        if (slotKey === null) return null;
        const entries = prev.slots[slotKey]!;
        const newIdx = direction === "up" ? idx - 1 : idx + 1;
        if (newIdx < 0 || newIdx >= entries.length) return null;
        const next = entries.slice();
        [next[idx], next[newIdx]] = [next[newIdx]!, next[idx]!];
        const renumbered = next.map((e, i) => ({ ...e, sortOrder: i }));
        return {
          slots: { ...prev.slots, [slotKey]: renumbered },
          metadata: prev.metadata,
        };
      });
    },
    [dispatchMutation],
  );

  // ── undo / redo ────────────────────────────────────────────────────
  const restoreSnapshot = useCallback(
    async (target: CompositionSnapshot) => {
      if (pageVersion === null) return;
      setSaving(true);
      setSlots(target.slots);
      setPageMetadata(target.metadata);
      const save = await saveHomepageCompositionAction({
        locale,
        expectedVersion: pageVersion,
        ...stripSnapshotForSave(target),
      });
      setSaving(false);
      if (!save.ok) {
        if (save.code === "VERSION_CONFLICT") {
          await refreshComposition();
        }
        return;
      }
      setPageVersion(save.pageVersion);
      router.refresh();
    },
    [pageVersion, locale, refreshComposition, router],
  );

  const undo = useCallback(async () => {
    if (past.length === 0) return;
    const target = past[past.length - 1]!;
    const presentSnap = currentSnapshot();
    setPast((p) => p.slice(0, -1));
    setFuture((f) => [...f, cloneSnapshot(presentSnap)]);
    await restoreSnapshot(target);
  }, [past, currentSnapshot, restoreSnapshot]);

  const redo = useCallback(async () => {
    if (future.length === 0) return;
    const target = future[future.length - 1]!;
    const presentSnap = currentSnapshot();
    setFuture((f) => f.slice(0, -1));
    setPast((p) => [...p, cloneSnapshot(presentSnap)]);
    await restoreSnapshot(target);
  }, [future, currentSnapshot, restoreSnapshot]);

  const openLibrary = useCallback((target: LibraryTarget) => {
    setLibraryTarget(target);
  }, []);
  const closeLibrary = useCallback(() => setLibraryTarget(null), []);

  const openPublish = useCallback(() => setPublishOpen(true), []);
  const closePublish = useCallback(() => setPublishOpen(false), []);

  const value = useMemo<EditContextValue>(
    () => ({
      tenantId,
      locale,
      selectedSectionId,
      setSelectedSectionId,
      hoveredSectionId,
      setHoveredSectionId,
      device,
      setDevice,
      dirty,
      setDirty,
      saving,
      setSaving,
      loadedSection,
      setLoadedSection,
      draftProps: draftPropsState,
      setDraftProps,

      compositionLoaded,
      compositionLoading,
      compositionError,
      pageVersion,
      pageMetadata,
      slots,
      slotDefs,
      library,

      refreshComposition,
      insertSection,
      removeSection,
      moveSection,

      canUndo: past.length > 0,
      canRedo: future.length > 0,
      undo,
      redo,

      libraryTarget,
      openLibrary,
      closeLibrary,

      publishOpen,
      openPublish,
      closePublish,
    }),
    [
      tenantId,
      locale,
      selectedSectionId,
      hoveredSectionId,
      device,
      dirty,
      saving,
      loadedSection,
      draftPropsState,
      setDraftProps,
      compositionLoaded,
      compositionLoading,
      compositionError,
      pageVersion,
      pageMetadata,
      slots,
      slotDefs,
      library,
      refreshComposition,
      insertSection,
      removeSection,
      moveSection,
      past.length,
      future.length,
      undo,
      redo,
      libraryTarget,
      openLibrary,
      closeLibrary,
      publishOpen,
      openPublish,
      closePublish,
    ],
  );

  return <EditContext.Provider value={value}>{children}</EditContext.Provider>;
}

export function useEditContext(): EditContextValue {
  const ctx = useContext(EditContext);
  if (!ctx) {
    throw new Error("useEditContext must be used within EditProvider");
  }
  return ctx;
}

/** Optional variant for components that may mount outside edit chrome. */
export function useMaybeEditContext(): EditContextValue | null {
  return useContext(EditContext);
}
