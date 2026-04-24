"use client";

/**
 * InspectorDock — right-rail canvas editor panel.
 *
 * Responsibilities:
 *   1. Watch `selectedSectionId`; whenever it changes, fetch the section from
 *      the server and seed `loadedSection` + `draftProps`.
 *   2. Render a tabbed surface (Content / Layout / Style) over the draft.
 *   3. Drive the autosave loop: when `dirty` flips true, debounce 450ms, push
 *      the working props via `saveSectionDraftAction`, and advance the CAS
 *      version on success. Conflicts refetch the row and discard the tail.
 *   4. Keep the top-bar Save Indicator in sync via context (`dirty`, `saving`).
 *
 * Inspector panels are lean. The shared Layout + Style panels cover all 12
 * section types via the platform `presentation` sub-schema. Content is curated
 * per-type when possible (see ./inspectors/*) and falls back to the registry's
 * existing Editor for types that haven't been upgraded yet — no functional
 * regression against the composer, while the premium edits live on canvas.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import {
  loadSectionForEditAction,
  saveSectionDraftAction,
} from "@/lib/site-admin/edit-mode/section-actions";
import { SECTION_EDITOR_REGISTRY } from "@/lib/site-admin/sections/registry-editors";
import type { LoadedSection } from "./edit-context";
import { useEditContext } from "./edit-context";
import { ContentTab } from "./inspectors/content-dispatch";
import { LayoutPanel } from "./inspectors/layout-panel";
import { StylePanel } from "./inspectors/style-panel";

type TabKey = "content" | "layout" | "style";

const TABS: ReadonlyArray<{ key: TabKey; label: string }> = [
  { key: "content", label: "Content" },
  { key: "layout", label: "Layout" },
  { key: "style", label: "Style" },
];

function humanizeTypeKey(key: string | null | undefined): string {
  if (!key) return "Section";
  return key
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function InspectorDock() {
  const {
    tenantId,
    selectedSectionId,
    setSelectedSectionId,
    loadedSection,
    setLoadedSection,
    draftProps,
    setDraftProps,
    dirty,
    setDirty,
    saving,
    setSaving,
    recordFieldEdit,
  } = useEditContext();

  const [tab, setTab] = useState<TabKey>("content");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // ---- load section whenever selectedSectionId changes --------------------
  useEffect(() => {
    let cancelled = false;
    if (!selectedSectionId) {
      setLoadedSection(null);
      setDraftProps(null);
      setDirty(false);
      setLoadError(null);
      return;
    }
    // If the loaded section already matches, no need to refetch.
    if (loadedSection?.id === selectedSectionId && !dirty) return;
    setLoadingId(selectedSectionId);
    setLoadError(null);
    (async () => {
      const result = await loadSectionForEditAction(selectedSectionId);
      if (cancelled) return;
      setLoadingId(null);
      if (!result.ok) {
        setLoadError(result.error);
        setLoadedSection(null);
        setDraftProps(null);
        setDirty(false);
        return;
      }
      setLoadedSection(result.section);
      setDraftProps({ ...result.section.props });
      setDirty(false);
      setTab("content");
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSectionId]);

  // ---- autosave loop ------------------------------------------------------
  const latestLoadedRef = useRef<LoadedSection | null>(loadedSection);
  useEffect(() => {
    latestLoadedRef.current = loadedSection;
  }, [loadedSection]);

  useEffect(() => {
    if (!dirty) return;
    if (!loadedSection || !draftProps) return;

    const timer = setTimeout(async () => {
      setSaving(true);
      setSaveError(null);
      const snapshot = { ...draftProps };
      const loaded = latestLoadedRef.current ?? loadedSection;
      // Pre-edit props snapshot — used to record the undo entry on success
      // so ⌘Z can replay the field state that existed before this save.
      const preProps = { ...loaded.props };
      const result = await saveSectionDraftAction({
        id: loaded.id,
        sectionTypeKey: loaded.sectionTypeKey,
        schemaVersion: loaded.schemaVersion,
        name: loaded.name,
        props: snapshot,
        expectedVersion: loaded.version,
      });
      setSaving(false);
      if (result.ok) {
        setLoadedSection({
          ...loaded,
          version: result.version,
          props: snapshot,
        });
        setDirty(false);
        recordFieldEdit({
          sectionId: loaded.id,
          sectionTypeKey: loaded.sectionTypeKey,
          schemaVersion: loaded.schemaVersion,
          name: loaded.name,
          pre: preProps,
          post: snapshot,
        });
        return;
      }
      if (result.code === "VERSION_CONFLICT") {
        // Refetch authoritative row, discard tail.
        setSaveError("Section changed elsewhere — reloading.");
        const fresh = await loadSectionForEditAction(loaded.id);
        if (fresh.ok) {
          setLoadedSection(fresh.section);
          setDraftProps({ ...fresh.section.props });
          setDirty(false);
          setSaveError(null);
        }
        return;
      }
      setSaveError(result.error);
    }, 450);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, draftProps]);

  // ---- inspector onChange plumbing ----------------------------------------
  const handleContentChange = useCallback(
    (next: Record<string, unknown>) => {
      setDraftProps(next);
      setDirty(true);
    },
    [setDraftProps, setDirty],
  );

  const handlePresentationPatch = useCallback(
    (patch: Record<string, unknown>) => {
      setDraftProps((prev) => {
        if (!prev) return prev;
        const prevPresentation =
          (prev.presentation as Record<string, unknown> | undefined) ?? {};
        const merged = { ...prevPresentation, ...patch };
        // Strip empty strings/nullish entries so the server Zod treats them
        // as "unset" rather than attempting to enum-match ""/undefined.
        for (const k of Object.keys(merged)) {
          const v = merged[k];
          if (v === "" || v === null || v === undefined) delete merged[k];
        }
        return {
          ...prev,
          presentation: Object.keys(merged).length ? merged : undefined,
        };
      });
      setDirty(true);
    },
    [setDraftProps, setDirty],
  );

  const handleStylePatch = useCallback(
    (patch: Record<string, unknown>) => {
      // Style-panel edits can patch both root-level fields (e.g. hero overlay,
      // hero mood) and presentation fields (background, divider). We split:
      const { __presentation, ...rootPatch } = patch as Record<
        string,
        unknown
      > & { __presentation?: Record<string, unknown> };
      setDraftProps((prev) => {
        if (!prev) return prev;
        const next: Record<string, unknown> = { ...prev, ...rootPatch };
        for (const k of Object.keys(rootPatch)) {
          if (
            rootPatch[k] === "" ||
            rootPatch[k] === null ||
            rootPatch[k] === undefined
          ) {
            delete next[k];
          }
        }
        if (__presentation) {
          const prevPresentation =
            (prev.presentation as Record<string, unknown> | undefined) ?? {};
          const merged = { ...prevPresentation, ...__presentation };
          for (const k of Object.keys(merged)) {
            const v = merged[k];
            if (v === "" || v === null || v === undefined) delete merged[k];
          }
          next.presentation = Object.keys(merged).length ? merged : undefined;
        }
        return next;
      });
      setDirty(true);
    },
    [setDraftProps, setDirty],
  );

  // ---- render -------------------------------------------------------------
  const registryEntry = loadedSection
    ? (SECTION_EDITOR_REGISTRY[loadedSection.sectionTypeKey] ?? null)
    : null;

  return (
    <aside
      data-edit-inspector
      className="fixed right-0 top-[52px] z-[85] hidden h-[calc(100vh-52px)] w-[340px] flex-col border-l border-black/10 bg-white text-sm text-zinc-900 lg:flex"
    >
      <header className="flex items-start justify-between gap-2 border-b border-zinc-100 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
            Inspector
          </div>
          {loadedSection ? (
            <>
              {/* Operator's section name leads — it's the label they chose
                  ("Muse — hero"), which reads better than the platform type
                  key. Fall back to the humanized type key only if the row
                  somehow has no name. Type key is always visible below as
                  a small uppercase caption, so the section's kind is still
                  discoverable. */}
              <div className="mt-1 truncate text-sm font-semibold tracking-tight text-zinc-900">
                {loadedSection.name?.trim() ||
                  humanizeTypeKey(loadedSection.sectionTypeKey)}
              </div>
              <div className="mt-0.5 truncate text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-400">
                {humanizeTypeKey(loadedSection.sectionTypeKey)}
              </div>
            </>
          ) : (
            <div className="mt-1 text-sm font-semibold text-zinc-400">
              {selectedSectionId && loadingId
                ? "Loading section…"
                : "No selection"}
            </div>
          )}
        </div>
        {selectedSectionId ? (
          <button
            type="button"
            onClick={() => setSelectedSectionId(null)}
            className="shrink-0 rounded-md border border-transparent p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
            aria-label="Close inspector"
            title="Close"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        ) : null}
      </header>

      {!selectedSectionId ? (
        <EmptyState />
      ) : loadError ? (
        <div className="flex-1 overflow-y-auto px-4 py-6 text-xs text-amber-700">
          {loadError}
        </div>
      ) : !loadedSection || !registryEntry ? (
        <div className="flex-1 overflow-y-auto px-4 py-6 text-xs text-zinc-400">
          Loading…
        </div>
      ) : (
        <>
          <nav className="flex items-center gap-1 border-b border-zinc-100 px-2">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`relative px-3 py-2.5 text-xs font-medium transition ${
                  tab === t.key
                    ? "text-zinc-900"
                    : "text-zinc-500 hover:text-zinc-800"
                }`}
              >
                {t.label}
                {tab === t.key ? (
                  <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-zinc-900" />
                ) : null}
              </button>
            ))}
          </nav>

          <div className="flex-1 overflow-y-auto">
            {saveError ? (
              <div className="border-b border-amber-200/60 bg-amber-50 px-4 py-2 text-[11px] text-amber-700">
                {saveError}
              </div>
            ) : null}
            <div className="px-4 py-4">
              {tab === "content" ? (
                <ContentTab
                  sectionTypeKey={loadedSection.sectionTypeKey}
                  schemaVersion={loadedSection.schemaVersion}
                  tenantId={tenantId}
                  draftProps={draftProps ?? {}}
                  onChange={handleContentChange}
                />
              ) : null}
              {tab === "layout" ? (
                <LayoutPanel
                  presentation={
                    (draftProps?.presentation as
                      | Record<string, unknown>
                      | undefined) ?? {}
                  }
                  onPatch={handlePresentationPatch}
                />
              ) : null}
              {tab === "style" ? (
                <StylePanel
                  sectionTypeKey={loadedSection.sectionTypeKey}
                  draftProps={draftProps ?? {}}
                  onPatch={handleStylePatch}
                />
              ) : null}
            </div>
          </div>

          <footer className="flex items-center justify-between border-t border-zinc-100 px-4 py-2 text-[11px] text-zinc-400">
            <span>
              {/* Just the version — the schema version is a platform concern
                  the operator can't act on and its dot-separated presence
                  made the footer read like a debug line. */}v
              {loadedSection.version}
            </span>
            <span>
              {saving
                ? "Saving…"
                : dirty
                  ? "Unsaved changes"
                  : "Draft"}
            </span>
          </footer>
        </>
      )}
    </aside>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 text-center text-zinc-400">
      <div className="mb-3 size-10 rounded-full border border-dashed border-zinc-200" />
      <p className="text-sm font-medium text-zinc-600">Select a section</p>
      <p className="mt-1 max-w-[220px] text-xs text-zinc-400">
        Click any section on the page to edit its content, layout, and styling
        here.
      </p>
    </div>
  );
}
