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

import { useCallback, useEffect, useMemo, useState } from "react";

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
import { CatalogRowTable, targetAllows } from "./catalog-row-table";
import { PlaygroundView } from "./catalog-playground";
import { SiteStarterKitView } from "./catalog-starter-kit";
import { CatalogActivityFeed } from "./catalog-activity-feed";
import { TemplateManager } from "./template-manager";
import { ParityProbePanel } from "./parity-probe-panel";
import { TaxonomyManagerPanel } from "./taxonomy-manager-panel";
import type { BuilderLabTarget } from "./builder-lab-stage";
import {
  buildCatalogItemPreview,
  buildTemplateItemPreview,
  type CatalogItemPreview,
} from "./component-preview-stage";
import {
  LAB as T,
  fieldStyle,
  PillToggle,
  LabToast,
  EmptyCard,
} from "./ui";

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

// Special (non-gallery) Catalog views shown after the component categories.
const SPECIAL_TABS = [
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
const VIEW_LABEL: Record<CatalogView, string> = {
  ...TAB_LABEL,
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editIcon, setEditIcon] = useState("");
  const [editPlan, setEditPlan] = useState("");
  const [editLockedProps, setEditLockedProps] = useState("");
  const [editDefaultVariant, setEditDefaultVariant] = useState("");
  const [editDefaultProps, setEditDefaultProps] = useState("");
  const [editDefaultPropsError, setEditDefaultPropsError] = useState<string | null>(
    null,
  );
  const [editDataSourceDefaults, setEditDataSourceDefaults] = useState("");
  const [editDataSourceDefaultsError, setEditDataSourceDefaultsError] = useState<
    string | null
  >(null);
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
  // W11 — transient success toast.
  const [toast, setToast] = useState<string | null>(null);
  // QA harness — flips to true after mount so browser automation can wait for
  // hydration (data-hydrated="true" on the catalog root) before clicking tabs,
  // fixing the clicks-before-React-attaches race. Inert; no behavior change.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), T.toastMs);
  }, []);

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
    return () => {
      cancelled = true;
    };
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
      void mutate(item.id, () =>
        setComponentOverlay({
          item_ref: item.id,
          source: item.source,
          [column]: nextFour[surfaceKey],
          talent_enabled: legacyTalent,
          workspace_enabled: legacyWorkspace,
        }),
      );
    },
    [mutate],
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
      void mutate(item.id, () =>
        setComponentOverlay({
          item_ref: item.id,
          source: item.source,
          lab_enabled: nextLab,
        }),
      );
    },
    [mutate],
  );

  const startEdit = useCallback((item: CatalogAdminItem) => {
    setEditingId(item.id);
    setEditLabel(item.overlay?.label_override ?? "");
    setEditCategory(item.overlay?.category_override ?? "");
    setEditIcon(item.overlay?.icon_override ?? "");
    setEditPlan(item.overlay?.required_plan_override ?? "");
    setEditLockedProps((item.overlay?.locked_props ?? []).join(", "));
    setEditDefaultVariant(item.overlay?.default_variant ?? "");
    const dp = item.overlay?.default_props;
    setEditDefaultProps(dp ? JSON.stringify(dp, null, 2) : "");
    setEditDefaultPropsError(null);
    const dsd = item.overlay?.data_source_defaults;
    setEditDataSourceDefaults(dsd ? JSON.stringify(dsd, null, 2) : "");
    setEditDataSourceDefaultsError(null);
  }, []);

  const saveEdit = useCallback(
    (item: CatalogAdminItem) => {
      const dp = parseJsonObjectField(editDefaultProps, "Default props");
      if (!dp.ok) {
        // Invalid JSON → keep the editor open, show the inline error, don't save.
        setEditDefaultPropsError(dp.error);
        return;
      }
      const dsd = parseJsonObjectField(editDataSourceDefaults, "Data-source defaults");
      if (!dsd.ok) {
        setEditDataSourceDefaultsError(dsd.error);
        return;
      }
      setEditDefaultPropsError(null);
      setEditDataSourceDefaultsError(null);
      void mutate(item.id, () =>
        setComponentOverlay({
          item_ref: item.id,
          source: item.source,
          label_override: editLabel.trim() || null,
          category_override: editCategory.trim() || null,
          icon_override: editIcon.trim() || null,
          required_plan_override:
            (editPlan as "free" | "studio" | "agency" | "network" | "") || null,
          locked_props: parseLockedProps(editLockedProps),
          default_variant: editDefaultVariant.trim() || null,
          default_props: dp.value,
          data_source_defaults: dsd.value,
        }),
      ).then(() => {
        setEditingId(null);
        flash("Saved ✓");
      });
    },
    [
      mutate,
      editLabel,
      editCategory,
      editIcon,
      editPlan,
      editLockedProps,
      editDefaultVariant,
      editDefaultProps,
      editDataSourceDefaults,
      flash,
    ],
  );

  const confirmReset = useCallback(
    (item: CatalogAdminItem) => {
      setConfirmingResetId(null);
      void mutate(item.id, () => clearComponentOverlay(item.id)).then(() =>
        flash("Reset ✓"),
      );
    },
    [mutate, flash],
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
        void mutate(item.id, () =>
          setComponentOverlay({
            item_ref: item.id,
            source: item.source,
            availability_override: availability,
          }),
        ).then(() =>
          flash(next === "archived" ? "Archived" : "Published ✓"),
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
    [mutate, flash],
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
  // full-page role moves to the Site Starter Kit view), then the special views.
  const categoryTabs = presentTabs.filter((t) => t !== "page_templates");
  const viewTabs: CatalogView[] = [...categoryTabs, ...SPECIAL_TABS];
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

  return (
    <div
      data-testid="lab-catalog-root"
      data-hydrated={hydrated ? "true" : undefined}
      style={{ display: "flex", flexDirection: "column", gap: 16 }}
    >
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

      {toast ? <LabToast>{toast}</LabToast> : null}

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
          onChange={setFilterMode}
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
        <CatalogRowTable
          groups={rowGroups}
          humanize={humanize}
          pendingId={pendingId}
          editingId={editingId}
          confirmingResetId={confirmingResetId}
          editLabel={editLabel}
          setEditLabel={setEditLabel}
          editCategory={editCategory}
          setEditCategory={setEditCategory}
          editIcon={editIcon}
          setEditIcon={setEditIcon}
          editPlan={editPlan}
          setEditPlan={setEditPlan}
          editLockedProps={editLockedProps}
          setEditLockedProps={setEditLockedProps}
          editDefaultVariant={editDefaultVariant}
          setEditDefaultVariant={setEditDefaultVariant}
          editDefaultProps={editDefaultProps}
          setEditDefaultProps={setEditDefaultProps}
          editDefaultPropsError={editDefaultPropsError}
          setEditDefaultPropsError={setEditDefaultPropsError}
          editDataSourceDefaults={editDataSourceDefaults}
          setEditDataSourceDefaults={setEditDataSourceDefaults}
          editDataSourceDefaultsError={editDataSourceDefaultsError}
          setEditDataSourceDefaultsError={setEditDataSourceDefaultsError}
          onRowClick={(item) =>
            editingId === item.id ? setEditingId(null) : startEdit(item)
          }
          onToggleSurface={toggleSurface}
          onToggleLab={toggleLab}
          onSetStatus={setStatus}
          onSaveEdit={saveEdit}
          onCancelEdit={() => setEditingId(null)}
          onConfirmReset={confirmReset}
          onStartReset={(id) => setConfirmingResetId(id)}
          onCancelReset={() => setConfirmingResetId(null)}
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
      )}

      <p style={{ fontSize: 11.5, color: T.inkDim, lineHeight: 1.5, margin: 0 }}>
        Toggles control per-surface visibility (subtract-only — a component can&apos;t be forced onto a
        surface its <code>target_context</code> excludes; locked cells show that). Renames apply to both
        builders&apos; &quot;+&quot; gallery on next open. Built-in components can be hidden, renamed,
        re-iconed, or plan-gated here; changing their internal structure is a code change.
      </p>
        </>
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
