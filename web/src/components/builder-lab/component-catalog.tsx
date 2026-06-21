"use client";

/**
 * ComponentCatalog (P2 read-only → P3 control-plane).
 *
 * The Builder Lab's inventory of EVERY page-builder component the "+" gallery
 * can offer — built-in code items ∪ published templates — grouped by gallery
 * tab. P3 makes it the control surface: per-surface (Talent-Max / Workspace)
 * visibility toggles + inline label/category overrides, persisted to
 * `builder_catalog_overlay` and reflected in BOTH live builders on next open.
 *
 * Data comes from `loadCatalogAdminView` (the FULL ungated universe + overlay
 * state) so hidden items remain listed and re-enable-able. Mutations go through
 * `setComponentOverlay` / `clearComponentOverlay`, then we reload — the same
 * round-trip the live galleries see.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  type AddGalleryTab,
  type CatalogAdminItem,
} from "@/lib/site-admin/add-gallery";
import {
  resolveTabLabel,
  type CatalogStructureMap,
} from "@/lib/site-admin/add-gallery/catalog-structure";
import { listCatalogStructure } from "@/lib/site-admin/add-gallery/catalog-structure-actions";
import {
  loadCatalogAdminView,
  loadCatalogUsageCounts,
} from "@/lib/site-admin/add-gallery/catalog-admin-view-action";
import { listAllTemplates } from "@/lib/site-admin/builder-core/templates/registry-admin-actions";
import { getTemplateUsageTotals } from "@/lib/site-admin/builder-core/templates/template-usage-actions";
import type { TemplateUsageTotals } from "@/lib/site-admin/builder-core/templates/template-usage-shape";
import type { BuilderTemplateRow } from "@/lib/site-admin/builder-core/templates/registry-rows";
import { SiteDefaultsEditor } from "./site-defaults-editor";
import { DefaultSurfacesPanel } from "./default-surfaces-panel";
import { CatalogStudioView } from "./catalog-studio";
import {
  type CatalogEditFormBundle,
} from "./catalog-row-table";
import {
  type EditFormMap,
  type EditFormState,
  allExpanded,
  collapseAll,
  editFormFromItem,
  emptyEditForm,
  expandAll,
  expandedCount,
} from "./catalog-edit-accordion";
import { PlaygroundView } from "./catalog-playground";
import { SiteStarterKitView } from "./catalog-starter-kit";
import { CatalogActivityFeed } from "./catalog-activity-feed";
import { TemplateManager } from "./template-manager";
import { ParityProbePanel } from "./parity-probe-panel";
import { TaxonomyManagerPanel } from "./taxonomy-manager-panel";
import { CatalogAllIndexTable } from "./catalog-all-index-table";
import { CatalogHealthPanel } from "./catalog-health-panel";
import { analyzeCatalogHealth } from "./catalog-health";
import type { BuilderLabTarget } from "./builder-lab-stage";
import {
  type CatalogItemPreview,
} from "./component-preview-stage";
import {
  LAB as T,
  type LabToastAction,
} from "./ui";
import {
  type FilterPreset,
  type FilterState,
  labelToKey,
  loadActivePresetKey,
  loadCustomPresets,
  mergePresets,
  presetToState,
  saveActivePresetKey,
  saveCustomPresets,
  snapshotToPreset,
} from "./catalog-filter-presets";
import { LabCommandPalette, isPaletteChord } from "./command-palette";
import {
  type CatalogGroup,
  type CatalogView,
  SPECIAL_TABS,
  VIEW_LABEL,
  firstViewOfGroup,
  groupOfView,
  isSpecialTab,
  orderedViewsForGroup,
} from "./catalog-nav";
import {
  loadLastViewPerGroup,
  parseViewParam,
  resolveInitialView,
  saveLastViewForGroup,
} from "./catalog-nav-state";
import { CatalogNav } from "./catalog-nav-bar";
import { CatalogGalleryView } from "./catalog-gallery-view";
import { useCatalogActions } from "./catalog-actions";
import { buildPaletteJumps } from "./catalog-palette-jumps";
import {
  ALL_TABS,
  CONNECTED_DATA_GROUPS,
  KNOWN_TEMPLATE_CATEGORIES,
  connectedDataGroupOf,
  type ConnectedDataGroup,
} from "./component-catalog-helpers";

// Pure constants + helpers lifted to component-catalog-helpers.ts (god-file
// decomposition). SPECIAL_TABS / CatalogView / VIEW_LABEL / isSpecialTab /
// TRAILING_SPECIAL_TABS were lifted earlier into catalog-nav.ts (P1).

export function ComponentCatalog({
  onLaunchEditor,
  onPreviewComponent,
  defaultView,
}: {
  /** Launch the editor from Playground's "+ New" against the chosen target. */
  onLaunchEditor?: (target: BuilderLabTarget, draftId?: string) => void;
  /** Open a catalog component in the full-screen page-builder PREVIEW (the row's
   *  "Edit" link). The shell renders BuilderLabComponentPreview from this. */
  onPreviewComponent?: (preview: CatalogItemPreview) => void;
  /** Initial inner view — defaults to the first component tab; the shell passes
   *  "playground" so exiting the editor returns to the workbench. */
  defaultView?: CatalogView;
} = {}) {
  const [items, setItems] = useState<CatalogAdminItem[] | null>(null);
  // Catalog structure — used only to reflect admin tab renames in the Lab's
  // gallery-tab labels (Catalog Studio is the primary edit surface). Items are
  // already structure-placed by loadCatalogAdminView.
  const [structure, setStructure] = useState<CatalogStructureMap>({});
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  // O9 — multi-row edit accordion. `expandedIds` is the SET of rows whose
  // override editor is open (was a single `editingId`); `editForms` holds each
  // open row's form values keyed by id, so several rows' locked/default props
  // stay open side-by-side with independent inputs.
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );
  const [editForms, setEditForms] = useState<EditFormMap>({});

  /** Patch one row's open form snapshot (used by the per-row field setters). */
  const patchEditForm = useCallback(
    (id: string, patch: Partial<EditFormState>) => {
      setEditForms((prev) => {
        const base = prev[id] ?? emptyEditForm();
        return { ...prev, [id]: { ...base, ...patch } };
      });
    },
    [],
  );
  // W11 — inline (non-blocking) reset confirmation.
  const [confirmingResetId, setConfirmingResetId] = useState<string | null>(null);
  // W6 — search + filter over the (large) catalog.
  const [query, setQuery] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "hidden" | "customized">(
    "all",
  );
  const [activeTab, setActiveTab] = useState<CatalogView | null>(
    defaultView ?? null,
  );
  // Connected view shows one surface at a time via the shared SurfaceSwitcher
  // (Agency first, matching Site Defaults).
  const [connectedSurface, setConnectedSurface] =
    useState<ConnectedDataGroup>("agency");
  // W11 — transient success toast. O5 — the toast can now carry an optional
  // "Undo" action (built from the pre-mutation overlay snapshot); a plain
  // `flash()` leaves `undo` null so the toast renders action-free as before.
  const [toast, setToast] = useState<{
    message: string;
    undo: LabToastAction | null;
  } | null>(null);
  // QA harness — flips to true after mount so browser automation can wait for
  // hydration (data-hydrated="true" on the catalog root) before clicking tabs,
  // fixing the clicks-before-React-attaches race. Inert; no behavior change.
  const [hydrated, setHydrated] = useState(false);
  // O6 — global Cmd/Ctrl-K command palette. `paletteOpen` drives the overlay;
  // `allTemplates` is the full `builder_templates` set (templates ∪ Playground
  // drafts) the palette indexes alongside the gallery `items`.
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [allTemplates, setAllTemplates] = useState<BuilderTemplateRow[]>([]);
  // D8 — D7 per-template adoption totals (template_id → {appliedCount,…}). Feeds
  // the Catalog-health dead-weight bucket. A failed/empty read just means the
  // dead-weight bucket treats every published template as un-adopted (still a
  // useful triage list) — non-fatal, like the palette index above.
  const [templateUsage, setTemplateUsage] = useState<
    Record<string, TemplateUsageTotals>
  >({});

  const flash = useCallback((msg: string) => {
    setToast({ message: msg, undo: null });
    setTimeout(() => setToast(null), T.toastMs);
  }, []);

  /** P1 — the single entry point for changing the active Catalog view. Beyond
   *  `setActiveTab` it (a) remembers the view as the group's last-used (so
   *  re-entering a group restores it) and (b) mirrors the view into the URL as
   *  `?view=<view>` via history.replaceState — making every view deep-linkable
   *  and refresh-stable WITHOUT pulling in next/navigation (no router, no
   *  useSearchParams, no Suspense). Every former `setActiveTab(x)` view-change
   *  caller routes through here. Defined above the mount effect so that effect
   *  can seed the initial view through the same path. */
  const selectView = useCallback((view: CatalogView) => {
    setActiveTab(view);
    saveLastViewForGroup(groupOfView(view), view);
    if (typeof window !== "undefined") {
      try {
        const url = new URL(window.location.href);
        url.searchParams.set("view", view);
        window.history.replaceState(window.history.state, "", url);
      } catch {
        /* malformed URL — non-fatal, the in-memory activeTab still updates */
      }
    }
  }, []);

  // ── O7: persisted filter presets ──────────────────────────────────────────
  // Presets are loaded from localStorage on mount (SSR-safe: only in effects).
  // The strip shows built-ins + custom presets; active preset is highlighted.
  const [customPresets, setCustomPresets] = useState<FilterPreset[]>([]);
  const allPresets = useMemo(() => mergePresets(customPresets), [customPresets]);
  // Whether the inline "Save as preset" input is open.
  const [savingPreset, setSavingPreset] = useState(false);
  const [presetDraftLabel, setPresetDraftLabel] = useState("");
  const presetInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setHydrated(true);
    // Restore custom presets and the active preset on mount. All setters are
    // stable (React guarantees); this effect is intentionally mount-only ([]
    // deps) because we only want to read localStorage once, not on every render.
    // State setters from useState are stable refs — safe to omit from deps.
    const stored = loadCustomPresets();
    setCustomPresets(stored);
    // P1 — resolve the INITIAL view with precedence URL > preset > defaultView >
    // firstStructureView. A present `?view=` (deep link / refresh) beats the
    // persisted preset. The preset still restores the filter mode/surface
    // regardless of which view wins.
    let presetTab: string | null = null;
    const activeKey = loadActivePresetKey();
    if (activeKey) {
      const allWithBuiltins = mergePresets(stored);
      const found = allWithBuiltins.find((p) => p.key === activeKey);
      if (found) {
        const restored = presetToState(found);
        presetTab = restored.tab;
        setFilterMode(restored.mode);
        setConnectedSurface(restored.surface);
      }
    }
    const urlView =
      typeof window !== "undefined"
        ? parseViewParam(new URLSearchParams(window.location.search).get("view"))
        : null;
    // Only seed the view if SOMETHING resolves it — leaving activeTab null keeps
    // the default first-gallery-tab fallback `currentView` already provides.
    if (urlView || presetTab || defaultView) {
      const resolved = resolveInitialView({
        urlView,
        presetTab,
        defaultView,
        firstStructureView: "all",
      });
      selectView(resolved);
    }
  }, [defaultView, selectView]); // mount-only intent; deps are stable refs

  /** Current filter state snapshot (for save + active-highlight). */
  const currentFilterState = useCallback((): FilterState => ({
    tab: activeTab,
    mode: filterMode,
    surface: connectedSurface,
  }), [activeTab, filterMode, connectedSurface]);

  /** Apply a preset — restores all three filter dimensions and persists the key. */
  const applyPreset = useCallback((preset: FilterPreset) => {
    const state = presetToState(preset);
    if (state.tab !== null) selectView(state.tab as CatalogView);
    else if (defaultView) selectView(defaultView);
    else setActiveTab(null);
    setFilterMode(state.mode);
    setConnectedSurface(state.surface);
    saveActivePresetKey(preset.key);
  }, [defaultView, selectView]);

  /** Save current filter as a new custom preset. */
  const commitSavePreset = useCallback(() => {
    const label = presetDraftLabel.trim();
    if (!label) return;
    const existingKeys = allPresets.map((p) => p.key);
    const key = labelToKey(label, existingKeys);
    const preset = snapshotToPreset(key, label, currentFilterState());
    const next = [...customPresets, preset];
    setCustomPresets(next);
    saveCustomPresets(next);
    saveActivePresetKey(key);
    setSavingPreset(false);
    setPresetDraftLabel("");
    flash(`Preset "${label}" saved`);
  }, [presetDraftLabel, allPresets, customPresets, currentFilterState, flash]);

  /** Delete a custom preset by key. Built-ins cannot be deleted. */
  const deletePreset = useCallback((key: string) => {
    const next = customPresets.filter((p) => p.key !== key);
    setCustomPresets(next);
    saveCustomPresets(next);
    // If the active key was deleted, clear the persisted active key.
    const activeKey = loadActivePresetKey();
    if (activeKey === key) saveActivePresetKey(null);
  }, [customPresets]);

  // Focus the preset label input when the save form opens.
  useEffect(() => {
    if (savingPreset) {
      presetInputRef.current?.focus();
    }
  }, [savingPreset]);

  // P3 — D1 usage counts are loaded LAZILY (the eager Lab open no longer waits on
  // the platform-wide usage scan). This fetches the cheap `id → usageCount` map
  // (a SECURITY-DEFINER RPC pair, server-side aggregated, no 1000-row truncation)
  // and merges it into the already-rendered rows. Non-fatal: a failure just
  // leaves the "Used" column at "—". Until it lands, rows carry usageCount:
  // undefined from loadCatalogAdminView.
  const mergeUsageCounts = useCallback(async () => {
    try {
      const map = await loadCatalogUsageCounts();
      setItems((prev) =>
        prev
          ? prev.map((r) => ({ ...r, usageCount: map[r.id] ?? r.usageCount }))
          : prev,
      );
    } catch {
      /* keep "—" in the Used column */
    }
  }, []);

  const reload = useCallback(async () => {
    const data = await loadCatalogAdminView();
    setItems(data);
    // Re-fire the lazy usage merge after a reload so the Used column reflects any
    // tree changes since the last load.
    void mergeUsageCounts();
  }, [mergeUsageCounts]);

  useEffect(() => {
    let cancelled = false;
    listCatalogStructure()
      .then((s) => {
        if (!cancelled) setStructure(s);
      })
      .catch(() => {
        /* keep code-default tab labels */
      });
    loadCatalogAdminView()
      .then((data) => {
        if (!cancelled) setItems(data);
        // P3 — fire the LAZY D1 usage fetch only AFTER the catalog rows are
        // painted, then merge counts into them by id. Self-contained + non-fatal:
        // its own catch keeps a usage failure from tripping the catalog error
        // below (the catalog already loaded); the Used column shows "—" until it
        // resolves.
        loadCatalogUsageCounts()
          .then((map) => {
            if (!cancelled) {
              setItems((prev) =>
                prev
                  ? prev.map((r) => ({
                      ...r,
                      usageCount: map[r.id] ?? r.usageCount,
                    }))
                  : prev,
              );
            }
          })
          .catch(() => {
            /* keep "—" in the Used column */
          });
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load the component catalog.");
      });
    // O6 — index source: every builder_templates row (templates ∪ drafts). A
    // failure here is non-fatal: the palette still indexes gallery components.
    listAllTemplates()
      .then((res) => {
        if (!cancelled && res.ok) setAllTemplates(res.data);
      })
      .catch(() => {
        /* palette degrades to components-only */
      });
    // D8 — adoption totals for the Catalog-health dead-weight bucket. Non-fatal.
    getTemplateUsageTotals()
      .then((res) => {
        if (!cancelled && res.ok) setTemplateUsage(res.data);
      })
      .catch(() => {
        /* dead-weight bucket treats all published templates as un-adopted */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // O6 — the Cmd/Ctrl-K listener is mounted with the Lab catalog and torn down
  // on unmount, so the chord only opens the palette while this surface is on
  // screen. We don't steal the chord when an unrelated modal is focused-out;
  // the catalog is the Lab's primary surface so a global capture is correct.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isPaletteChord(e)) {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Row-level mutation handlers, lifted into useCatalogActions (god-file
  // decomposition). The controller still owns all state; the hook receives the
  // setters/state and returns the action callbacks (verbatim useCallback bodies).
  const {
    toggleSurface,
    toggleLab,
    startEdit,
    closeEdit,
    toggleEdit,
    saveEdit,
    confirmReset,
    startResetOptimistic,
    setStatus,
  } = useCatalogActions({
    items,
    expandedIds,
    editForms,
    setPendingId,
    setError,
    reload,
    setToast,
    flash,
    setItems,
    patchEditForm,
    setEditForms,
    setExpandedIds,
    setConfirmingResetId,
  });

  const { presentTabs, rowsByTab } = useMemo(() => {
    const empty = {
      presentTabs: [] as AddGalleryTab[],
      rowsByTab: new Map<AddGalleryTab, CatalogAdminItem[]>(),
    };
    if (!items) return empty;
    const q = query.trim().toLowerCase();
    const matches = (r: CatalogAdminItem) => {
      if (filterMode === "customized" && !r.overlay) return false;
      if (filterMode === "hidden") {
        // "Hidden" surfaces any row not fully visible: at least one surface
        // toggle off (the original rule), OR the row is availability-archived
        // (availability_override==='hidden' — drops it from BOTH live galleries).
        // The archived case is now reachable from the per-row status dropdown, so
        // it must register here even though both surface toggles may still read
        // "on" underneath the archive.
        const archived = r.overlay?.availability_override === "hidden";
        const fullyVisible = r.talentVisible && r.workspaceVisible;
        if (!archived && fullyVisible) return false;
      }
      if (q) {
        const hay =
          `${r.effectiveLabel} ${r.effectiveCategory} ${r.id} ${r.baseLabel}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    };
    const present: AddGalleryTab[] = [];
    const byTab = new Map<AddGalleryTab, CatalogAdminItem[]>();
    for (const tab of ALL_TABS) {
      const inTab = items.filter((r) => r.tab === tab);
      if (inTab.length > 0) present.push(tab);
      byTab.set(
        tab,
        inTab
          .filter(matches)
          .sort(
            (a, b) =>
              a.effectiveCategory.localeCompare(b.effectiveCategory) ||
              a.effectiveLabel.localeCompare(b.effectiveLabel),
          ),
      );
    }
    return { presentTabs: present, rowsByTab: byTab };
  }, [items, query, filterMode]);

  // D8 — Catalog-health triage report. PURE derivation over the FULL ungated
  // rows (not the filtered `rowsByTab` view) + every template + D7 adoption
  // totals. Recomputed only when one of those inputs changes. Null `items`
  // (pre-load) ⇒ an empty report (the panel renders its all-clear line).
  const healthReport = useMemo(
    () =>
      analyzeCatalogHealth({
        rows: items ?? [],
        templates: allTemplates,
        templateUsage,
        // The built-in page-template starters carry an INTENT category (coach,
        // restaurant, editorial, …) from the page-design ids — a legitimate
        // taxonomy distinct from the component-tab categories. Register them
        // (+ the Playground draft bucket) so the orphaned-category check stops
        // false-flagging every built-in starter; a genuine typo still surfaces.
        knownCategories: KNOWN_TEMPLATE_CATEGORIES,
      }),
    [items, allTemplates, templateUsage],
  );

  if (error && !items) {
    return <div style={{ color: T.red, fontSize: 13 }}>{error}</div>;
  }
  if (!items) {
    return (
      <div style={{ color: T.inkMuted, fontSize: 13, padding: "8px 0" }}>
        Loading the component catalog…
      </div>
    );
  }

  // Gallery component categories (drop the empty page_templates tab — its
  // full-page role moves to the Site Starter Kit view).
  const categoryTabs = presentTabs.filter((t) => t !== "page_templates");
  // P1 — the full navigable view universe: every special view ∪ the present
  // gallery tabs. `currentView` is validated against THIS (not just the active
  // group's tier-2 list) so a deep link / restore to any view — including an
  // Admin-group view like `?view=health` — resolves before the group is derived.
  const allNavigableViews: ReadonlyArray<CatalogView> = [
    ...SPECIAL_TABS,
    ...categoryTabs,
  ];
  const currentView: CatalogView =
    activeTab && allNavigableViews.includes(activeTab)
      ? activeTab
      : categoryTabs[0] ?? "site_starter_kit";
  // Two-tier nav: derive the active group from the resolved view, then the
  // group's ordered tier-2 views (structure filters its gallery tabs by the
  // present-set; design/admin are static).
  const activeGroup: CatalogGroup = groupOfView(currentView);
  const groupViews = orderedViewsForGroup(activeGroup, categoryTabs);
  const galleryView = !isSpecialTab(currentView);
  const currentRows = galleryView
    ? rowsByTab.get(currentView as AddGalleryTab) ?? []
    : [];

  // Display label for a view: gallery tabs honor admin renames (Catalog Studio);
  // special views keep their fixed label.
  const viewLabel = (view: CatalogView): string =>
    isSpecialTab(view)
      ? VIEW_LABEL[view]
      : resolveTabLabel(view as AddGalleryTab, structure);

  // The Connected view shows ONE surface at a time (driven by the switcher);
  // every other gallery view renders as a single group. Empty groups are dropped.
  const rowGroups: Array<{ key: string; label: string; rows: CatalogAdminItem[] }> = (
    currentView === "connected"
      ? CONNECTED_DATA_GROUPS.filter((g) => g.key === connectedSurface).map((g) => ({
          key: g.key,
          label: g.label,
          rows: currentRows.filter((r) => connectedDataGroupOf(r) === g.key),
        }))
      : [{ key: String(currentView), label: viewLabel(currentView), rows: currentRows }]
  ).filter((g) => g.rows.length > 0);

  // O9 — ids of every row currently rendered (across the visible groups); the
  // expand-all / collapse-all header acts over exactly these.
  const visibleRowIds = rowGroups.flatMap((g) => g.rows.map((r) => r.id));
  const visibleExpandedCount = expandedCount(expandedIds, visibleRowIds);
  const allVisibleExpanded = allExpanded(expandedIds, visibleRowIds);

  /** Build the per-row form value/setter bundle the row table threads into each
   *  open editor — reads the row's snapshot, writes back through patchEditForm. */
  const formBundleFor = (id: string): CatalogEditFormBundle => {
    const f = editForms[id] ?? emptyEditForm();
    return {
      editLabel: f.label,
      setEditLabel: (v) => patchEditForm(id, { label: v }),
      editCategory: f.category,
      setEditCategory: (v) => patchEditForm(id, { category: v }),
      editIcon: f.icon,
      setEditIcon: (v) => patchEditForm(id, { icon: v }),
      editPlan: f.plan,
      setEditPlan: (v) => patchEditForm(id, { plan: v }),
      editLockedProps: f.lockedProps,
      setEditLockedProps: (v) => patchEditForm(id, { lockedProps: v }),
      editDefaultVariant: f.defaultVariant,
      setEditDefaultVariant: (v) => patchEditForm(id, { defaultVariant: v }),
      editDefaultProps: f.defaultProps,
      setEditDefaultProps: (v) => patchEditForm(id, { defaultProps: v }),
      editDefaultPropsError: f.defaultPropsError,
      setEditDefaultPropsError: (v) => patchEditForm(id, { defaultPropsError: v }),
      editDataSourceDefaults: f.dataSourceDefaults,
      setEditDataSourceDefaults: (v) => patchEditForm(id, { dataSourceDefaults: v }),
      editDataSourceDefaultsError: f.dataSourceDefaultsError,
      setEditDataSourceDefaultsError: (v) =>
        patchEditForm(id, { dataSourceDefaultsError: v }),
    };
  };

  /** Expand-all over the currently-listed rows: seed any not-yet-open form. */
  const onExpandAllVisible = () => {
    setEditForms((prev) => {
      const next = { ...prev };
      for (const g of rowGroups) {
        for (const r of g.rows) {
          if (!(r.id in next)) next[r.id] = editFormFromItem(r);
        }
      }
      return next;
    });
    setExpandedIds((prev) => expandAll(prev, visibleRowIds));
  };

  /** Collapse-all over the currently-listed rows (rows hidden by another tab /
   *  filter stay open). Drops their form snapshots. */
  const onCollapseAllVisible = () => {
    setExpandedIds((prev) => collapseAll(prev, visibleRowIds));
    setEditForms((prev) => {
      const next = { ...prev };
      for (const id of visibleRowIds) delete next[id];
      return next;
    });
  };

  // Command-palette index + jump handlers lifted into buildPaletteJumps (god-file
  // decomposition) — pure render-scope derivations, behavior-identical.
  const {
    paletteComponents,
    paletteDrafts,
    paletteTemplates,
    handlePaletteJump,
    handleAllIndexJump,
    handleHealthJump,
  } = buildPaletteJumps({ items, allTemplates, selectView, startEdit });

  return (
    <div
      data-testid="lab-catalog-root"
      data-hydrated={hydrated ? "true" : undefined}
      style={{ display: "flex", flexDirection: "column", gap: 16 }}
    >
      {/* O6 — global Cmd/Ctrl-K command palette across components, templates,
          and Playground drafts. Selecting a result jumps to the owning tab with
          the row pre-expanded. */}
      <LabCommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        components={paletteComponents}
        templates={paletteTemplates}
        drafts={paletteDrafts}
        templateTab="templates"
        playgroundTab="playground"
        onJump={handlePaletteJump}
      />

      {/* P1 — two-tier grouped nav (tier-1 Structure/Design/Admin pills, tier-2
          the active group's views). The D8 Catalog-health strip is no longer
          always-on; it's now the Admin-group "Health" view (rendered below),
          surfaced from Structure via the lab-health-chip when there are issues. */}
      <CatalogNav
        group={activeGroup}
        views={groupViews}
        currentView={currentView}
        countFor={(view) =>
          isSpecialTab(view)
            ? null
            : rowsByTab.get(view as AddGalleryTab)?.length ?? 0
        }
        labelFor={viewLabel}
        onSelectGroup={(g) => {
          // Re-enter a group on its last-used view (if still valid + in-group),
          // else the group's first view.
          const last = loadLastViewPerGroup()[g];
          const target =
            last && groupOfView(last) === g
              ? last
              : firstViewOfGroup(g, categoryTabs);
          selectView(target);
        }}
        onSelectView={selectView}
      />

      {galleryView ? (
        <CatalogGalleryView
          error={error}
          toast={toast}
          allPresets={allPresets}
          currentFilterState={currentFilterState}
          applyPreset={applyPreset}
          deletePreset={deletePreset}
          savingPreset={savingPreset}
          presetInputRef={presetInputRef}
          presetDraftLabel={presetDraftLabel}
          setPresetDraftLabel={setPresetDraftLabel}
          commitSavePreset={commitSavePreset}
          setSavingPreset={setSavingPreset}
          query={query}
          setQuery={setQuery}
          filterMode={filterMode}
          setFilterMode={setFilterMode}
          currentView={currentView}
          connectedSurface={connectedSurface}
          setConnectedSurface={setConnectedSurface}
          rowGroups={rowGroups}
          viewLabel={viewLabel}
          visibleExpandedCount={visibleExpandedCount}
          visibleRowIds={visibleRowIds}
          onExpandAllVisible={onExpandAllVisible}
          allVisibleExpanded={allVisibleExpanded}
          onCollapseAllVisible={onCollapseAllVisible}
          healthReport={healthReport}
          selectView={selectView}
          pendingId={pendingId}
          expandedIds={expandedIds}
          formBundleFor={formBundleFor}
          closeEdit={closeEdit}
          confirmingResetId={confirmingResetId}
          toggleEdit={toggleEdit}
          toggleSurface={toggleSurface}
          toggleLab={toggleLab}
          setStatus={setStatus}
          saveEdit={saveEdit}
          confirmReset={confirmReset}
          startResetOptimistic={startResetOptimistic}
          setConfirmingResetId={setConfirmingResetId}
          reload={reload}
          onPreviewComponent={onPreviewComponent}
        />
      ) : currentView === "all" ? (
        <CatalogAllIndexTable
          items={items}
          templates={allTemplates}
          onJump={handleAllIndexJump}
        />
      ) : currentView === "catalog_studio" ? (
        <CatalogStudioView />
      ) : currentView === "site_defaults" ? (
        <SiteDefaultsEditor />
      ) : currentView === "default_surfaces" ? (
        <DefaultSurfacesPanel />
      ) : currentView === "playground" ? (
        <PlaygroundView onLaunchEditor={onLaunchEditor} />
      ) : currentView === "activity" ? (
        <CatalogActivityFeed />
      ) : currentView === "templates" ? (
        <TemplateManager />
      ) : currentView === "parity" ? (
        <ParityProbePanel />
      ) : currentView === "taxonomy" ? (
        <TaxonomyManagerPanel />
      ) : currentView === "health" ? (
        // P1 — the promoted D8 Catalog-health view (was an always-on strip).
        <CatalogHealthPanel report={healthReport} onJumpToIssue={handleHealthJump} />
      ) : (
        <SiteStarterKitView onLaunchEditor={onLaunchEditor} />
      )}
    </div>
  );
}
