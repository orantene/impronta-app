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
  ADD_GALLERY_CATEGORIES,
  type AddGalleryTab,
  type CatalogAdminItem,
  type CatalogOverlayRow,
} from "@/lib/site-admin/add-gallery";
import {
  CATALOG_SURFACE_KEYS,
  surfaceEnabledForRow,
  surfaceKeyToTarget,
  labEnabledForRow,
  type CatalogSurfaceKey,
} from "@/lib/site-admin/add-gallery/registry-db-merge";
import {
  CODE_TAB_DEFS,
  resolveTabLabel,
  type CatalogStructureMap,
} from "@/lib/site-admin/add-gallery/catalog-structure";
import { listCatalogStructure } from "@/lib/site-admin/add-gallery/catalog-structure-actions";
import { loadCatalogAdminView } from "@/lib/site-admin/add-gallery/catalog-admin-view-action";
import { listAllTemplates } from "@/lib/site-admin/builder-core/templates/registry-admin-actions";
import { getTemplateUsageTotals } from "@/lib/site-admin/builder-core/templates/template-usage-actions";
import type { TemplateUsageTotals } from "@/lib/site-admin/builder-core/templates/template-usage-shape";
import type { BuilderTemplateRow } from "@/lib/site-admin/builder-core/templates/registry-rows";
import {
  clearComponentOverlay,
  setComponentOverlay,
} from "@/lib/site-admin/builder-core/templates/catalog-overlay-actions";
import { SiteDefaultsEditor } from "./site-defaults-editor";
import { DefaultSurfacesPanel } from "./default-surfaces-panel";
import {
  archiveTemplate,
  publishTemplate,
  rejectToDraft,
  submitTemplateForReview,
  unpublishTemplate,
} from "@/lib/site-admin/builder-core/templates/registry-actions";
import { CatalogStudioView } from "./catalog-studio";
import { SurfaceSwitcher } from "./surface-switcher";
import {
  CatalogRowTable,
  targetAllows,
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
  toggleExpanded,
} from "./catalog-edit-accordion";
import { PlaygroundView } from "./catalog-playground";
import { SiteStarterKitView } from "./catalog-starter-kit";
import { CatalogActivityFeed } from "./catalog-activity-feed";
import { TemplateManager } from "./template-manager";
import { ParityProbePanel } from "./parity-probe-panel";
import { TaxonomyManagerPanel } from "./taxonomy-manager-panel";
import { CatalogAllIndexTable } from "./catalog-all-index-table";
import type { AllIndexRow } from "./catalog-all-index";
import { CatalogHealthPanel } from "./catalog-health-panel";
import {
  analyzeCatalogHealth,
  type CatalogHealthIssue,
} from "./catalog-health";
import type { BuilderLabTarget } from "./builder-lab-stage";
import {
  buildCatalogItemPreview,
  buildTemplateItemPreview,
  type CatalogItemPreview,
} from "./component-preview-stage";
import {
  LAB as T,
  fieldStyle,
  LabButton,
  PillToggle,
  LabToast,
  EmptyCard,
  type LabToastAction,
} from "./ui";
import {
  buildUndoDescriptor,
  type UndoMutationKind,
  type UndoRevert,
} from "./catalog-undo";
import {
  type FilterPreset,
  type FilterState,
  BUILT_IN_PRESETS,
  labelToKey,
  loadActivePresetKey,
  loadCustomPresets,
  mergePresets,
  presetToState,
  saveActivePresetKey,
  saveCustomPresets,
  snapshotToPreset,
  stateMatchesPreset,
} from "./catalog-filter-presets";
import { LabCommandPalette, isPaletteChord } from "./command-palette";

// Single source — derived from the Builder Studio catalog-structure resolver
// (was duplicated with add-gallery-panel.tsx's TAB_DEFS). WS-B threads loaded
// structure for admin tab rename/reorder; code defaults verbatim otherwise.
const ALL_TABS: ReadonlyArray<AddGalleryTab> = CODE_TAB_DEFS.map((t) => t.id);

// X4 — the overlay-input column written when toggling each of the four surfaces.
const SURFACE_ENABLED_COLUMN: Record<
  CatalogSurfaceKey,
  | "talent_profile_enabled"
  | "talent_shell_enabled"
  | "workspace_page_enabled"
  | "workspace_shell_enabled"
> = {
  talent_profile: "talent_profile_enabled",
  talent_shell: "talent_shell_enabled",
  workspace_page: "workspace_page_enabled",
  workspace_shell: "workspace_shell_enabled",
};
const TAB_LABEL = Object.fromEntries(
  CODE_TAB_DEFS.map((t) => [t.id, t.label]),
) as Record<AddGalleryTab, string>;

// Special (non-gallery) Catalog views. "all" (O10 — the unified superset index)
// is special too but rendered FIRST in the tab strip (before the gallery
// categories); the rest sit after the component categories. The set membership
// here only marks them non-gallery — ORDER is decided by `viewTabs` below.
const SPECIAL_TABS = [
  "all",
  "catalog_studio",
  "site_starter_kit",
  "site_defaults",
  "default_surfaces",
  "playground",
  "activity",
  "templates",
  "parity",
  "taxonomy",
] as const;
type SpecialTab = (typeof SPECIAL_TABS)[number];
type CatalogView = AddGalleryTab | SpecialTab;
// SPECIAL_TABS that render AFTER the gallery categories (i.e. everything except
// the leading "all" superset index, which is pinned first).
const TRAILING_SPECIAL_TABS = SPECIAL_TABS.filter((t) => t !== "all");
const VIEW_LABEL: Record<CatalogView, string> = {
  ...TAB_LABEL,
  all: "All",
  catalog_studio: "Catalog Studio",
  site_starter_kit: "Site Starter Kit",
  site_defaults: "Site Defaults",
  default_surfaces: "Default surfaces",
  playground: "Playground",
  activity: "Activity",
  templates: "Templates",
  parity: "Parity",
  taxonomy: "Taxonomy",
};
function isSpecialTab(v: CatalogView): v is SpecialTab {
  return (SPECIAL_TABS as readonly string[]).includes(v);
}

const CATEGORY_LABEL = new Map(
  ADD_GALLERY_CATEGORIES.map((c) => [c.id, c.label] as const),
);

// O9 — placeholder values for CatalogRowTable's (required) flat edit-form props.
// Under multi-open these are NEVER read — each open editor's values come from
// `multiEdit.formFor(id)`. They only satisfy the prop contract so the row table
// stays backward-compatible (the flat props remain required for legacy callers).
const NOOP = () => {};
const PLACEHOLDER_EDIT_FORM_PROPS: CatalogEditFormBundle = {
  editLabel: "",
  setEditLabel: NOOP,
  editCategory: "",
  setEditCategory: NOOP,
  editIcon: "",
  setEditIcon: NOOP,
  editPlan: "",
  setEditPlan: NOOP,
  editLockedProps: "",
  setEditLockedProps: NOOP,
  editDefaultVariant: "",
  setEditDefaultVariant: NOOP,
  editDefaultProps: "",
  setEditDefaultProps: NOOP,
  editDefaultPropsError: null,
  setEditDefaultPropsError: NOOP,
  editDataSourceDefaults: "",
  setEditDataSourceDefaults: NOOP,
  editDataSourceDefaultsError: null,
  setEditDataSourceDefaultsError: NOOP,
};

function humanize(id: string): string {
  return (
    CATEGORY_LABEL.get(id) ??
    id
      .split(/[-_\s]+/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ")
  );
}

// The Connected view is split by which DATA the component binds: talent-roster /
// collection / directory sources → "Talent Data"; agency profile / booking /
// inquiry sources → "Agency Data". The surface switcher shows one at a time
// (Agency first, matching Site Defaults). This is a DISPLAY grouping (derived
// from the stable `connectedSource`, not from target_context), so it never
// changes the real per-surface gating — that stays controlled by the Talent-Max
// / Workspace toggles on each row.
const CONNECTED_DATA_GROUPS = [
  { key: "agency", label: "Agency Data" },
  { key: "talent", label: "Talent Data" },
] as const;
type ConnectedDataGroup = (typeof CONNECTED_DATA_GROUPS)[number]["key"];

function connectedDataGroupOf(item: CatalogAdminItem): ConnectedDataGroup {
  const src = item.connectedSource ?? "";
  return src === "Talent Collection" || src === "Talent Directory"
    ? "talent"
    : "agency";
}

/** Parse the "Locked props" textarea (comma/newline/space-separated dot-paths)
 *  into the normalized `locked_props` array. Empty ⇒ [] (clears the lock). */
function parseLockedProps(raw: string): string[] {
  const seen = new Set<string>();
  for (const tok of raw.split(/[\s,]+/)) {
    const key = tok.trim();
    if (key) seen.add(key);
  }
  return Array.from(seen);
}

/** Parse a JSON-object textarea. Empty ⇒ null (clears the override). Invalid
 *  JSON or a non-object → `{ error }` so the caller can show an inline message
 *  and block the save. `noun` names the field in the error copy. */
function parseJsonObjectField(
  raw: string,
  noun: string,
): { ok: true; value: Record<string, unknown> | null } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: null };
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ok: false, error: "Invalid JSON." };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: `${noun} must be a JSON object.` };
  }
  return { ok: true, value: parsed as Record<string, unknown> };
}

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
    const activeKey = loadActivePresetKey();
    if (activeKey) {
      const allWithBuiltins = mergePresets(stored);
      const found = allWithBuiltins.find((p) => p.key === activeKey);
      if (found) {
        const restored = presetToState(found);
        if (restored.tab !== null) setActiveTab(restored.tab as CatalogView);
        setFilterMode(restored.mode);
        setConnectedSurface(restored.surface);
      }
    }
  }, []); // mount-only: localStorage read; setters are stable and safe to omit

  /** Current filter state snapshot (for save + active-highlight). */
  const currentFilterState = useCallback((): FilterState => ({
    tab: activeTab,
    mode: filterMode,
    surface: connectedSurface,
  }), [activeTab, filterMode, connectedSurface]);

  /** Apply a preset — restores all three filter dimensions and persists the key. */
  const applyPreset = useCallback((preset: FilterPreset) => {
    const state = presetToState(preset);
    if (state.tab !== null) setActiveTab(state.tab as CatalogView);
    else setActiveTab(defaultView ?? null);
    setFilterMode(state.mode);
    setConnectedSurface(state.surface);
    saveActivePresetKey(preset.key);
  }, [defaultView]);

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

  const reload = useCallback(async () => {
    const data = await loadCatalogAdminView();
    setItems(data);
  }, []);

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

  const mutate = useCallback(
    async (id: string, run: () => Promise<{ ok: boolean; error?: string }>) => {
      setPendingId(id);
      setError(null);
      try {
        const res = await run();
        if (!res.ok) setError(res.error ?? "Update failed.");
        await reload();
      } catch {
        setError("Update failed.");
      } finally {
        setPendingId(null);
      }
    },
    [reload],
  );

  // O5 — run an undo revert (re-apply the captured `before`, or clear when the
  // row had no overlay). Routes through the SAME mutate() round-trip a normal
  // edit takes, so the live galleries reconcile identically. Dismisses the toast
  // immediately so a second click can't double-fire the revert.
  const runRevert = useCallback(
    (itemRef: string, revert: UndoRevert) => {
      setToast(null);
      void mutate(itemRef, () =>
        revert.mode === "apply"
          ? setComponentOverlay(revert.input)
          : clearComponentOverlay(revert.itemRef),
      ).then(() => flash("Change undone ✓"));
    },
    [mutate, flash],
  );

  // O5 — emit a success toast that carries an Undo action built from the
  // pre-mutation snapshot. `undoable: false` descriptors (e.g. DB-template status
  // changes, which move the lifecycle, not the overlay) fall back to a plain
  // toast with no action.
  const flashWithUndo = useCallback(
    (args: {
      kind: UndoMutationKind;
      itemRef: string;
      source: "code" | "template";
      before: CatalogOverlayRow | null;
      itemLabel: string;
      message: string;
    }) => {
      const desc = buildUndoDescriptor(
        {
          kind: args.kind,
          itemRef: args.itemRef,
          source: args.source,
          before: args.before,
          itemLabel: args.itemLabel,
        },
        args.message,
      );
      if (!desc.undoable || !desc.revert) {
        flash(desc.message);
        return;
      }
      const revert = desc.revert;
      setToast({
        message: desc.message,
        undo: {
          label: desc.undoLabel,
          testId: `lab-catalog-undo-${args.itemRef}`,
          onClick: () => runRevert(args.itemRef, revert),
        },
      });
      setTimeout(() => setToast(null), T.toastMs);
    },
    [flash, runRevert],
  );

  // X4 — toggle ONE of the four real surfaces. Each surface has its OWN overlay
  // column (`talent_profile_enabled` … `workspace_shell_enabled`); we also
  // dual-write the legacy `talent_enabled` / `workspace_enabled` pair (as the AND
  // of the two surfaces sharing that target) so a rollback to pre-X4 code still
  // reads sane visibility. The talent shell is now independent of the workspace
  // toggle — the lossy 3-on-1 collapse is gone.
  const toggleSurface = useCallback(
    (item: CatalogAdminItem, surfaceKey: CatalogSurfaceKey) => {
      const ov = item.overlay;
      const currentFour: Record<CatalogSurfaceKey, boolean> = {
        talent_profile: surfaceEnabledForRow(ov, "talent_profile"),
        talent_shell: surfaceEnabledForRow(ov, "talent_shell"),
        workspace_page: surfaceEnabledForRow(ov, "workspace_page"),
        workspace_shell: surfaceEnabledForRow(ov, "workspace_shell"),
      };
      const nextFour = { ...currentFour, [surfaceKey]: !currentFour[surfaceKey] };
      // Legacy mirror: a target is "enabled" iff BOTH its surfaces are.
      const legacyTalent = nextFour.talent_profile && nextFour.talent_shell;
      const legacyWorkspace = nextFour.workspace_page && nextFour.workspace_shell;
      // W11 — optimistic flip so the cell updates instantly; mutate() reloads and
      // reconciles against server truth (reverting on error).
      setItems((prev) =>
        prev
          ? prev.map((r) => {
              if (r.id !== item.id) return r;
              const overlay: CatalogOverlayRow = {
                item_ref: r.id,
                source: r.source as "code" | "template",
                talent_enabled: legacyTalent,
                workspace_enabled: legacyWorkspace,
                talent_profile_enabled: nextFour.talent_profile,
                talent_shell_enabled: nextFour.talent_shell,
                workspace_page_enabled: nextFour.workspace_page,
                workspace_shell_enabled: nextFour.workspace_shell,
                label_override: r.overlay?.label_override ?? null,
                icon_override: r.overlay?.icon_override ?? null,
                category_override: r.overlay?.category_override ?? null,
                required_plan_override: r.overlay?.required_plan_override ?? null,
                availability_override: r.overlay?.availability_override ?? null,
              };
              const hidden = overlay.availability_override === "hidden";
              const surfaceVisible = CATALOG_SURFACE_KEYS.reduce(
                (acc, key) => {
                  acc[key] =
                    targetAllows(r.targetContext, surfaceKeyToTarget(key)) &&
                    nextFour[key] &&
                    !hidden;
                  return acc;
                },
                {} as Record<CatalogSurfaceKey, boolean>,
              );
              return {
                ...r,
                overlay,
                surfaceVisible,
                talentVisible:
                  targetAllows(r.targetContext, "talent") && legacyTalent && !hidden,
                workspaceVisible:
                  targetAllows(r.targetContext, "workspace") &&
                  legacyWorkspace &&
                  !hidden,
              };
            })
          : prev,
      );
      const column = SURFACE_ENABLED_COLUMN[surfaceKey];
      // O5 — snapshot the pre-toggle overlay so the toast's Undo can re-apply it
      // (an accidental surface flip is one click away from recovery).
      const before = item.overlay;
      const surfaceLabel = surfaceKey
        .split("_")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
      void mutate(item.id, () =>
        setComponentOverlay({
          item_ref: item.id,
          source: item.source,
          [column]: nextFour[surfaceKey],
          talent_enabled: legacyTalent,
          workspace_enabled: legacyWorkspace,
        }),
      ).then(() =>
        flashWithUndo({
          kind: "toggle",
          itemRef: item.id,
          source: item.source,
          before,
          itemLabel: item.effectiveLabel,
          message: `${nextFour[surfaceKey] ? "Enabled" : "Disabled"} on ${surfaceLabel}`,
        }),
      );
    },
    [mutate, flashWithUndo],
  );

  // X6 — toggle the INDEPENDENT Builder-Lab visibility. Orthogonal to the four
  // tenant surfaces: it has NO legacy mirror and is NOT gated by target_context,
  // so it writes ONLY `lab_enabled` and never touches a tenant column. Optimistic
  // flip (like toggleSurface), reconciled by reload().
  const toggleLab = useCallback(
    (item: CatalogAdminItem) => {
      const nextLab = !labEnabledForRow(item.overlay);
      setItems((prev) =>
        prev
          ? prev.map((r) => {
              if (r.id !== item.id) return r;
              const overlay: CatalogOverlayRow = {
                item_ref: r.id,
                source: r.source as "code" | "template",
                talent_enabled: r.overlay?.talent_enabled ?? true,
                workspace_enabled: r.overlay?.workspace_enabled ?? true,
                talent_profile_enabled: surfaceEnabledForRow(r.overlay, "talent_profile"),
                talent_shell_enabled: surfaceEnabledForRow(r.overlay, "talent_shell"),
                workspace_page_enabled: surfaceEnabledForRow(r.overlay, "workspace_page"),
                workspace_shell_enabled: surfaceEnabledForRow(r.overlay, "workspace_shell"),
                lab_enabled: nextLab,
                label_override: r.overlay?.label_override ?? null,
                icon_override: r.overlay?.icon_override ?? null,
                category_override: r.overlay?.category_override ?? null,
                required_plan_override: r.overlay?.required_plan_override ?? null,
                availability_override: r.overlay?.availability_override ?? null,
              };
              const hidden = overlay.availability_override === "hidden";
              return { ...r, overlay, labVisible: nextLab && !hidden };
            })
          : prev,
      );
      const before = item.overlay;
      void mutate(item.id, () =>
        setComponentOverlay({
          item_ref: item.id,
          source: item.source,
          lab_enabled: nextLab,
        }),
      ).then(() =>
        flashWithUndo({
          kind: "toggle",
          itemRef: item.id,
          source: item.source,
          before,
          itemLabel: item.effectiveLabel,
          message: `${nextLab ? "Shown" : "Hidden"} in Builder Lab`,
        }),
      );
    },
    [mutate, flashWithUndo],
  );

  /** Open ONE row's editor (added to the expanded set) + seed its form. */
  const startEdit = useCallback((item: CatalogAdminItem) => {
    setEditForms((prev) => ({ ...prev, [item.id]: editFormFromItem(item) }));
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.add(item.id);
      return next;
    });
  }, []);

  /** Close ONE row's editor (removed from the set) + drop its form snapshot. */
  const closeEdit = useCallback((id: string) => {
    setExpandedIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setEditForms((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  /** Toggle ONE row's editor open/closed (the row-click affordance). */
  const toggleEdit = useCallback(
    (item: CatalogAdminItem) => {
      if (expandedIds.has(item.id)) closeEdit(item.id);
      else startEdit(item);
    },
    [expandedIds, closeEdit, startEdit],
  );

  const saveEdit = useCallback(
    (item: CatalogAdminItem) => {
      // O9 — read THIS row's per-id form snapshot (several may be open at once).
      const form = editForms[item.id] ?? emptyEditForm();
      const dp = parseJsonObjectField(form.defaultProps, "Default props");
      if (!dp.ok) {
        // Invalid JSON → keep the editor open, show the inline error, don't save.
        patchEditForm(item.id, { defaultPropsError: dp.error });
        return;
      }
      const dsd = parseJsonObjectField(form.dataSourceDefaults, "Data-source defaults");
      if (!dsd.ok) {
        patchEditForm(item.id, { dataSourceDefaultsError: dsd.error });
        return;
      }
      patchEditForm(item.id, {
        defaultPropsError: null,
        dataSourceDefaultsError: null,
      });
      const before = item.overlay;
      void mutate(item.id, () =>
        setComponentOverlay({
          item_ref: item.id,
          source: item.source,
          label_override: form.label.trim() || null,
          category_override: form.category.trim() || null,
          icon_override: form.icon.trim() || null,
          required_plan_override:
            (form.plan as "free" | "studio" | "agency" | "network" | "") || null,
          locked_props: parseLockedProps(form.lockedProps),
          default_variant: form.defaultVariant.trim() || null,
          default_props: dp.value,
          data_source_defaults: dsd.value,
        }),
      ).then(() => {
        closeEdit(item.id);
        flashWithUndo({
          kind: "save",
          itemRef: item.id,
          source: item.source,
          before,
          itemLabel: item.effectiveLabel,
          message: "Saved ✓",
        });
      });
    },
    [mutate, editForms, patchEditForm, closeEdit, flashWithUndo],
  );

  // O5 — reset is now OPTIMISTIC (no inline "Reset to default?" confirm step):
  // clicking Reset clears the overlay immediately and surfaces an Undo toast that
  // re-applies the captured `before`. `resetWithUndo` is the single entry point;
  // `confirmReset` is kept as a thin wrapper so the row table's (still-wired but
  // now-dormant) confirm path stays type-compatible.
  const resetWithUndo = useCallback(
    (item: CatalogAdminItem) => {
      setConfirmingResetId(null);
      const before = item.overlay;
      void mutate(item.id, () => clearComponentOverlay(item.id)).then(() =>
        flashWithUndo({
          kind: "reset",
          itemRef: item.id,
          source: item.source,
          before,
          itemLabel: item.effectiveLabel,
          message: "Reset to default ✓",
        }),
      );
    },
    [mutate, flashWithUndo],
  );

  const confirmReset = resetWithUndo;

  // O5 — the row "Reset" link calls onStartReset(id). It now applies the reset
  // optimistically (with Undo) instead of opening the inline confirm row. Looks
  // the row up by id (the link only carries the id).
  const startResetOptimistic = useCallback(
    (id: string) => {
      const item = items?.find((r) => r.id === id);
      if (item) resetWithUndo(item);
    },
    [items, resetWithUndo],
  );

  // ── Status transition (lifecycle control, ZERO migration) ───────────────────
  // Two orthogonal mechanisms behind ONE dropdown, depending on row source:
  //  • Code rows have no lifecycle enum — they reuse the existing
  //    `availability_override` column. Published ⇒ 'available', Archived ⇒
  //    'hidden' (which `applyCatalogOverlay` already honors globally). Draft /
  //    In-review aren't selectable for code rows (shown disabled by the row UI).
  //  • DB-template rows dispatch the existing registry lifecycle actions on their
  //    raw `dbTemplateId`. Only the legal transition for the current status is
  //    enabled (the row UI computes which); this makes in_review / archived
  //    reachable from the row.
  const setStatus = useCallback(
    (item: CatalogAdminItem, next: "draft" | "in_review" | "published" | "archived") => {
      if (item.source === "code") {
        const availability = next === "archived" ? "hidden" : "available";
        // O5 — code-row status rides the overlay (availability_override), so the
        // captured `before` re-applies on Undo.
        const before = item.overlay;
        void mutate(item.id, () =>
          setComponentOverlay({
            item_ref: item.id,
            source: item.source,
            availability_override: availability,
          }),
        ).then(() =>
          flashWithUndo({
            kind: "status",
            itemRef: item.id,
            source: item.source,
            before,
            itemLabel: item.effectiveLabel,
            message: next === "archived" ? "Archived" : "Published ✓",
          }),
        );
        return;
      }
      // DB template — dispatch the matching lifecycle action on the raw row id.
      const templateId = item.dbTemplateId ?? item.id;
      const action =
        next === "in_review"
          ? () => submitTemplateForReview(templateId)
          : next === "published"
            ? () => publishTemplate(templateId)
            : next === "archived"
              ? () => archiveTemplate(templateId)
              : // → draft: from in_review use rejectToDraft, from published use unpublish.
                item.status === "in_review"
                ? () => rejectToDraft(templateId)
                : () => unpublishTemplate(templateId);
      void mutate(item.id, action).then(() => {
        const labels: Record<typeof next, string> = {
          draft: "Moved to draft",
          in_review: "Submitted for review",
          published: "Published ✓",
          archived: "Archived",
        };
        flash(labels[next]);
      });
    },
    [mutate, flash, flashWithUndo],
  );

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
  // full-page role moves to the Site Starter Kit view). Tab order: the "all"
  // superset index FIRST (O10), then the gallery categories, then the remaining
  // special views.
  const categoryTabs = presentTabs.filter((t) => t !== "page_templates");
  const viewTabs: CatalogView[] = [
    "all",
    ...categoryTabs,
    ...TRAILING_SPECIAL_TABS,
  ];
  const currentView: CatalogView =
    activeTab && viewTabs.includes(activeTab)
      ? activeTab
      : categoryTabs[0] ?? "site_starter_kit";
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

  // ── O6: command-palette index inputs + jump handler ─────────────────────────
  // Gallery components carry their gallery `tab` so a hit jumps straight to that
  // Catalog view. builder_templates rows split by kind: page/shell kinds are the
  // Playground's drafts (jump → "playground"), the rest are governed templates
  // (jump → the "templates" manager). The pure index lives in command-search.
  const paletteComponents = items.map((r) => ({
    id: r.id,
    tab: r.tab,
    effectiveLabel: r.effectiveLabel,
    effectiveCategory: r.effectiveCategory,
    baseLabel: r.baseLabel,
  }));
  const isDraftKind = (k: string) =>
    k === "page_template" || k === "shell_header" || k === "shell_footer";
  const paletteDrafts = allTemplates
    .filter((t) => isDraftKind(t.kind))
    .map((t) => ({
      id: t.id,
      title: t.title,
      slug: t.slug,
      status: t.status,
      kind: t.kind,
    }));
  const paletteTemplates = allTemplates
    .filter((t) => !isDraftKind(t.kind))
    .map((t) => ({
      id: t.id,
      title: t.title,
      slug: t.slug,
      status: t.status,
      kind: t.kind,
    }));

  /** Jump to a catalog view from a palette result. For a gallery tab the target
   *  row is also pre-expanded (O9 expand set); special views (Playground /
   *  Templates) just activate — they own their own row state. The chosen view
   *  may not be in `viewTabs` if it's a gallery tab currently empty under the
   *  active filter, but setActiveTab is tolerant (currentView falls back). */
  const handlePaletteJump = (tab: string, rowId: string) => {
    setActiveTab(tab as CatalogView);
    if (!isSpecialTab(tab as CatalogView)) {
      // Gallery component — open its override editor (seed the form).
      const row = items.find((r) => r.id === rowId);
      if (row) startEdit(row);
    }
  };

  // O10 — jump from an All-index row to its owning Catalog view. Code/template
  // rows that ARE gallery items (have a real `tab`) jump to that gallery view
  // with the row pre-expanded; draft/template-only rows route to the Templates
  // manager. Mirrors handlePaletteJump's expand-on-arrival behavior.
  const handleAllIndexJump = (row: AllIndexRow) => {
    if (row.tab) {
      setActiveTab(row.tab as CatalogView);
      const gridRow = items.find((r) => r.id === row.id);
      if (gridRow) startEdit(gridRow);
      return;
    }
    setActiveTab("templates");
  };

  // D8 — jump from a Catalog-health issue to the offending row. A flagged row
  // that IS a live gallery item (its catalog id is in `items`) jumps to its tab
  // with the override editor pre-opened — mirroring handleAllIndexJump. Anything
  // else (a draft/non-gallery template) routes to the Templates manager. Reuses
  // the existing jump machinery; adds no new navigation surface.
  const handleHealthJump = (issue: CatalogHealthIssue) => {
    const gridRow = issue.rowId
      ? items.find((r) => r.id === issue.rowId)
      : undefined;
    if (gridRow) {
      setActiveTab(gridRow.tab as CatalogView);
      startEdit(gridRow);
      return;
    }
    setActiveTab("templates");
  };

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

      {/* D8 — Catalog-health triage strip. Sits ABOVE the views so orphaned
          categories, unsatisfiable bindings, dead weight, and asymmetric
          surfaces are the first thing a super-admin sees. Clicking an offending
          row jumps to it (reusing the gallery/manager jump). */}
      <CatalogHealthPanel report={healthReport} onJumpToIssue={handleHealthJump} />

      {viewTabs.length > 0 ? (
        <div
          role="tablist"
          aria-label="Catalog views"
          style={{ display: "flex", gap: 2, flexWrap: "wrap", borderBottom: `1px solid ${T.borderSoft}` }}
        >
          {viewTabs.map((view) => {
            const gallery = !isSpecialTab(view);
            const count = gallery ? rowsByTab.get(view as AddGalleryTab)?.length ?? 0 : null;
            const active = view === currentView;
            return (
              <button
                key={view}
                type="button"
                role="tab"
                data-testid={`lab-tab-${view}`}
                aria-selected={active}
                onClick={() => setActiveTab(view)}
                className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5DD3A0]/60"
                style={{
                  background: "transparent",
                  border: "none",
                  borderBottom: `2px solid ${active ? T.accent : "transparent"}`,
                  color: active ? T.ink : T.inkMuted,
                  fontSize: 13,
                  fontWeight: 600,
                  padding: "8px 13px",
                  marginBottom: -1,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                }}
              >
                {viewLabel(view)}
                {count !== null ? (
                  <span
                    style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      color: active ? T.accent : T.inkDim,
                      background: active ? "rgba(93,211,160,0.14)" : T.cardSoft,
                      borderRadius: 999,
                      padding: "1px 7px",
                      minWidth: 18,
                      textAlign: "center",
                    }}
                  >
                    {count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}

      {galleryView ? (
        <>
      {error ? (
        <div style={{ color: T.red, fontSize: 12 }}>{error}</div>
      ) : null}

      {toast ? (
        <LabToast action={toast.undo ?? undefined}>{toast.message}</LabToast>
      ) : null}

      {/* O7 — Filter preset strip */}
      <div
        role="group"
        aria-label="Filter presets"
        style={{
          display: "flex",
          gap: 6,
          alignItems: "center",
          flexWrap: "wrap",
          minHeight: 28,
        }}
      >
        {allPresets.map((preset) => {
          const active = stateMatchesPreset(currentFilterState(), preset);
          const isCustom = !BUILT_IN_PRESETS.some((b) => b.key === preset.key);
          return (
            <span
              key={preset.key}
              style={{ display: "inline-flex", alignItems: "center", gap: 0 }}
            >
              <button
                type="button"
                aria-pressed={active}
                title={`Apply preset: ${preset.label}`}
                onClick={() => applyPreset(preset)}
                style={{
                  fontSize: 11.5,
                  fontWeight: active ? 700 : 500,
                  padding: "3px 10px",
                  borderRadius: isCustom ? "999px 0 0 999px" : 999,
                  border: `1px solid ${active ? T.accent : T.border}`,
                  borderRight: isCustom ? "none" : undefined,
                  background: active ? T.accentBg : T.cardSoft,
                  color: active ? T.accent : T.inkMuted,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {preset.label}
              </button>
              {isCustom ? (
                <button
                  type="button"
                  aria-label={`Delete preset "${preset.label}"`}
                  title={`Delete preset "${preset.label}"`}
                  onClick={() => deletePreset(preset.key)}
                  style={{
                    fontSize: 11,
                    padding: "3px 7px",
                    borderRadius: "0 999px 999px 0",
                    border: `1px solid ${active ? T.accent : T.border}`,
                    borderLeft: "none",
                    background: active ? T.accentBg : T.cardSoft,
                    color: active ? T.accent : T.inkDim,
                    cursor: "pointer",
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              ) : null}
            </span>
          );
        })}

        {/* Save-as-preset action / inline form */}
        {savingPreset ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <input
              ref={presetInputRef}
              type="text"
              value={presetDraftLabel}
              onChange={(e) => setPresetDraftLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitSavePreset();
                if (e.key === "Escape") {
                  setSavingPreset(false);
                  setPresetDraftLabel("");
                }
              }}
              placeholder="Preset name…"
              aria-label="New preset name"
              style={{
                ...fieldStyle,
                fontSize: 11.5,
                padding: "3px 9px",
                width: 150,
                outline: "none",
              }}
            />
            <LabButton
              variant="soft"
              style={{ fontSize: 11.5, padding: "3px 10px" }}
              onClick={commitSavePreset}
              disabled={!presetDraftLabel.trim()}
            >
              Save
            </LabButton>
            <button
              type="button"
              onClick={() => {
                setSavingPreset(false);
                setPresetDraftLabel("");
              }}
              style={{
                background: "none",
                border: "none",
                color: T.inkDim,
                fontSize: 11.5,
                cursor: "pointer",
                padding: "3px 4px",
              }}
            >
              Cancel
            </button>
          </span>
        ) : (
          <button
            type="button"
            title="Save current filter as a preset"
            onClick={() => setSavingPreset(true)}
            style={{
              fontSize: 11.5,
              padding: "3px 10px",
              borderRadius: 999,
              border: `1px dashed ${T.border}`,
              background: "transparent",
              color: T.inkDim,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            + Save view
          </button>
        )}
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search components by name, category, or id…"
          aria-label="Search components"
          style={{ ...fieldStyle, flex: 1, minWidth: 240, outline: "none" }}
        />
        <PillToggle
          size="sm"
          ariaLabel="Filter components"
          value={filterMode}
          onChange={(v) => {
            setFilterMode(v);
            saveActivePresetKey(null);
          }}
          options={[
            { key: "all", label: "All" },
            { key: "hidden", label: "Hidden" },
            { key: "customized", label: "Customized" },
          ]}
        />
      </div>

      {currentView === "connected" ? (
        <SurfaceSwitcher
          options={CONNECTED_DATA_GROUPS}
          value={connectedSurface}
          onChange={setConnectedSurface}
          ariaLabel="Connected data surface"
        />
      ) : null}

      {rowGroups.length === 0 ? (
        <EmptyCard>
          {query || filterMode !== "all" ? (
            <>
              No {viewLabel(currentView)} components
              {query ? ` matching “${query}”` : ""}
              {filterMode !== "all" ? ` (${filterMode})` : ""}. Clear the search
              or filter to see the full catalog.
            </>
          ) : (
            <>No {viewLabel(currentView)} components in the catalog yet.</>
          )}
        </EmptyCard>
      ) : (
        <>
        {/* O9 — group-header expand-all / collapse-all over the listed rows.
            Multiple override editors stay open side-by-side; this toggles them
            as a batch. */}
        <div
          role="group"
          aria-label="Edit accordion controls"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: 11.5, color: T.inkDim }}>
            {visibleExpandedCount > 0
              ? `${visibleExpandedCount} of ${visibleRowIds.length} editor${
                  visibleRowIds.length === 1 ? "" : "s"
                } open`
              : `${visibleRowIds.length} component${
                  visibleRowIds.length === 1 ? "" : "s"
                }`}
          </span>
          <span style={{ display: "inline-flex", gap: 6 }}>
            <LabButton
              variant="soft"
              testId="lab-catalog-expand-all"
              style={{ fontSize: 11.5, padding: "3px 10px" }}
              onClick={onExpandAllVisible}
              disabled={allVisibleExpanded}
            >
              Expand all
            </LabButton>
            <LabButton
              variant="soft"
              testId="lab-catalog-collapse-all"
              style={{ fontSize: 11.5, padding: "3px 10px" }}
              onClick={onCollapseAllVisible}
              disabled={visibleExpandedCount === 0}
            >
              Collapse all
            </LabButton>
          </span>
        </div>
        <CatalogRowTable
          groups={rowGroups}
          humanize={humanize}
          pendingId={pendingId}
          // O9 — multi-open: editingId is unused (adapter drives which rows
          // open); the flat *placeholder* edit-form props satisfy the required
          // prop contract but are overridden PER-ROW by `multiEdit.formFor`.
          editingId={null}
          multiEdit={{
            isExpanded: (id) => expandedIds.has(id),
            formFor: formBundleFor,
            closeRow: closeEdit,
          }}
          {...PLACEHOLDER_EDIT_FORM_PROPS}
          confirmingResetId={confirmingResetId}
          onRowClick={toggleEdit}
          onToggleSurface={toggleSurface}
          onToggleLab={toggleLab}
          onSetStatus={setStatus}
          onSaveEdit={saveEdit}
          // Legacy single-editor cancel (unused under multi-open — the per-row
          // Cancel routes through multiEdit.closeRow); collapse all as a sane
          // fallback should the adapter ever be absent.
          onCancelEdit={onCollapseAllVisible}
          onConfirmReset={confirmReset}
          onStartReset={startResetOptimistic}
          onCancelReset={() => setConfirmingResetId(null)}
          onReverted={reload}
          onPreview={(r) => {
            const meta = {
              id: r.id,
              label: r.effectiveLabel,
              category: humanize(r.effectiveCategory),
              talentVisible: r.talentVisible,
              workspaceVisible: r.workspaceVisible,
            };
            if (r.source === "template") {
              // Persisted templates need a server round-trip to load builder_tree.
              void buildTemplateItemPreview(meta).then((p) => onPreviewComponent?.(p));
              return;
            }
            onPreviewComponent?.(
              buildCatalogItemPreview({ ...meta, source: r.source }),
            );
          }}
        />
        </>
      )}

      <p style={{ fontSize: 11.5, color: T.inkDim, lineHeight: 1.5, margin: 0 }}>
        Toggles control per-surface visibility (subtract-only — a component can&apos;t be forced onto a
        surface its <code>target_context</code> excludes; locked cells show that). Renames apply to both
        builders&apos; &quot;+&quot; gallery on next open. Built-in components can be hidden, renamed,
        re-iconed, or plan-gated here; changing their internal structure is a code change.
      </p>
        </>
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
      ) : (
        <SiteStarterKitView onLaunchEditor={onLaunchEditor} />
      )}
    </div>
  );
}
