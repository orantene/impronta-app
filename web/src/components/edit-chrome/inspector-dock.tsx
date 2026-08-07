"use client";
import { improntaLog } from "@/lib/server/structured-log";

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

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";

import {
  loadSectionForEditAction,
  saveSectionDraftAction,
} from "@/lib/site-admin/edit-mode/section-actions";
import { SECTION_EDITOR_REGISTRY } from "@/lib/site-admin/sections/registry-editors";
import type { EditDevice, LoadedSection } from "./edit-context";
import { useEditContext } from "./edit-context";
import {
  baseBreakpointId,
  breakpointLabelForDevice,
  isBaseBreakpoint,
} from "./breakpoint-registry";
import { useBuilderTree } from "./builder-tree-bridge";
import {
  useSelectedSectionId,
  useSelectedBuilderNodeId,
  useAdditionalSelectedBuilderNodeIds,
} from "./selection-bridge";
import { useInspectorRailCoupling } from "./use-inspector-rail-coupling";
import { useDirty } from "./dirty-bridge";
import { useDraftProps } from "./draft-props-bridge";
import { ContentTab } from "./inspectors/content-dispatch";
import {
  findBuilderNodeById,
  resolveStandaloneBuilderNodeForContent,
} from "./inspectors/builder-node-content-utils";
import { SiteHeaderInspector } from "./inspectors/site-header/SiteHeaderInspector";
import { isLegacySiteHeaderSelection } from "@/lib/site-admin/site-header/selection-id";
// ---------------------------------------------------------------------------
// Wave 3 (3.6) — heavy inspector panels are lazy-loaded via next/dynamic (the
// edit-shell drawer pattern) so their JS chunks are deferred until the
// operator first opens the matching tab, instead of being parsed eagerly at
// editor boot (style-panel alone is ~6k lines; the set is ~14k + transitive
// imports). Tabs mount on demand, so `loading: () => null` shows at most one
// empty frame on the FIRST open of a tab; after that the chunk is cached.
// ---------------------------------------------------------------------------
import dynamic from "next/dynamic";

const LayoutPanel = dynamic(
  () =>
    import("./inspectors/layout-panel").then((m) => ({
      default: m.LayoutPanel,
    })),
  { ssr: false, loading: () => null },
);
const StylePanel = dynamic(
  () =>
    import("./inspectors/style-panel").then((m) => ({ default: m.StylePanel })),
  { ssr: false, loading: () => null },
);
const MultiSelectionStylePanel = dynamic(
  () =>
    import("./inspectors/multi-selection-style-panel").then((m) => ({
      default: m.MultiSelectionStylePanel,
    })),
  { ssr: false, loading: () => null },
);
const DataPanel = dynamic(
  () =>
    import("./inspectors/data-panel").then((m) => ({ default: m.DataPanel })),
  { ssr: false, loading: () => null },
);
const MotionPanel = dynamic(
  () =>
    import("./inspectors/motion-panel").then((m) => ({
      default: m.MotionPanel,
    })),
  { ssr: false, loading: () => null },
);
const NodeMotionPanel = dynamic(
  () =>
    import("./inspectors/node-motion-panel").then((m) => ({
      default: m.NodeMotionPanel,
    })),
  { ssr: false, loading: () => null },
);
import { useAdvancedMode } from "./advanced-mode";
import { filterInspectorTabsByAdvanced } from "./advanced-mode-visibility";
import {
  InspectorDraftStatus,
  InspectorViewportRail,
  InspectorSearchProvider,
  InspectorSearchField,
  useInspectorSearch,
} from "./inspectors/kit";
import { countPresentationOverrides, countStyleOverrides } from "./inspectors/responsive-field-state";
import type { ViewportDevice } from "./inspectors/responsive-field-state";
import { SectionA11yWarning } from "./inspectors/SectionA11yWarning";
import { AiTranslateSectionButton } from "./inspectors/AiTranslateSectionButton";
import { SectionAiRewritePanel } from "./inspectors/SectionAiRewritePanel";
import {
  CHROME,
  Drawer,
  DrawerHead,
  DrawerBody,
  INSPECTOR_CHROME_TOP_PX,
  INSPECTOR_PANEL_RIGHT_INSET_PX,
} from "./kit";
import {
  Home,
} from "lucide-react";
import { cleanSectionName as _cleanSectionName } from "@/lib/site-admin/clean-section-name";
import { useEditorLocale } from "./use-editor-locale";
import {
  BUILDER_NODE_REGISTRY,
  builderNodeSupportsFieldBindings,
  builderNodeSupportsDataBinding,
  normalizeBuilderDataBinding,
  type BuilderNode,
} from "@/lib/site-admin/builder-node";
import { isBuilderClientCanvasEnabled } from "@/lib/site-admin/edit-mode/client-canvas-flag";
import { sectionTypeHasLiveData } from "@/lib/site-admin/sections/section-live-data";
import { runMobileHealthCheck } from "@/lib/site-admin/builder-node/mobile-health";

type TabKey = "content" | "layout" | "style" | "data" | "motion";

const TABS: ReadonlyArray<{ key: TabKey; label: string }> = [
  { key: "content", label: "Content" },
  { key: "layout", label: "Layout" },
  { key: "style", label: "Style" },
  { key: "data", label: "Data" },
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
  // Heroes — five-tab surface; responsive controls live in Layout + viewport rail.
  hero: ["content", "style", "layout", "data", "motion"],
  featured_talent: ["content", "style", "layout", "data", "motion"],
  gallery_strip: ["content", "style", "layout", "motion"],
  testimonials_trio: ["content", "style", "layout", "motion"],
  cta_banner: ["content", "style", "layout", "motion"],
  image_copy_alternating: ["content", "style", "layout"],
  trust_strip: ["content", "style", "layout"],
  press_strip: ["content", "style", "layout"],
  values_trio: ["content", "style", "layout"],
  process_steps: ["content", "style", "layout"],
  category_grid: ["content", "style", "layout", "data"],
  destinations_mosaic: ["content", "style", "layout", "data"],
  map_overlay: ["content", "style", "layout", "data"],
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

/** Canvas-first inspector block title — type label, not content-derived copy. */
function inspectorBlockTitle(typeKey: string | null | undefined): string {
  if (!typeKey) return "Section";
  const base = humanizeTypeKey(typeKey);
  if (/\bsection\b/i.test(base)) return base;
  return `${base} Section`;
}

function builderNodeTitle(node: Exclude<BuilderNode, { kind: "section" }>): string {
  const layerLabel = (node.props as { layerLabel?: string }).layerLabel?.trim();
  if (layerLabel) return layerLabel;

  switch (node.kind) {
    case "heading":
      return node.props.text || "Heading";
    case "paragraph":
      return node.props.text.length > 64
        ? `${node.props.text.slice(0, 63).trimEnd()}…`
        : node.props.text || "Paragraph";
    case "button":
      return node.props.label || "Button";
    case "image":
      return node.props.alt?.trim() || "Image";
    case "accordion_item":
    case "tab_panel":
      return node.props.title || BUILDER_NODE_REGISTRY[node.kind].label;
    case "divider":
      return node.props.tone === "muted" ? "Divider · muted" : "Divider";
    case "spacer":
      return `Spacer · ${node.props.size.toUpperCase()}`;
    default:
      return BUILDER_NODE_REGISTRY[node.kind].label;
  }
}

function findBuilderNodePath(
  tree: ReadonlyArray<BuilderNode>,
  nodeId: string | null,
): ReadonlyArray<BuilderNode> {
  if (!nodeId) return [];
  const walk = (
    nodes: ReadonlyArray<BuilderNode>,
    trail: BuilderNode[],
  ): ReadonlyArray<BuilderNode> => {
    for (const node of nodes) {
      const nextTrail = [...trail, node];
      if (node.id === nodeId) return nextTrail;
      if ("children" in node && Array.isArray(node.children)) {
        const nested = walk(node.children, nextTrail);
        if (nested.length > 0) return nested;
      }
    }
    return [];
  };
  return walk(tree, []);
}

type InspectorBreadcrumbCrumb =
  | {
      id: "page";
      label: string;
      selectable: false;
    }
  | {
      id: string;
      label: string;
      selectable: true;
      kind: "section" | "node";
    };

function nodeUsesLayoutInspector(
  node: Exclude<BuilderNode, { kind: "section" }>,
): boolean {
  switch (node.kind) {
    case "container":
    case "split":
    case "accordion":
    case "tabs":
    case "carousel":
    case "masonry":
    case "divider":
    case "spacer":
      return true;
    default:
      return false;
  }
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
    setSelectedSectionId,
    focusSectionForEdit,
    selectBuilderNode,
    loadedSection,
    setLoadedSection,
    setDraftProps,
    setDirty,
    saving,
    setSaving,
    recordFieldEdit,
    syncBuilderNodeChildrenForSection,
    patchBuilderNodeProps,
    patchSelectedBuilderNodesStyle,
    reportMutationError,
    slots,
    canEditSiteShell,
    surfaceKind,
    queueRouterRefresh,
    device,
    setDevice,
    inspectorDockOpen,
    setInspectorDockOpen,
    setInspectorActiveTab,
    inspectorTabRequest,
  } = useEditContext();
  // WAVE 4.6 — the dock header prints builder-REGISTRY node-kind labels
  // ("Container", "CTA group"…) and composes them into "<kind> block" /
  // "<kind> section". Those come from `lib/site-admin/builder-node/registry.ts`,
  // which cannot import edit-chrome, so they are translated HERE at the render
  // boundary, the same seam wave 4.4 used for the inspector kit props.
  const { t } = useEditorLocale();
  // WS2 — tree VALUE from the micro-store (builder-tree-bridge).
  const builderTree = useBuilderTree();
  // W2 (selection-bridge) — selection VALUES from the micro-store. The dock
  // re-renders on selection change via these subscriptions (it loads the
  // selected section + drives the inspector tabs), which is exactly correct.
  const selectedSectionId = useSelectedSectionId();
  const selectedBuilderNodeId = useSelectedBuilderNodeId();
  // INS-2 — the secondary multi-select set (shift-click). When non-empty the
  // Style tab swaps to the Mixed-aware MultiSelectionStylePanel.
  const additionalSelectedBuilderNodeIds = useAdditionalSelectedBuilderNodeIds();
  // W2-T4 — `dirty` VALUE from the dirty-bridge (setter stays on context).
  const dirty = useDirty();
  // Wave 3 (3.1) — `draftProps` VALUE from the draft-props-bridge (setter
  // stays on context). The dock re-renders per working-copy write (it renders
  // the inspector inputs + drives autosave), which is exactly correct — the
  // other ~70 useEditContext() consumers no longer do.
  const draftProps = useDraftProps();

  const selectedStandaloneBuilderNode = useMemo(
    () =>
      resolveStandaloneBuilderNodeForContent(
        builderTree,
        selectedBuilderNodeId,
      ),
    [builderTree, selectedBuilderNodeId],
  );
  const selectedBuilderNode = useMemo(
    () => findBuilderNodeById(builderTree, selectedBuilderNodeId),
    [builderTree, selectedBuilderNodeId],
  );
  const selectedBuilderNodePath = useMemo(
    () => findBuilderNodePath(builderTree, selectedBuilderNodeId),
    [builderTree, selectedBuilderNodeId],
  );
  /** P7A-2 — one paint before context clears a removed id; never feed ContentTab a ghost node. */
  const selectionTreeMismatch = Boolean(
    selectedBuilderNodeId && selectedBuilderNode == null,
  );

  // INS-2 — the full multi-selection (primary + shift-click set), as live node
  // objects pulled from the tree. >1 ⇒ the Style tab renders the Mixed panel.
  const multiSelectedNodes = useMemo(() => {
    const ids: string[] = [];
    if (selectedBuilderNodeId) ids.push(selectedBuilderNodeId);
    for (const id of additionalSelectedBuilderNodeIds) {
      if (id !== selectedBuilderNodeId) ids.push(id);
    }
    if (ids.length < 2) return [];
    const seen = new Set<string>();
    const nodes: BuilderNode[] = [];
    for (const id of ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      const node = findBuilderNodeById(builderTree, id);
      if (node) nodes.push(node);
    }
    return nodes.length >= 2 ? nodes : [];
  }, [selectedBuilderNodeId, additionalSelectedBuilderNodeIds, builderTree]);
  const isMultiNodeSelection = multiSelectedNodes.length >= 2;
  const currentLoadedSection =
    loadedSection?.id === selectedSectionId ? loadedSection : null;
  const currentDraftProps = currentLoadedSection ? draftProps : null;

  const selectedDataTargetNode = useMemo<BuilderNode | null>(() => {
    if (selectedStandaloneBuilderNode) return selectedStandaloneBuilderNode;
    if (selectedBuilderNodeId) return null;
    if (!currentLoadedSection || !currentDraftProps) return null;
    return {
      id: currentLoadedSection.id,
      kind: "section",
      props: {
        sectionId: currentLoadedSection.id,
        sectionTypeKey: currentLoadedSection.sectionTypeKey,
        label: cleanSectionName(currentLoadedSection.name),
        dataBinding: normalizeBuilderDataBinding(
          (currentDraftProps as Record<string, unknown>).dataBinding,
        ) ?? undefined,
      },
      children: [],
    };
  }, [
    currentDraftProps,
    currentLoadedSection,
    selectedBuilderNodeId,
    selectedStandaloneBuilderNode,
  ]);

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

  const { query: searchQuery, setQuery: setSearchQuery, clear: clearSearch } = useInspectorSearch();

  // Clear search when the selected block changes so results don't ghost across selections.
  const prevSelectionKey = useRef<string | null>(null);
  useEffect(() => {
    const key = selectedBuilderNodeId ?? selectedSectionId ?? null;
    if (key !== prevSelectionKey.current) {
      prevSelectionKey.current = key;
      clearSearch();
    }
  }, [selectedBuilderNodeId, selectedSectionId, clearSearch]);

  const [tab, setTab] = useState<TabKey>("content");
  useEffect(() => {
    if (!inspectorTabRequest) return;
    const nextTab =
      inspectorTabRequest.tab === "responsive"
        ? "layout"
        : inspectorTabRequest.tab;
    setTab(nextTab);
  }, [inspectorTabRequest]);
  useEffect(() => {
    setInspectorActiveTab(tab);
  }, [tab, setInspectorActiveTab]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // ---- early-branch for the synthetic site-header selection -----------------
  // The header isn't a real cms_page_sections row — it's a synthesized
  // selection target that maps to <SiteHeaderInspector>. Skip the
  // standard load + tab dispatch when this id is selected.
  //
  // WS-A A2 — this synthetic selection is a LEGACY slot-path construct:
  // `PublishedShell` emits `SITE_HEADER_SELECTION_ID` as the header slot's
  // `data-section-id` so the homepage/slot editor routes header clicks to the
  // form-based <SiteHeaderInspector>. On the fully-freeform `site_shell` SURFACE
  // (A1/A2) the header/footer are plain freeform section nodes — the synthetic
  // id is never produced there, and any header/footer node must stay SELECTABLE
  // and route through the normal node/section inspector. So we gate the special-
  // case on the shell surface NOT being active: on every legacy path
  // (surfaceKind !== "site_shell", incl. the homepage with the flag off) the
  // behavior is byte-identical; on the shell surface it goes inert.
  const isSiteShellSurface = surfaceKind === "site_shell";
  const isSiteHeaderSelected = isLegacySiteHeaderSelection({
    selectedSectionId,
    surfaceKind,
  });

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
      void improntaLog("edit_chrome_inspector_dock.info", {
        message: "[t2-inspector-load]",
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: reload on section change only; isSiteHeaderSelected/setters/server actions are stable refs
  }, [selectedSectionId]);

  // ---- autosave loop ------------------------------------------------------
  const latestLoadedRef = useRef<LoadedSection | null>(loadedSection);
  useEffect(() => {
    latestLoadedRef.current = loadedSection;
  }, [loadedSection]);

  // 2026-04-30 — Router + transition for post-save canvas refresh.
  //
  // Why: section content (e.g. CTA Banner variant, Hero layout) is rendered
  // SERVER-SIDE from the saved DB row. When the operator clicks "Split"
  // and we save successfully, the inspector chip's local state flips to
  // active, but the canvas keeps showing the previous layout because no
  // one ever told the React tree to re-fetch. `router.refresh()` triggers
  // a server re-render through the existing `revalidateTag` boundaries
  // that `upsertSection` already busted on save — so the canvas
  // structurally updates within ~150ms of the save landing.
  const [, startRefreshTransition] = useTransition();

  useEffect(() => {
    if (!dirty) return;
    if (!loadedSection || !draftProps) return;
    if (loadedSection.id !== selectedSectionId) return;

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
        syncBuilderNodeChildrenForSection({
          sectionId: loaded.id,
          sectionTypeKey: loaded.sectionTypeKey,
          props: snapshot,
        });
        // Pure-render curated sections already repaint on the client canvas
        // after syncBuilderNodeChildrenForSection; skip the server round-trip
        // unless the section type loads live data (roster/catalog islands).
        if (
          !isBuilderClientCanvasEnabled() ||
          sectionTypeHasLiveData(loaded.sectionTypeKey)
        ) {
          startRefreshTransition(() => {
            void queueRouterRefresh();
          });
        }
        return;
      }
      if (result.code === "VERSION_CONFLICT") {
        // Refetch authoritative row, discard tail. Leave the notice up
        // for ~3.5s after the refresh lands so the operator sees what
        // happened — silently overwriting their working copy is the
        // single biggest "did the editor eat my work?" trust break.
        setSaveError("Section was edited elsewhere. Your view has been refreshed with the latest version.");
        const fresh = await loadSectionForEditAction(loaded.id);
        if (fresh.ok) {
          setLoadedSection(fresh.section);
          setDraftProps({ ...fresh.section.props });
          setDirty(false);
          window.setTimeout(() => {
            // Only clear if no new error has arrived in the meantime.
            setSaveError((cur) =>
              cur ===
              "Section was edited elsewhere. Your view has been refreshed with the latest version."
                ? null
                : cur,
            );
          }, 3500);
        }
        return;
      }
      setSaveError(result.error);
    }, 120);
    // 120ms (was 450ms). Discrete clicks (variant chips, alignment
    // toggles, layout selectors) need to feel instant; the operator
    // is clicking around to compare designs and a half-second
    // pre-save delay reads as broken. Text-burst typing still
    // coalesces because each keystroke restarts the timer — natural
    // word-boundary pauses are ≥120ms.

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: autosave fires on content changes only; saveSectionDraftAction is a stable server action; loadedSection read via latestLoadedRef to avoid stale snapshot issue
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

  const sectionPresentation = useMemo(
    () =>
      (currentDraftProps?.presentation as Record<string, unknown> | undefined) ??
      {},
    [currentDraftProps],
  );

  const viewportDevice = device as ViewportDevice;
  const isBaseViewport = isBaseBreakpoint(viewportDevice);
  const baseViewportLabel = breakpointLabelForDevice(baseBreakpointId());
  const viewportDeviceLabel = breakpointLabelForDevice(viewportDevice);

  // INS-2 — the responsive bucket the Mixed panel bulk-edits: base viewport →
  // null (top-level style), the two built-in override tiers → their bucket. Any
  // other tier (custom / wide / compact) falls back to base so a bulk edit never
  // writes into an unknown responsive key.
  const multiSelectionBucket: "tablet" | "mobile" | null = isBaseViewport
    ? null
    : viewportDevice === "tablet"
      ? "tablet"
      : viewportDevice === "mobile"
        ? "mobile"
        : null;

  // The rail emits a registry-driven tier id (string); the canvas device state
  // (EditDevice) is the same registry tier set, so we narrow at this one seam.
  const handleViewportDeviceChange = useCallback(
    (next: ViewportDevice) => {
      setDevice(next as EditDevice);
    },
    [setDevice],
  );

  const hideOnDevice = useMemo(() => {
    if (isBaseViewport) return false;
    if (selectedStandaloneBuilderNode) {
      const style = (selectedStandaloneBuilderNode.props as { style?: { responsive?: Record<string, Record<string, unknown>> } }).style;
      return style?.responsive?.[viewportDevice]?.visibility === "hidden";
    }
    const bp = sectionPresentation.breakpoints as
      | Record<string, Record<string, unknown>>
      | undefined;
    return bp?.[viewportDevice]?.visibility === "hidden";
  }, [sectionPresentation, selectedStandaloneBuilderNode, viewportDevice, isBaseViewport]);

  const viewportOverrideCount = useMemo(() => {
    if (isBaseViewport) return 0;
    if (selectedStandaloneBuilderNode) {
      const style = (selectedStandaloneBuilderNode.props as { style?: import("@/lib/site-admin/builder-node").BuilderNodeStyle }).style;
      return countStyleOverrides(style, viewportDevice);
    }
    return countPresentationOverrides(sectionPresentation, viewportDevice);
  }, [sectionPresentation, selectedStandaloneBuilderNode, viewportDevice, isBaseViewport]);

  // RESP-2 — advisory mobile-health issue count. Feeds the badge on the Mobile
  // toggle in InspectorViewportRail. Pure check over the full tree; zero cost when
  // the tree is empty (no section is open). Reuses the shared checker from
  // mobile-health.ts (same pure function the publish drawer and MobileEditPanel use).
  const mobileHealthCount = useMemo(
    () => runMobileHealthCheck(builderTree).length,
    [builderTree],
  );

  const handleViewportHideChange = useCallback(
    (hidden: boolean) => {
      if (isBaseViewport) return;
      if (selectedStandaloneBuilderNode) {
        void patchBuilderNodeProps(selectedStandaloneBuilderNode.id, {
          style: {
            responsive: {
              [viewportDevice]: { visibility: hidden ? "hidden" : undefined },
            },
          },
        });
        return;
      }
      if (!currentLoadedSection) return;
      handlePresentationDeepPatch({
        breakpoints: {
          [viewportDevice]: {
            visibility: hidden ? "hidden" : undefined,
          },
        },
      });
    },
    [
      currentLoadedSection,
      handlePresentationDeepPatch,
      patchBuilderNodeProps,
      selectedStandaloneBuilderNode,
      viewportDevice,
      isBaseViewport,
    ],
  );

  const handleResetViewportOverrides = useCallback(() => {
    if (isBaseViewport) return;
    if (selectedStandaloneBuilderNode) {
      const style = (selectedStandaloneBuilderNode.props as { style?: { responsive?: Record<string, Record<string, unknown>> } }).style;
      const bucket = style?.responsive?.[viewportDevice];
      if (!bucket) return;
      void patchBuilderNodeProps(selectedStandaloneBuilderNode.id, {
        style: {
          responsive: {
            [viewportDevice]: Object.fromEntries(
              Object.keys(bucket).map((key) => [key, undefined]),
            ),
          },
        },
      });
      return;
    }
    if (!currentLoadedSection) return;
    const bp = sectionPresentation.breakpoints as
      | Record<string, Record<string, unknown>>
      | undefined;
    const bucket = bp?.[viewportDevice];
    if (!bucket) return;
    const cleared = Object.fromEntries(
      Object.keys(bucket).map((key) => [key, undefined]),
    );
    handlePresentationDeepPatch({
      breakpoints: {
        [viewportDevice]: cleared,
      },
    });
  }, [
    currentLoadedSection,
    handlePresentationDeepPatch,
    patchBuilderNodeProps,
    sectionPresentation,
    selectedStandaloneBuilderNode,
    viewportDevice,
    isBaseViewport,
  ]);

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
  const registryEntry = currentLoadedSection
    ? (SECTION_EDITOR_REGISTRY[currentLoadedSection.sectionTypeKey] ?? null)
    : null;
  // The legacy plan lock ("Site shell editing is locked on Free") gates the
  // homepage/slot editor when the operator's plan can't edit the shell. On the
  // dedicated `site_shell` SURFACE (A2) access is governed by the routing flag +
  // RLS, not this plan capability, and the header/footer are first-class
  // freeform nodes — so the lock goes inert there. Every legacy path is
  // unchanged (isSiteShellSurface is always false when the routing flag is off).
  const shellSectionLocked =
    !isSiteShellSurface &&
    !canEditSiteShell &&
    (isSiteHeaderSelected ||
      currentLoadedSection?.sectionTypeKey === "site_header" ||
      currentLoadedSection?.sectionTypeKey === "site_footer");

  /** P3-LOCK — the selected standalone builder node has the lock flag set. */
  const selectedStandaloneBuilderNodeIsLocked =
    selectedStandaloneBuilderNode?.locked === true;

  /** WS-C per-prop locks — dot-path props the platform admin froze on this node.
   *  The fields stay visible+editable-looking, but `commitPatch` (and the server
   *  chokepoint) reject changes; this banner explains why. */
  const selectedStandaloneBuilderNodeLockedProps = Array.isArray(
    selectedStandaloneBuilderNode?.lockedProps,
  )
    ? selectedStandaloneBuilderNode!.lockedProps!.filter(
        (k): k is string => typeof k === "string" && k.length > 0,
      )
    : [];

  // Visibility is operator-controlled (persisted). Content still reflects the
  // current canvas selection — closing the dock no longer clears selection.
  const dockOpen = inspectorDockOpen;

  // T2-1 — Use the skeleton hint (name + type known from slots) when the
  // field-draft fetch hasn't resolved yet. Falls back to "Inspector" only
  // when nothing is selected (genuine empty state).
  //
  // QA-2 follow-on — inspector dock title now uses the same content-
  // derived resolver as navigator + chip. Verification on prod caught the
  // dock still rendering "Featured professionals — new" while the chip
  // and navigator already showed "A short list, always on call." Three
  // surfaces, one rule.
  const sectionTypeKey =
    currentLoadedSection?.sectionTypeKey ?? skeletonHint?.typeKey ?? null;
  const sectionTitle = selectedStandaloneBuilderNode
    ? t(builderNodeTitle(selectedStandaloneBuilderNode))
    : sectionTypeKey
      ? t(inspectorBlockTitle(sectionTypeKey))
      : selectedSectionId && loadingId
        ? t("Loading…")
        : t("Select a block");
  // W2-C5: a single small kind label under the header. The block/section
  // NAME itself renders once, via DrawerHead's own `title` (sectionTitle
  // below); this line only says what KIND of block it is, so the header
  // never repeats "Carousel" three times.
  const sectionMeta = isSiteHeaderSelected
    ? t("Site header")
    : selectedStandaloneBuilderNode
      ? t("{label} block").replace(
          "{label}",
          t(BUILDER_NODE_REGISTRY[selectedStandaloneBuilderNode.kind].label),
        )
      : sectionTypeKey
        ? t("{label} section").replace(
            "{label}",
            t(inspectorBlockTitle(sectionTypeKey)),
          )
        : undefined;
  const inspectorBreadcrumbCrumbs = useMemo<
    ReadonlyArray<InspectorBreadcrumbCrumb>
  >(() => {
    if (!selectedSectionId) return [];
    const crumbs: InspectorBreadcrumbCrumb[] = [{ id: "page", label: t("Home"), selectable: false }];
    // The breadcrumb shows section TYPE (e.g. "Hero"), not the content-
    // derived display name (which is what `sectionTitle` carries and
    // matches across the navigator + chip + dock title per QA-2).
    //
    // The previous behavior repeated `sectionTitle` here, which made the
    // breadcrumb read like a child H1 was selected — e.g. "Page > A
    // house of curated talent." looked exactly like the breadcrumb for
    // a selected H1 nested block. Showing section type gives the operator
    // a clear visual anchor for "what level of the tree am I in" even
    // when content-derived names collide.
    const rootLabel = isSiteHeaderSelected
      ? t("Site header")
      : sectionTypeKey
        ? t(inspectorBlockTitle(sectionTypeKey))
        : null;
    if (rootLabel) {
      crumbs.push({
        id: selectedSectionId,
        label: rootLabel,
        selectable: true,
        kind: "section",
      });
    }
    if (selectedBuilderNodePath.length > 1 && selectedBuilderNode) {
      for (const node of selectedBuilderNodePath) {
        if (node.kind === "section") continue;
        crumbs.push({
          id: node.id,
          label: t(builderNodeTitle(node)),
          selectable: true,
          kind: "node",
        });
      }
    }
    return crumbs;
  }, [
    isSiteHeaderSelected,
    sectionTypeKey,
    selectedBuilderNode,
    selectedBuilderNodePath,
    selectedSectionId,
    t,
  ]);
  const handleInspectorCrumbSelect = useCallback(
    (crumb: InspectorBreadcrumbCrumb) => {
      if (!crumb.selectable) return;
      if (crumb.kind === "section") {
        focusSectionForEdit(crumb.id);
        return;
      }
      selectBuilderNode(crumb.id);
    },
    [selectBuilderNode, focusSectionForEdit],
  );
  const headerMeta = useMemo(() => {
    if (!sectionMeta && !sectionTitle && inspectorBreadcrumbCrumbs.length === 0) {
      return undefined;
    }
    return (
      <div className="flex min-w-0 flex-col gap-1">
        {/* W2-C5: the block/section NAME (sectionTitle) already renders once
            via DrawerHead's own `title`. This sub-line only adds the kind
            label, so the header never repeats the name a second (or third)
            time. */}
        {sectionMeta ? (
          <span
            className="truncate text-[11px] font-semibold uppercase tracking-[0.06em]"
            style={{ color: CHROME.muted }}
          >
            {sectionMeta}
          </span>
        ) : null}
        {inspectorBreadcrumbCrumbs.length > 0 ? (
          <span
            className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5 text-[11.5px]"
            style={{ color: CHROME.muted }}
          >
            {inspectorBreadcrumbCrumbs.map((crumb, index) => (
              <span key={`${crumb.id}:${index}`} className="inline-flex min-w-0 items-center">
                {index === 0 ? (
                  <Home size={11} strokeWidth={2} className="mr-0.5 shrink-0 opacity-70" aria-hidden />
                ) : null}
                {crumb.selectable ? (
                  <button
                    type="button"
                    onClick={() => handleInspectorCrumbSelect(crumb)}
                    className="min-w-0 max-w-[170px] truncate rounded-[3px] px-0.5 text-left transition"
                    style={{ color: CHROME.muted }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = CHROME.paper;
                      e.currentTarget.style.color = CHROME.ink;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                      e.currentTarget.style.color = CHROME.muted;
                    }}
                    title={crumb.label}
                    aria-label={`Select ${crumb.label}`}
                  >
                    {crumb.label}
                  </button>
                ) : (
                  <span className="truncate px-0.5">{crumb.label}</span>
                )}
                {index < inspectorBreadcrumbCrumbs.length - 1 ? (
                  <span className="px-0.5" style={{ color: CHROME.muted }} aria-hidden>
                    &gt;
                  </span>
                ) : null}
              </span>
            ))}
          </span>
        ) : null}
        {currentLoadedSection ? (
          <InspectorDraftStatus
            dirty={dirty}
            saving={saving}
            error={saveError}
          />
        ) : null}
        {!isBaseViewport ? (
          <span
            className="inline-flex w-fit rounded-md px-2 py-0.5 text-[10.5px] font-semibold"
            style={{
              background: CHROME.blueBg,
              color: CHROME.blue,
              border: `1px solid ${CHROME.blueLine}`,
            }}
            // WS3 — make the per-device scoping explicit (the reported confusion was
            // "I thought elements can be different per size"): they CAN, but style
            // edits here are scoped to the selected device only.
            title={`Style changes here apply to ${viewportDeviceLabel} only. Switch the device above to edit ${baseViewportLabel} or another size.`}
          >
            Editing {viewportDeviceLabel} only
          </span>
        ) : null}
      </div>
    );
  }, [
    currentLoadedSection,
    device,
    dirty,
    handleInspectorCrumbSelect,
    inspectorBreadcrumbCrumbs,
    saveError,
    saving,
    sectionMeta,
    sectionTitle,
  ]);

  // 2026-04-28 — Tab strip is now adaptive per section type. Sections
  // declare which tabs they meaningfully use; the strip only renders
  // those. Sections not listed in TABS_BY_SECTION_TYPE fall back to
  // DEFAULT_TABS (Content + Style + Layout). Falls back to all 5 only
  // while the section row is still loading, so the strip doesn't jump
  // size at hand-off.
  const { advanced } = useAdvancedMode();
  const visibleTabs = useMemo<ReadonlyArray<TabKey>>(() => {
    let resolved: TabKey[];
    if (selectedStandaloneBuilderNode) {
      const tabs: TabKey[] = ["content", "style"];
      if (nodeUsesLayoutInspector(selectedStandaloneBuilderNode)) {
        tabs.push("layout");
      }
      if (builderNodeSupportsDataBinding(selectedStandaloneBuilderNode.kind)) {
        tabs.push("data");
      } else if (builderNodeSupportsFieldBindings(selectedStandaloneBuilderNode.kind)) {
        tabs.push("data");
      }
      tabs.push("motion");
      resolved = tabs;
    } else {
      const allowed = currentLoadedSection
        ? tabsForSection(currentLoadedSection.sectionTypeKey)
        : skeletonHint
          ? tabsForSection(skeletonHint.typeKey)
          : DEFAULT_TABS;
      const set = new Set(allowed);
      // Preserve the canonical TABS order.
      resolved = TABS.filter((t) => set.has(t.key)).map((t) => t.key);
    }
    // W2-C4 — Advanced OFF hides Data + Motion tabs (data model untouched; the
    // fallback effect below resets an orphaned active tab to Content).
    return filterInspectorTabsByAdvanced(resolved, advanced);
  }, [currentLoadedSection, selectedStandaloneBuilderNode, skeletonHint, advanced]);

  // Vertical icon-rail items removed — tab strip lives on InspectorCommandRail.

  // If the active tab disappears for the new section type (e.g. operator
  // had Motion open for Hero, then selects Trust Strip which doesn't
  // surface Motion), fall back to Content so we never render an
  // orphaned-but-active tab.
  //
  // Same adjustment when moving from a nested builder node (extra tabs like
  // Data) back to the section root: root `selectedBuilderNodeId` is still
  // truthy while `selectedStandaloneBuilderNode` is null, but `visibleTabs`
  // shrinks — do not skip correction for that case (P7A-2 honest inspector).
  useEffect(() => {
    if (!visibleTabs.includes(tab)) {
      setTab("content");
    }
  }, [selectedBuilderNodeId, selectedStandaloneBuilderNode, visibleTabs, tab]);

  const { dragOptions, inspectorRailDocked } =
    useInspectorRailCoupling("inspector");

  return (
    <>
      {!dockOpen ? null : (
    <Drawer
      kind="dock"
      open={dockOpen}
      zIndex={85}
      testId="inspector-dock"
      ariaLabelledBy="inspector-drawer-title"
      topPx={INSPECTOR_CHROME_TOP_PX}
      floating
      floatPanelId="inspector"
      floatSideInsetPx={INSPECTOR_PANEL_RIGHT_INSET_PX}
      floatingDragOptions={dragOptions}
      dockedToRail={inspectorRailDocked}
      compactBottomSheetBelowLg
    >
      <DrawerHead
        titleId="inspector-drawer-title"
        title={sectionTitle}
        meta={headerMeta}
        metaWrap
        metaIndent={false}
        toolsVariant="minimal"
        onClose={() => setInspectorDockOpen(false)}
        closeAriaLabel="Close panel"
        dockedToRail={inspectorRailDocked}
      />

      {!selectedSectionId && !selectedStandaloneBuilderNode ? (
        <EmptyState />
      ) : shellSectionLocked ? (
        <ShellLockedState />
      ) : selectedStandaloneBuilderNodeIsLocked ? (
        <NodeLockedState
          nodeId={selectedStandaloneBuilderNode!.id}
          nodeLabel={builderNodeTitle(selectedStandaloneBuilderNode!)}
          onUnlock={async () => {
            if (!selectedStandaloneBuilderNode) return;
            const result = await patchBuilderNodeProps(
              selectedStandaloneBuilderNode.id,
              { locked: undefined },
            );
            if (!result.ok && result.error) reportMutationError(result.error);
          }}
        />
      ) : isSiteHeaderSelected ? (
        <SiteHeaderInspector tenantId={tenantId} />
      ) : loadError ? (
        <div
          className="flex-1 overflow-y-auto px-4 py-6 text-xs"
          style={{ color: CHROME.amber }}
          role="alert"
          aria-live="assertive"
          aria-atomic="true"
        >
          {loadError}
        </div>
      ) : selectionTreeMismatch ? (
        <InspectorSkeleton />
      ) : !selectedStandaloneBuilderNode && (!currentLoadedSection || !registryEntry) ? (
        <InspectorSkeleton />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <DrawerBody
            padding="18px 20px 36px"
            className="min-h-0 min-w-0 flex-1 overflow-x-hidden"
          >
            <InspectorSearchField
              value={searchQuery}
              onChange={setSearchQuery}
            />
            {saveError ? (
              <div
                role="status"
                aria-live="polite"
                aria-atomic="true"
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
            {/* INS-1 — the Style / Layout / Data tabs now self-badge their own
                locked fields with a scoped LockedFieldsBanner, so this dock-level
                prose banner is demoted to the Content tab (which has no per-tab
                banner of its own). Avoids a duplicate banner on the other tabs. */}
            {tab === "content" &&
            selectedStandaloneBuilderNode &&
            selectedStandaloneBuilderNodeLockedProps.length > 0 ? (
              <div
                role="note"
                className="mb-3 rounded-lg px-3 py-2.5 text-[11.5px] leading-snug"
                style={{
                  background: "rgba(93,211,160,0.08)",
                  border: "1px solid rgba(93,211,160,0.28)",
                  color: CHROME.ink,
                }}
              >
                <span style={{ fontWeight: 600 }}>🔒 Locked by the platform admin</span>
                <span style={{ display: "block", marginTop: 2, opacity: 0.85 }}>
                  These props keep this component on-brand and can&apos;t be changed here:{" "}
                  <span style={{ fontFamily: "var(--font-mono, monospace)" }}>
                    {selectedStandaloneBuilderNodeLockedProps.join(", ")}
                  </span>
                  . You can still edit everything else.
                </span>
              </div>
            ) : null}
            <InspectorSearchProvider query={searchQuery}>
            {(currentLoadedSection || selectedStandaloneBuilderNode) ? (
              <InspectorViewportRail
                device={viewportDevice}
                onDeviceChange={handleViewportDeviceChange}
                hideOnDevice={hideOnDevice}
                onHideChange={handleViewportHideChange}
                overrideCount={viewportOverrideCount}
                onResetOverrides={
                  viewportOverrideCount > 0 ? handleResetViewportOverrides : undefined
                }
                mobileHealthCount={mobileHealthCount}
              />
            ) : null}
            {tab === "content" ? (
              <>
                <SectionA11yWarning
                  sectionTypeKey={currentLoadedSection?.sectionTypeKey ?? "custom"}
                  draftProps={currentDraftProps}
                />
                <ContentTab
                  sectionTypeKey={currentLoadedSection?.sectionTypeKey ?? "custom"}
                  schemaVersion={currentLoadedSection?.schemaVersion ?? 1}
                  tenantId={tenantId}
                  draftProps={currentDraftProps ?? {}}
                  selectedBuilderNodeId={selectedBuilderNodeId}
                  onChange={handleContentChange}
                />
                {/* WS4-TASK2: AI rewrite — per-field rewrite at the foot of Content */}
                {currentLoadedSection && currentDraftProps ? (
                  <SectionAiRewritePanel
                    sectionTypeKey={currentLoadedSection.sectionTypeKey}
                    draftProps={currentDraftProps}
                    onPatch={(patch) => {
                      setDraftProps((prev) => {
                        if (!prev) return prev;
                        return { ...prev, ...patch };
                      });
                      setDirty(true);
                    }}
                  />
                ) : null}

                {/* AI translate — secondary tool at the foot of Content */}
                {currentLoadedSection && currentDraftProps ? (
                  <div className="mt-4 flex justify-end border-t pt-3" style={{ borderColor: CHROME.line }}>
                    <AiTranslateSectionButton
                      sectionTypeKey={currentLoadedSection.sectionTypeKey}
                      currentProps={currentDraftProps}
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
                  (currentDraftProps?.presentation as
                    | Record<string, unknown>
                    | undefined) ?? {}
                }
                onPatch={handlePresentationPatch}
                onDeepPatch={handlePresentationDeepPatch}
                sectionTypeKey={currentLoadedSection?.sectionTypeKey}
                sectionDraftProps={currentDraftProps ?? undefined}
                onSectionPatch={handleStylePatch}
              />
            ) : null}
            {tab === "style" ? (
              isMultiNodeSelection ? (
                // INS-2 — Mixed-aware bulk styling for a multi-node selection.
                // Fans every edit out to all selected nodes through the shared
                // chokepoint (per-node INS-1 locks honored there).
                <MultiSelectionStylePanel
                  nodes={multiSelectedNodes}
                  bucket={multiSelectionBucket}
                  disabled={saving}
                  onBulkStylePatch={(stylePatchJson, bucket) => {
                    void patchSelectedBuilderNodesStyle(
                      stylePatchJson,
                      bucket,
                    ).then((result) => {
                      if (!result.ok && result.error) {
                        reportMutationError(result.error);
                      }
                    });
                  }}
                />
              ) : (
                <StylePanel
                  sectionTypeKey={currentLoadedSection?.sectionTypeKey ?? "custom"}
                  draftProps={currentDraftProps ?? {}}
                  selectedBuilderNodeId={selectedBuilderNodeId}
                  onPatch={handleStylePatch}
                />
              )
            ) : null}
            {tab === "data" ? (
              <DataPanel
                selectedBuilderNode={selectedDataTargetNode}
                onPatchBuilderNodeProps={async (nodeId, patch) => {
                  if (currentLoadedSection && nodeId === currentLoadedSection.id) {
                    setDraftProps((prev) => {
                      if (!prev) return prev;
                      const next: Record<string, unknown> = {
                        ...prev,
                        dataBinding: patch.dataBinding,
                      };
                      if (patch.dataBinding === undefined) {
                        delete next.dataBinding;
                      }
                      return next;
                    });
                    setDirty(true);
                    return { ok: true };
                  }
                  const result = await patchBuilderNodeProps(nodeId, patch);
                  return result;
                }}
                onMutationError={setSaveError}
              />
            ) : null}
            {tab === "motion" ? (
              selectedStandaloneBuilderNode ? (
                <NodeMotionPanel
                  node={selectedStandaloneBuilderNode}
                  onPatchNodeProps={async (nodeId, patch) => {
                    const result = await patchBuilderNodeProps(nodeId, patch);
                    if (!result.ok && result.error) reportMutationError(result.error);
                  }}
                />
              ) : (
                <MotionPanel
                  presentation={
                    (currentDraftProps?.presentation as
                      | Record<string, unknown>
                      | undefined) ?? {}
                  }
                  onDeepPatch={handlePresentationDeepPatch}
                />
              )
            ) : null}
            </InspectorSearchProvider>
          </DrawerBody>
        </div>
      )}
    </Drawer>
      )}
    </>
  );
}

function EmptyState() {
  const { t } = useEditorLocale();
  return (
    <div className="flex min-h-[340px] flex-1 flex-col p-5">
      <div
        className="flex flex-1 flex-col items-center justify-center rounded-2xl px-10 py-14 text-center"
        style={{
          background: `linear-gradient(180deg, ${CHROME.paper} 0%, ${CHROME.paper2} 100%)`,
          border: `1px solid ${CHROME.lineMid}`,
        }}
        role="region"
        aria-labelledby="inspector-empty-title"
        aria-describedby="inspector-empty-desc"
      >
        <div
          className="mb-5 flex size-14 items-center justify-center rounded-2xl border"
          style={{
            borderColor: CHROME.lineMid,
            background: CHROME.surface,
            boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
            color: CHROME.muted,
          }}
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </div>
        <p
          id="inspector-empty-title"
          className="text-[15px] font-semibold tracking-tight"
          style={{ color: CHROME.ink }}
        >
          {t("Nothing selected")}
        </p>
        <p
          id="inspector-empty-desc"
          className="mt-2.5 max-w-[260px] text-[13px] leading-[1.55]"
          style={{ color: CHROME.muted2 }}
        >
          {t(
            "Click a section on the canvas or a row in the left Layers panel. Your draft edits stay private until you publish.",
          )}
        </p>
      </div>
    </div>
  );
}

function ShellLockedState() {
  const { t } = useEditorLocale();
  return (
    <div
      className="flex h-full flex-1 items-center justify-center px-6 text-center"
      style={{ color: CHROME.muted }}
    >
      <div className="max-w-[260px]">
        <p className="text-[13px] font-semibold" style={{ color: CHROME.ink }}>
          {t("Site shell editing is locked on Free")}
        </p>
        <p className="mt-2 text-[12px] leading-5">
          {t(
            "Body sections stay editable. Upgrade to Studio to edit header and footer shell controls.",
          )}
        </p>
      </div>
    </div>
  );
}

/**
 * P3-LOCK — shown when the selected standalone builder node has `locked: true`.
 * Renders a clear locked banner with an "Unlock" affordance that patches
 * `locked: undefined` via the normal mutation path, then re-opens the inspector.
 */
function NodeLockedState({
  nodeId,
  nodeLabel,
  onUnlock,
}: {
  nodeId: string;
  nodeLabel: string;
  onUnlock: () => Promise<void>;
}) {
  const [unlocking, setUnlocking] = useState(false);
  const handleUnlock = async () => {
    setUnlocking(true);
    try {
      await onUnlock();
    } finally {
      setUnlocking(false);
    }
  };
  return (
    <div
      className="flex flex-1 flex-col items-center justify-center gap-0 px-6 text-center"
      style={{ color: CHROME.muted }}
      data-node-id={nodeId}
    >
      <div
        className="mb-4 flex size-12 items-center justify-center rounded-2xl border"
        style={{
          borderColor: CHROME.amberLine,
          background: CHROME.amberBg,
          color: CHROME.amber,
          boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
        }}
      >
        {/* Lock icon SVG (no lucide dep in this file) */}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      </div>
      <p className="text-[13px] font-semibold tracking-tight" style={{ color: CHROME.text2 }}>
        {nodeLabel} is locked
      </p>
      <p className="mt-1.5 max-w-[220px] text-[11.5px] leading-relaxed" style={{ color: CHROME.muted2 }}>
        This block is locked and cannot be moved, resized, or edited. Unlock it to resume editing.
      </p>
      <button
        type="button"
        disabled={unlocking}
        onClick={() => void handleUnlock()}
        className="mt-4 inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[12px] font-semibold transition"
        style={{
          background: CHROME.amberBg,
          border: `1px solid ${CHROME.amberLine}`,
          color: CHROME.amber,
          cursor: unlocking ? "wait" : "pointer",
          opacity: unlocking ? 0.65 : 1,
        }}
        aria-label={`Unlock ${nodeLabel}`}
      >
        {/* Unlock icon SVG */}
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 9.9-1" />
        </svg>
        {unlocking ? "Unlocking…" : "Unlock block"}
      </button>
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
        <div className="grid gap-1.5">
          <div
            className="inspector-skel-bar"
            style={{ width: 92, height: 10 }}
          />
          <div
            className="inspector-skel-bar"
            style={{ width: "100%", height: 32 }}
          />
        </div>
        <div className="grid gap-1.5">
          <div
            className="inspector-skel-bar"
            style={{ width: 70, height: 10 }}
          />
          <div
            className="inspector-skel-bar"
            style={{ width: "100%", height: 64 }}
          />
        </div>
        <div className="grid gap-1.5">
          <div
            className="inspector-skel-bar"
            style={{ width: 60, height: 10 }}
          />
          <div
            className="inspector-skel-bar"
            style={{ width: "100%", height: 32 }}
          />
        </div>
        <div className="grid gap-1.5">
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

