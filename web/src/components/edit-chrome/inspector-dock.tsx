"use client";

/**
 * InspectorDock — right-rail canvas editor panel.
 *
 * Implements builder-experience.html surface §2 (Inspector — five-tab
 * depth). Last reconciled: 2026-04-25.
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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  loadSectionForEditAction,
  saveSectionDraftAction,
} from "@/lib/site-admin/edit-mode/section-actions";
import { SECTION_EDITOR_REGISTRY } from "@/lib/site-admin/sections/registry-editors";
import type { LoadedSection } from "./edit-context";
import { useEditContext } from "./edit-context";
import { ContentTab } from "./inspectors/content-dispatch";
import { SiteHeaderInspector } from "./inspectors/site-header/SiteHeaderInspector";
import { SITE_HEADER_SELECTION_ID } from "@/lib/site-admin/site-header/selection-id";
import { LayoutPanel } from "./inspectors/layout-panel";
import { StylePanel } from "./inspectors/style-panel";
import { ResponsivePanel } from "./inspectors/responsive-panel";
import { MotionPanel } from "./inspectors/motion-panel";
import { PanelSaveChip } from "./inspectors/kit";
import { SectionA11yWarning } from "./inspectors/SectionA11yWarning";
import { AiTranslateSectionButton } from "./inspectors/AiTranslateSectionButton";
import {
  CHROME,
  Drawer,
  DrawerHead,
  DrawerTabs,
  DrawerTab,
  DrawerBody,
  SectionTypeIcon,
} from "./kit";
import { cleanSectionName as _cleanSectionName } from "@/lib/site-admin/clean-section-name";
import { sectionDisplayName } from "@/lib/site-admin/section-display-name";

type TabKey = "content" | "layout" | "style" | "responsive" | "motion";

const TABS: ReadonlyArray<{ key: TabKey; label: string }> = [
  { key: "content", label: "Content" },
  { key: "layout", label: "Layout" },
  { key: "style", label: "Style" },
  { key: "responsive", label: "Responsive" },
  { key: "motion", label: "Motion" },
];

/**
 * Per-section-type tab visibility.
 *
 * The audit (2026-04-28 product-feel sprint) flagged the always-five-tabs
 * inspector as "implies missing controls when most sections don't use
 * Responsive or Motion." This map opts each section into the tabs that
 * are actually meaningful for it. Anything not listed falls back to
 * `DEFAULT_TABS` — Content + Style + Layout — so unfamiliar types get a
 * sensible minimum without surfacing aspirational surfaces (Responsive,
 * Motion) that read as broken when empty.
 *
 * Add a section here if Responsive overrides or Motion entry effects
 * meaningfully add to the operator's vocabulary for that block.
 */
const DEFAULT_TABS: ReadonlyArray<TabKey> = ["content", "style", "layout"];

const TABS_BY_SECTION_TYPE: Record<string, ReadonlyArray<TabKey>> = {
  // Heroes carry headlines / overlays / motion entries — full toolkit.
  hero: ["content", "style", "layout", "responsive", "motion"],
  // Featured Talent grids meaningfully benefit from per-breakpoint counts +
  // entry animation when scrolling into view.
  featured_talent: ["content", "style", "layout", "responsive", "motion"],
  gallery_strip: ["content", "style", "layout", "responsive", "motion"],
  testimonials_trio: ["content", "style", "layout", "motion"],
  // CTA banners are short and benefit from a subtle entry animation.
  cta_banner: ["content", "style", "layout", "motion"],
  // Image+copy alternating layouts use breakpoint flips on small screens.
  image_copy_alternating: ["content", "style", "layout", "responsive"],
  // Static content sections — Content + Style + Layout is the minimum.
  trust_strip: ["content", "style", "layout"],
  press_strip: ["content", "style", "layout"],
  values_trio: ["content", "style", "layout"],
  process_steps: ["content", "style", "layout"],
  category_grid: ["content", "style", "layout", "responsive"],
  destinations_mosaic: ["content", "style", "layout", "responsive"],
  marquee: ["content", "style", "layout", "motion"],
};

function tabsForSection(typeKey: string | null | undefined): ReadonlyArray<TabKey> {
  if (!typeKey) return DEFAULT_TABS;
  return TABS_BY_SECTION_TYPE[typeKey] ?? DEFAULT_TABS;
}

function humanizeTypeKey(key: string | null | undefined): string {
  if (!key) return "Section";
  return key
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Returns null if raw is empty/null, otherwise strips seeder debug suffixes. */
function cleanSectionName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = _cleanSectionName(raw);
  return cleaned || null;
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
    slots,
  } = useEditContext();

  // T2-1 — Look up the selected section's name + type from the composition
  // BEFORE the field-draft fetch resolves. The audit said the skeleton's
  // "Loading…" title made the inspector look broken; we already know which
  // section the operator clicked, so we can render its real name and the
  // type's icon during the load window. Resolves to null when slots aren't
  // ready yet (e.g., legacy callers without the T1-2 prefetch).
  const skeletonHint = useMemo(() => {
    if (!selectedSectionId) return null;
    for (const entries of Object.values(slots)) {
      const found = entries.find((e) => e.sectionId === selectedSectionId);
      if (found) {
        return {
          name: cleanSectionName(found.name) || humanizeTypeKey(found.sectionTypeKey),
          typeKey: found.sectionTypeKey,
        };
      }
    }
    return null;
  }, [selectedSectionId, slots]);

  const [tab, setTab] = useState<TabKey>("content");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // ---- early-branch for the synthetic site-header selection -----------------
  // The header isn't a real cms_page_sections row — it's a synthesized
  // selection target that maps to <SiteHeaderInspector>. Skip the
  // standard load + tab dispatch when this id is selected.
  const isSiteHeaderSelected = selectedSectionId === SITE_HEADER_SELECTION_ID;

  // ---- load section whenever selectedSectionId changes --------------------
  useEffect(() => {
    let cancelled = false;
    if (!selectedSectionId || isSiteHeaderSelected) {
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

    // Sprint 2 — Timing instrumentation. Measures the operator-perceived
    // latency from "section selected" to "inspector body paints with real
    // fields." We log a structured object the QA pass can grep for to
    // capture before/after distributions across many selection events.
    //
    // Phases:
    //   t.click            — selection became `selectedSectionId` (≈ now())
    //   t.actionStart      — server action call kicked off
    //   t.actionEnd        — server action resolved
    //   t.bodyPaint        — setLoadedSection committed; body will paint
    //                        on next render
    //
    // All times are ms since `t.click` (relative deltas, easier to
    // eyeball). The structured prefix `[t2-inspector-load]` is how the
    // QA pass filters.
    const tClick =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    const sid = selectedSectionId;
    const now = () =>
      typeof performance !== "undefined" ? performance.now() : Date.now();

    (async () => {
      const tActionStart = now();
      const result = await loadSectionForEditAction(sid);
      const tActionEnd = now();
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
      const tBodyPaint = now();
      // eslint-disable-next-line no-console
      console.info("[t2-inspector-load]", {
        sectionId: sid,
        sectionTypeKey: result.section.sectionTypeKey,
        actionStartMs: Math.round(tActionStart - tClick),
        actionEndMs: Math.round(tActionEnd - tClick),
        bodyPaintMs: Math.round(tBodyPaint - tClick),
        actionDurationMs: Math.round(tActionEnd - tActionStart),
      });
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
        // Refetch authoritative row, discard tail. Leave the notice up
        // for ~3.5s after the refresh lands so the operator sees what
        // happened — silently overwriting their working copy is the
        // single biggest "did the editor eat my work?" trust break.
        setSaveError("Section was edited elsewhere — your view has been refreshed with the latest version.");
        const fresh = await loadSectionForEditAction(loaded.id);
        if (fresh.ok) {
          setLoadedSection(fresh.section);
          setDraftProps({ ...fresh.section.props });
          setDirty(false);
          window.setTimeout(() => {
            // Only clear if no new error has arrived in the meantime.
            setSaveError((cur) =>
              cur ===
              "Section was edited elsewhere — your view has been refreshed with the latest version."
                ? null
                : cur,
            );
          }, 3500);
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

  // T2-1 — Use the skeleton hint (name + type known from slots) when the
  // field-draft fetch hasn't resolved yet. Falls back to "Inspector" only
  // when nothing is selected (genuine empty state).
  //
  // QA-2 follow-on — inspector dock title now uses the same content-
  // derived resolver as navigator + chip. Verification on prod caught the
  // dock still rendering "Featured professionals — new" while the chip
  // and navigator already showed "A short list, always on call." Three
  // surfaces, one rule.
  const sectionTitle = loadedSection
    ? (sectionDisplayName({
        typeKey: loadedSection.sectionTypeKey,
        rawName: loadedSection.name,
        props: loadedSection.props as Record<string, unknown> | null,
      }) || humanizeTypeKey(loadedSection.sectionTypeKey))
    : skeletonHint
      ? skeletonHint.name
      : selectedSectionId && loadingId
        ? "Loading…"
        : "Inspector";

  // 2026-04-28 — Tab strip is now adaptive per section type. Sections
  // declare which tabs they meaningfully use; the strip only renders
  // those. Sections not listed in TABS_BY_SECTION_TYPE fall back to
  // DEFAULT_TABS (Content + Style + Layout). Falls back to all 5 only
  // while the section row is still loading, so the strip doesn't jump
  // size at hand-off.
  const visibleTabs = useMemo<ReadonlyArray<TabKey>>(() => {
    const allowed = loadedSection
      ? tabsForSection(loadedSection.sectionTypeKey)
      : skeletonHint
        ? tabsForSection(skeletonHint.typeKey)
        : DEFAULT_TABS;
    const set = new Set(allowed);
    // Preserve the canonical TABS order.
    return TABS.filter((t) => set.has(t.key)).map((t) => t.key);
  }, [loadedSection, skeletonHint]);

  // If the active tab disappears for the new section type (e.g. operator
  // had Motion open for Hero, then selects Trust Strip which doesn't
  // surface Motion), fall back to Content so we never render an
  // orphaned-but-active tab.
  useEffect(() => {
    if (!visibleTabs.includes(tab)) {
      setTab("content");
    }
  }, [visibleTabs, tab]);

  return (
    <Drawer
      kind="dock"
      open={dockOpen}
      zIndex={85}
      className="max-lg:hidden"
      testId="inspector-dock"
    >
      <DrawerHead
        title={isSiteHeaderSelected ? "Site header" : sectionTitle}
        meta={
          isSiteHeaderSelected
            ? undefined
            : loadedSection
              ? humanizeTypeKey(loadedSection.sectionTypeKey)
              : skeletonHint
                ? humanizeTypeKey(skeletonHint.typeKey)
                : undefined
        }
        icon={
          isSiteHeaderSelected ? (
            <SiteHeaderHeadIcon />
          ) : loadedSection ? (
            <SectionTypeIcon
              typeKey={loadedSection.sectionTypeKey}
              size={15}
            />
          ) : skeletonHint ? (
            <SectionTypeIcon typeKey={skeletonHint.typeKey} size={15} />
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
      ) : isSiteHeaderSelected ? (
        <SiteHeaderInspector tenantId={tenantId} />
      ) : loadError ? (
        <div
          className="flex-1 overflow-y-auto px-4 py-6 text-xs"
          style={{ color: CHROME.amber }}
        >
          {loadError}
        </div>
      ) : !loadedSection || !registryEntry ? (
        <InspectorSkeleton />
      ) : (
        <>
          {visibleTabs.length > 1 ? (
            <div
              style={{ borderBottom: `1px solid ${CHROME.line}`, paddingBottom: 10 }}
            >
              <DrawerTabs>
                {TABS.filter((t) => visibleTabs.includes(t.key)).map((t) => (
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
          ) : null}

          <DrawerBody padding="14px 14px 32px">
            {saveError ? (
              <div
                className="mb-3 rounded-lg px-3 py-2.5 text-[11.5px]"
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
              <>
                <SectionA11yWarning
                  sectionTypeKey={loadedSection.sectionTypeKey}
                  draftProps={draftProps}
                />
                <ContentTab
                  sectionTypeKey={loadedSection.sectionTypeKey}
                  schemaVersion={loadedSection.schemaVersion}
                  tenantId={tenantId}
                  draftProps={draftProps ?? {}}
                  onChange={handleContentChange}
                />
                {/* AI translate — secondary tool at the foot of Content */}
                {draftProps ? (
                  <div className="mt-4 flex justify-end border-t pt-3" style={{ borderColor: CHROME.line }}>
                    <AiTranslateSectionButton
                      sectionTypeKey={loadedSection.sectionTypeKey}
                      currentProps={draftProps}
                      onApply={(translations) => {
                        setDraftProps((prev) => {
                          if (!prev) return prev;
                          const next = { ...prev };
                          for (const [k, v] of Object.entries(translations)) {
                            next[k] = v;
                          }
                          return next;
                        });
                        setDirty(true);
                      }}
                    />
                  </div>
                ) : null}
              </>
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
      className="flex flex-1 flex-col items-center justify-center gap-0 px-8 text-center"
      style={{ color: CHROME.muted }}
    >
      <div
        className="mb-4 flex size-12 items-center justify-center rounded-2xl border"
        style={{
          borderColor: CHROME.lineMid,
          background: `linear-gradient(180deg, ${CHROME.paper}, ${CHROME.paper2})`,
          boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
          color: CHROME.muted,
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
      </div>
      <p className="text-[13px] font-semibold tracking-tight" style={{ color: CHROME.text2 }}>
        Select a section to edit
      </p>
      <p className="mt-1.5 max-w-[200px] text-[11.5px] leading-relaxed" style={{ color: CHROME.muted2 }}>
        Click any section on the canvas to open its editor here.
      </p>
    </div>
  );
}

/**
 * Loading state shown between selecting a section and the field draft
 * arriving from the server. Mirrors the real inspector layout (tab strip
 * + 4 form rows + a button) so the dock doesn't visibly jump on hand-off.
 * The shimmer is a single CSS-only `@keyframes` block scoped to the
 * skeleton so it doesn't leak.
 *
 * T2-1 polish: softer bar tint and a centered "Loading section…" label
 * with a thin spinner so the operator reads "preparing" rather than
 * "broken UI." The bars still hint at the layout (tabs / inputs /
 * button) so the eventual paint doesn't jump.
 */
function InspectorSkeleton() {
  return (
    <div
      className="flex-1 overflow-hidden"
      role="status"
      aria-live="polite"
      aria-label="Loading section editor"
    >
      <style>{`
        @keyframes inspector-skel-shimmer {
          0%   { opacity: 0.5; }
          50%  { opacity: 0.78; }
          100% { opacity: 0.5; }
        }
        @keyframes inspector-skel-spin {
          to { transform: rotate(360deg); }
        }
        .inspector-skel-bar {
          background: ${CHROME.line};
          border-radius: 6px;
          animation: inspector-skel-shimmer 1.4s ease-in-out infinite;
        }
        .inspector-skel-spinner {
          animation: inspector-skel-spin 0.85s linear infinite;
        }
      `}</style>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "12px 14px 0",
          fontSize: 11,
          fontWeight: 500,
          color: CHROME.muted,
        }}
      >
        <svg
          className="inspector-skel-spinner"
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          aria-hidden
        >
          <path d="M21 12a9 9 0 1 1-6.22-8.56" />
        </svg>
        <span>Loading section…</span>
      </div>
      <div
        style={{
          borderBottom: `1px solid ${CHROME.line}`,
          padding: "10px 14px",
          display: "flex",
          gap: 12,
        }}
      >
        <div className="inspector-skel-bar" style={{ width: 56, height: 14 }} />
        <div className="inspector-skel-bar" style={{ width: 52, height: 14 }} />
        <div className="inspector-skel-bar" style={{ width: 48, height: 14 }} />
      </div>
      <div style={{ padding: "16px 14px", display: "grid", gap: 14 }}>
        <div style={{ display: "grid", gap: 6 }}>
          <div
            className="inspector-skel-bar"
            style={{ width: 92, height: 10 }}
          />
          <div
            className="inspector-skel-bar"
            style={{ width: "100%", height: 32 }}
          />
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          <div
            className="inspector-skel-bar"
            style={{ width: 70, height: 10 }}
          />
          <div
            className="inspector-skel-bar"
            style={{ width: "100%", height: 64 }}
          />
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          <div
            className="inspector-skel-bar"
            style={{ width: 60, height: 10 }}
          />
          <div
            className="inspector-skel-bar"
            style={{ width: "100%", height: 32 }}
          />
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          <div
            className="inspector-skel-bar"
            style={{ width: 80, height: 10 }}
          />
          <div
            className="inspector-skel-bar"
            style={{ width: "60%", height: 32 }}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Small glyph for the site-header head icon — a calm horizontal bar
 * with three dots, signalling "the header lives here". Uses currentColor
 * so it tracks the drawer head's text color without extra wiring.
 */
function SiteHeaderHeadIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="2" y="3.5" width="12" height="4" rx="1" />
      <circle cx="11.5" cy="5.5" r="0.6" fill="currentColor" />
      <circle cx="13" cy="5.5" r="0.6" fill="currentColor" />
      <line x1="2" y1="11" x2="9" y2="11" />
      <line x1="2" y1="13" x2="6" y2="13" />
    </svg>
  );
}
