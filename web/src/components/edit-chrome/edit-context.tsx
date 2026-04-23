"use client";

/**
 * EditContext — session state for the in-place visual editor.
 *
 * Phase 2 scope additions:
 *   - `loadedSection`: the authoritative server-side shape of the currently-
 *     selected section (id, type, schema version, props, row version used for
 *     optimistic CAS).
 *   - `draftProps`: the working copy the inspector mutates. Autosave diffs
 *     this against `loadedSection.props` to decide when to flush.
 *   - `hoveredSectionId`: the section currently under the cursor (for the
 *     overlay's hover outline). Nullable; cleared on pointer leave.
 *
 * The server is still the source of truth — `draftProps` is the unflushed
 * tail, not durable state. On autosave success we snap `loadedSection` to the
 * fresh row; on version conflict we refetch and discard the unsaved tail.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";

export type EditDevice = "desktop" | "tablet" | "mobile";

export interface LoadedSection {
  id: string;
  sectionTypeKey: string;
  schemaVersion: number;
  version: number;
  name: string;
  props: Record<string, unknown>;
}

export interface EditContextValue {
  tenantId: string;

  /** Section the inspector is operating on. Null → "Select a section". */
  selectedSectionId: string | null;
  setSelectedSectionId: (id: string | null) => void;

  /** Section under the cursor, for hover outline. */
  hoveredSectionId: string | null;
  setHoveredSectionId: (id: string | null) => void;

  device: EditDevice;
  setDevice: (d: EditDevice) => void;

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
}

const EditContext = createContext<EditContextValue | null>(null);

export function EditProvider({
  tenantId,
  children,
}: {
  tenantId: string;
  children: ReactNode;
}) {
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
  const [draftProps, setDraftPropsState] = useState<Record<
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

  const value = useMemo<EditContextValue>(
    () => ({
      tenantId,
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
      draftProps,
      setDraftProps,
    }),
    [
      tenantId,
      selectedSectionId,
      hoveredSectionId,
      device,
      dirty,
      saving,
      loadedSection,
      draftProps,
      setDraftProps,
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
