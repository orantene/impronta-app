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
import { ResponsivePanel } from "./inspectors/responsive-panel";
import { MotionPanel } from "./inspectors/motion-panel";
import { PanelSaveChip } from "./inspectors/kit";
import {
  CHROME,
  Drawer,
  DrawerHead,
  DrawerTabs,
  DrawerTab,
  DrawerBody,
  SectionTypeIcon,
} from "./kit";

type TabKey = "content" | "layout" | "style" | "responsive" | "motion";

const TABS: ReadonlyArray<{ key: TabKey; label: string }> = [
  { key: "content", label: "Content" },
  { key: "layout", label: "Layout" },
  { key: "style", label: "Style" },
  { key: "responsive", label: "Responsive" },
  { key: "motion", label: "Motion" },
];

function humanizeTypeKey(key: string | null | undefined): string {
  if (!key) return "Section";
  return key
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Strip seeder debug suffixes like "(Classic starter) d7b14f" from stored names. */
function cleanSectionName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return (
    raw
      .replace(/\s*\([^)]*starter[^)]*\)\s*/gi, "")
      .replace(/\s+[0-9a-f]{6,8}$/i, "")
      .trim() || null
  );
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

    // Capture the section id at scheduling time so an in-flight save that
    // returns after the operator switches sections can't clobber the new
    // section's loaded state. The effect's cleanup also clears the timer
    // on section change, so in practice the race window is small — but
    // server round-trips can be slow and this guard is cheap.
    const scheduledSectionId = loadedSection.id;

    const timer = setTimeout(async () => {
      setSaving(true);
      setSaveError(null);
      const snapshot = { ...draftProps };
      const loaded = latestLoadedRef.current ?? loadedSection;
      if (loaded.id !== scheduledSectionId) {
        // Operator switched sections while the save was queued — abort.
        setSaving(false);
        return;
      }
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
      // Post-round-trip identity check — during the server call the
      // operator may have selected a different section, in which case we
      // must NOT update loadedSection or fire recordFieldEdit (that would
      // attach the old save's result to the new section's state).
      const currentLoaded = latestLoadedRef.current;
      if (!currentLoaded || currentLoaded.id !== scheduledSectionId) {
        setSaving(false);
        return;
      }
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

  /**
   * Phase 6 deep-merge variant for nested presentation patches
   * (`breakpoints.tablet.*`, `animation.*`, etc.). One level of object-
   * valued keys is merged into the existing value; primitives at the leaf
   * follow the same empty-string-strips-the-key semantics as the shallow
   * variant.
   */
  const handlePresentationDeepPatch = useCallback(
    (patch: Record<string, unknown>) => {
      setDraftProps((prev) => {
        if (!prev) return prev;
        const prevPresentation =
          (prev.presentation as Record<string, unknown> | undefined) ?? {};
        const merged: Record<string, unknown> = { ...prevPresentation };

        for (const [topKey, topValue] of Object.entries(patch)) {
          if (
            topValue &&
            typeof topValue === "object" &&
            !Array.isArray(topValue)
          ) {
            const prevSub =
              (merged[topKey] as Record<string, unknown> | undefined) ?? {};
            const nextSub: Record<string, unknown> = { ...prevSub };

            for (const [subKey, subValue] of Object.entries(
              topValue as Record<string, unknown>,
            )) {
              if (
                subValue &&
                typeof subValue === "object" &&
                !Array.isArray(subValue)
              ) {
                // Two levels deep (breakpoints.tablet.{...}).
                const prevLeaf =
                  (nextSub[subKey] as Record<string, unknown> | undefined) ?? {};
                const nextLeaf: Record<string, unknown> = { ...prevLeaf };
                for (const [leafKey, leafValue] of Object.entries(
                  subValue as Record<string, unknown>,
                )) {
                  if (
                    leafValue === "" ||
                    leafValue === null ||
                    leafValue === undefined
                  ) {
                    delete nextLeaf[leafKey];
                  } else {
                    nextLeaf[leafKey] = leafValue;
                  }
                }
                if (Object.keys(nextLeaf).length === 0) {
                  delete nextSub[subKey];
                } else {
                  nextSub[subKey] = nextLeaf;
                }
              } else if (
                subValue === "" ||
                subValue === null ||
                subValue === undefined
              ) {
                delete nextSub[subKey];
              } else {
                nextSub[subKey] = subValue;
              }
            }

            if (Object.keys(nextSub).length === 0) {
              delete merged[topKey];
            } else {
              merged[topKey] = nextSub;
            }
          } else if (
            topValue === "" ||
            topValue === null ||
            topValue === undefined
          ) {
            delete merged[topKey];
          } else {
            merged[topKey] = topValue;
          }
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

  const dockOpen = !!selectedSectionId;

  const sectionTitle = loadedSection
    ? (cleanSectionName(loadedSection.name) ||
        humanizeTypeKey(loadedSection.sectionTypeKey))
    : selectedSectionId && loadingId
      ? "Loading…"
      : "Inspector";

  return (
    <Drawer
      kind="dock"
      open={dockOpen}
      zIndex={85}
      className="max-lg:hidden"
      testId="inspector-dock"
    >
      <DrawerHead
        eyebrow="Inspector"
        title={sectionTitle}
        icon={
          loadedSection ? (
            <SectionTypeIcon
              typeKey={loadedSection.sectionTypeKey}
              size={15}
            />
          ) : undefined
        }
        saveChip={
          loadedSection ? (
            <PanelSaveChip dirty={dirty} saving={saving} error={saveError} />
          ) : undefined
        }
        onClose={
          selectedSectionId ? () => setSelectedSectionId(null) : undefined
        }
      />

      {!selectedSectionId ? (
        <EmptyState />
      ) : loadError ? (
        <div
          className="flex-1 overflow-y-auto px-4 py-6 text-xs"
          style={{ color: CHROME.amber }}
        >
          {loadError}
        </div>
      ) : !loadedSection || !registryEntry ? (
        <div
          className="flex-1 overflow-y-auto px-4 py-6 text-xs"
          style={{ color: CHROME.muted }}
        >
          Loading…
        </div>
      ) : (
        <>
          <div
            style={{ borderBottom: `1px solid ${CHROME.line}`, paddingBottom: 10 }}
          >
            <DrawerTabs>
              {TABS.map((t) => (
                <DrawerTab
                  key={t.key}
                  active={tab === t.key}
                  onClick={() => setTab(t.key)}
                >
                  {t.label}
                </DrawerTab>
              ))}
            </DrawerTabs>
          </div>

          <DrawerBody padding="14px 14px 32px">
            {saveError ? (
              <div
                className="mb-3 rounded-md px-3 py-2 text-[11px]"
                style={{
                  background: CHROME.amberBg,
                  border: `1px solid ${CHROME.amberLine}`,
                  color: CHROME.amber,
                }}
              >
                {saveError}
              </div>
            ) : null}
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
            {tab === "responsive" ? (
              <ResponsivePanel
                presentation={
                  (draftProps?.presentation as
                    | Record<string, unknown>
                    | undefined) ?? {}
                }
                onDeepPatch={handlePresentationDeepPatch}
              />
            ) : null}
            {tab === "motion" ? (
              <MotionPanel
                presentation={
                  (draftProps?.presentation as
                    | Record<string, unknown>
                    | undefined) ?? {}
                }
                onDeepPatch={handlePresentationDeepPatch}
              />
            ) : null}
          </DrawerBody>
        </>
      )}
    </Drawer>
  );
}

function EmptyState() {
  return (
    <div
      className="flex flex-1 flex-col items-center justify-center px-6 text-center"
      style={{ color: CHROME.muted }}
    >
      <div
        className="mb-3 size-10 rounded-full border border-dashed"
        style={{ borderColor: CHROME.lineMid }}
      />
      <p className="text-sm font-medium" style={{ color: CHROME.text2 }}>
        Select a section
      </p>
      <p className="mt-1 max-w-[220px] text-xs" style={{ color: CHROME.muted }}>
        Click any section on the page to edit its content, layout, and styling
        here.
      </p>
    </div>
  );
}
