"use client";

/* eslint-disable max-lines -- Builder Lab catalog control-plane: 7-tab inventory
   (component categories + Site Starter Kit / Site Defaults / Playground views).
   Splitting the row table into its own component is a tracked follow-up. */

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

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";

import {
  ADD_GALLERY_CATEGORIES,
  type AddGalleryNativeVariant,
  type AddGalleryTab,
  type CatalogAdminItem,
  type CatalogOverlayRow,
} from "@/lib/site-admin/add-gallery";
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
import { createTemplateDraft } from "@/lib/site-admin/builder-core/templates/registry-actions";
import { createPlaygroundDraftFromDesign } from "@/lib/site-admin/builder-core/lab/create-draft-from-design";
import { listAllTemplates } from "@/lib/site-admin/builder-core/templates/registry-admin-actions";
import type {
  BuilderGalleryTab,
  BuilderTemplateKind,
  BuilderTemplateRow,
  BuilderTemplateStatus,
  BuilderTemplateTarget,
} from "@/lib/site-admin/builder-core/templates/registry-rows";
import { AddGalleryIcon } from "@/components/edit-chrome/add-gallery/add-gallery-icons";
import {
  PAGE_DESIGN_SUMMARIES,
  type PageDesignSummary,
} from "@/lib/site-admin/builder-node/page-designs/summaries";
import { SiteDefaultsEditor } from "./site-defaults-editor";
import { CatalogStudioView } from "./catalog-studio";
import { SurfaceSwitcher } from "./surface-switcher";
import type { BuilderLabTarget } from "./builder-lab-stage";
import {
  buildCatalogItemPreview,
  type CatalogItemPreview,
} from "./component-preview-stage";
import {
  LAB as T,
  RADII,
  fieldStyle,
  panelStyle,
  LabButton,
  LabBadge,
  PillToggle,
  SectionLabel,
  EmptyCard,
} from "./ui";

// Single source — derived from the Builder Studio catalog-structure resolver
// (was duplicated with add-gallery-panel.tsx's TAB_DEFS). WS-B threads loaded
// structure for admin tab rename/reorder; code defaults verbatim otherwise.
const ALL_TABS: ReadonlyArray<AddGalleryTab> = CODE_TAB_DEFS.map((t) => t.id);
const TAB_LABEL = Object.fromEntries(
  CODE_TAB_DEFS.map((t) => [t.id, t.label]),
) as Record<AddGalleryTab, string>;

// Special (non-gallery) Catalog views shown after the component categories.
const SPECIAL_TABS = [
  "catalog_studio",
  "site_starter_kit",
  "site_defaults",
  "playground",
] as const;
type SpecialTab = (typeof SPECIAL_TABS)[number];
type CatalogView = AddGalleryTab | SpecialTab;
const VIEW_LABEL: Record<CatalogView, string> = {
  ...TAB_LABEL,
  catalog_studio: "Catalog Studio",
  site_starter_kit: "Site Starter Kit",
  site_defaults: "Site Defaults",
  playground: "Playground",
};
function isSpecialTab(v: CatalogView): v is SpecialTab {
  return (SPECIAL_TABS as readonly string[]).includes(v);
}

const CATEGORY_LABEL = new Map(
  ADD_GALLERY_CATEGORIES.map((c) => [c.id, c.label] as const),
);

// C3 — selectable admin "default variant" values. The native preset variants the
// insert composer (applyNativeVariant) recognizes, sans "default" (= no variant).
// A free-form value still round-trips (only applied when it matches the node's
// kind), but the select keeps the common set one click away.
const DEFAULT_VARIANT_OPTIONS: ReadonlyArray<AddGalleryNativeVariant> = [
  "title",
  "subtitle",
  "intro",
  "caption",
  "badge",
  "quote",
  "text-link",
  "icon-button",
  "download-link",
  "cover-image",
  "logo",
  "stack",
  "row",
  "card-group",
  "grid",
  "image-card",
  "icon-card",
  "profile-card",
  "service-card",
  "testimonial-card",
  "cta-card",
  "breadcrumb",
  "youtube",
];

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

function targetAllows(
  targetContext: CatalogAdminItem["targetContext"],
  surface: "talent" | "workspace",
): boolean {
  if (targetContext === "both") return true;
  return targetContext === surface;
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
    setTimeout(() => setToast(null), 2400);
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

  const toggleSurface = useCallback(
    (item: CatalogAdminItem, surface: "talent" | "workspace") => {
      const enabledNow =
        surface === "talent"
          ? item.overlay?.talent_enabled ?? true
          : item.overlay?.workspace_enabled ?? true;
      const field = surface === "talent" ? "talent_enabled" : "workspace_enabled";
      const next = !enabledNow;
      // W11 — optimistic flip so the cell updates instantly; mutate() reloads
      // and reconciles against server truth (reverting on error).
      setItems((prev) =>
        prev
          ? prev.map((r) => {
              if (r.id !== item.id) return r;
              const overlay: CatalogOverlayRow = {
                item_ref: r.id,
                source: r.source as "code" | "template",
                talent_enabled: r.overlay?.talent_enabled ?? true,
                workspace_enabled: r.overlay?.workspace_enabled ?? true,
                label_override: r.overlay?.label_override ?? null,
                icon_override: r.overlay?.icon_override ?? null,
                category_override: r.overlay?.category_override ?? null,
                required_plan_override: r.overlay?.required_plan_override ?? null,
                availability_override: r.overlay?.availability_override ?? null,
                [field]: next,
              };
              return {
                ...r,
                overlay,
                talentVisible:
                  surface === "talent"
                    ? targetAllows(r.targetContext, "talent") && next
                    : r.talentVisible,
                workspaceVisible:
                  surface === "workspace"
                    ? targetAllows(r.targetContext, "workspace") && next
                    : r.workspaceVisible,
              };
            })
          : prev,
      );
      void mutate(item.id, () =>
        setComponentOverlay({
          item_ref: item.id,
          source: item.source,
          [field]: next,
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

  const { presentTabs, rowsByTab } = useMemo(() => {
    const empty = {
      presentTabs: [] as AddGalleryTab[],
      rowsByTab: new Map<AddGalleryTab, CatalogAdminItem[]>(),
    };
    if (!items) return empty;
    const q = query.trim().toLowerCase();
    const matches = (r: CatalogAdminItem) => {
      if (filterMode === "customized" && !r.overlay) return false;
      if (filterMode === "hidden" && r.talentVisible && r.workspaceVisible) {
        return false;
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

      {toast ? (
        <div
          role="status"
          style={{
            fontSize: 12,
            color: T.accent,
            background: "rgba(93,211,160,0.10)",
            padding: "6px 12px",
            borderRadius: 8,
          }}
        >
          {toast}
        </div>
      ) : null}

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
        <div style={{ color: T.inkMuted, fontSize: 13, padding: "12px 0" }}>
          No {viewLabel(currentView)} components
          {query ? ` matching “${query}”` : ""}
          {filterMode !== "all" ? ` (${filterMode})` : ""}.
        </div>
      ) : null}

      {rowGroups.map((group) => (
        <section key={group.key} style={{ ...panelStyle, overflow: "hidden" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "11px 16px",
              borderBottom: `1px solid ${T.borderSoft}`,
              background: T.cardSoft,
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>
              {group.label}
            </span>
            <span style={{ fontSize: 11.5, color: T.inkMuted }}>
              {group.rows.length} component{group.rows.length === 1 ? "" : "s"}
            </span>
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr style={{ color: T.inkDim }}>
                <Th>Component</Th>
                <Th>Category</Th>
                <Th>Source</Th>
                <Th center>Talent-Max</Th>
                <Th center>Workspace</Th>
                <Th right>Manage</Th>
              </tr>
            </thead>
            <tbody>
              {group.rows.map((r) => {
                const busy = pendingId === r.id;
                const editing = editingId === r.id;
                const isTemplate = r.source === "template";
                return (
                  <Fragment key={r.id}>
                  <tr
                    data-testid={`lab-catalog-row-${r.id}`}
                    onClick={(e) => {
                      // Click anywhere on the row (except an interactive control)
                      // to toggle its override accordion.
                      if (
                        (e.target as HTMLElement).closest(
                          "button, input, a, select, textarea",
                        )
                      )
                        return;
                      if (editing) setEditingId(null);
                      else startEdit(r);
                    }}
                    style={{
                      borderTop: `1px solid ${T.borderSoft}`,
                      opacity: busy ? 0.55 : 1,
                      cursor: "pointer",
                    }}
                  >
                    <td style={{ padding: "9px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span
                          style={{
                            width: 26,
                            height: 26,
                            borderRadius: 7,
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background: "rgba(93,211,160,0.10)",
                            color: T.accent,
                            flexShrink: 0,
                          }}
                        >
                          <AddGalleryIcon name={r.overlay?.icon_override ?? r.baseIcon} size="sm" tone="accent" />
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ color: T.ink, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                            {r.effectiveLabel}
                            {r.overlay ? (
                              <span title="Has admin overrides" style={{ width: 6, height: 6, borderRadius: "50%", background: T.accent, flexShrink: 0 }} />
                            ) : null}
                          </div>
                          <div style={{ color: T.inkDim, fontSize: 10.5, fontFamily: "ui-monospace, monospace" }}>
                            {r.id}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: "9px 16px", color: T.inkMuted }}>
                      {humanize(r.effectiveCategory)}
                    </td>
                    <td style={{ padding: "9px 16px" }}>
                      <Badge text={isTemplate ? "Template" : "Code"} tone={isTemplate ? "accent" : "neutral"} />
                      {isTemplate && r.status !== "published" ? (
                        <span
                          style={{
                            marginLeft: 6,
                            fontSize: 9,
                            fontWeight: 700,
                            letterSpacing: 0.4,
                            textTransform: "uppercase",
                            padding: "2px 6px",
                            borderRadius: 999,
                            color: r.status === "in_review" ? "#9BA8B7" : T.inkDim,
                            background: "rgba(255,255,255,0.06)",
                          }}
                        >
                          {r.status.replace("_", " ")}
                        </span>
                      ) : null}
                      {isTemplate ? (
                        <span style={{ marginLeft: 6, color: T.inkDim, fontSize: 10.5 }}>{r.targetContext}</span>
                      ) : null}
                    </td>
                    <ToggleCell
                      on={r.talentVisible}
                      disabled={busy || !targetAllows(r.targetContext, "talent")}
                      locked={!targetAllows(r.targetContext, "talent")}
                      onClick={() => toggleSurface(r, "talent")}
                      label={r.effectiveLabel}
                      surface="Talent-Max"
                    />
                    <ToggleCell
                      on={r.workspaceVisible}
                      disabled={busy || !targetAllows(r.targetContext, "workspace")}
                      locked={!targetAllows(r.targetContext, "workspace")}
                      onClick={() => toggleSurface(r, "workspace")}
                      label={r.effectiveLabel}
                      surface="Workspace"
                    />
                    <td style={{ padding: "9px 16px", textAlign: "right", whiteSpace: "nowrap" }}>
                      {editing ? (
                        <span style={{ display: "inline-flex", gap: 6 }}>
                          <LinkBtn label="Save" testId={`lab-catalog-row-save-${r.id}`} onClick={() => saveEdit(r)} disabled={busy} primary />
                          <LinkBtn label="Cancel" onClick={() => setEditingId(null)} disabled={busy} />
                        </span>
                      ) : confirmingResetId === r.id ? (
                        <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                          <span style={{ fontSize: 11, color: T.inkMuted }}>Reset to default?</span>
                          <LinkBtn label="Yes" onClick={() => confirmReset(r)} disabled={busy} primary />
                          <LinkBtn label="No" onClick={() => setConfirmingResetId(null)} disabled={busy} />
                        </span>
                      ) : (
                        <span style={{ display: "inline-flex", gap: 10 }}>
                          <LinkBtn
                            label="Preview"
                            onClick={() =>
                              onPreviewComponent?.(
                                buildCatalogItemPreview({
                                  id: r.id,
                                  source: r.source,
                                  label: r.effectiveLabel,
                                  category: humanize(r.effectiveCategory),
                                  talentVisible: r.talentVisible,
                                  workspaceVisible: r.workspaceVisible,
                                }),
                              )
                            }
                            disabled={busy}
                          />
                          {r.overlay ? (
                            <LinkBtn label="Reset" onClick={() => setConfirmingResetId(r.id)} disabled={busy} />
                          ) : null}
                        </span>
                      )}
                    </td>
                  </tr>
                    {editing ? (
                      <tr style={{ background: T.cardSoft }}>
                        <td colSpan={6} style={{ padding: "10px 16px" }}>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
                            <Field label="Display name (override)">
                              <input
                                value={editLabel}
                                onChange={(e) => setEditLabel(e.target.value)}
                                placeholder={r.baseLabel}
                                style={inputStyle}
                              />
                            </Field>
                            <Field label="Category (override)">
                              <input
                                value={editCategory}
                                onChange={(e) => setEditCategory(e.target.value)}
                                placeholder={r.baseCategory}
                                style={inputStyle}
                              />
                            </Field>
                            <Field label="Icon (override)">
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span
                                  style={{
                                    width: 26,
                                    height: 26,
                                    borderRadius: 7,
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    background: "rgba(93,211,160,0.10)",
                                    color: T.accent,
                                    flexShrink: 0,
                                  }}
                                >
                                  <AddGalleryIcon name={editIcon.trim() || r.baseIcon} size="sm" tone="accent" />
                                </span>
                                <input
                                  value={editIcon}
                                  onChange={(e) => setEditIcon(e.target.value)}
                                  placeholder={r.baseIcon}
                                  style={{ ...inputStyle, width: 150 }}
                                />
                              </div>
                            </Field>
                            <Field label="Required plan (tighten only)">
                              <select
                                value={editPlan}
                                onChange={(e) => setEditPlan(e.target.value)}
                                style={{ ...inputStyle, width: 150 }}
                              >
                                <option value="">— default —</option>
                                <option value="free">free</option>
                                <option value="studio">studio</option>
                                <option value="agency">agency</option>
                                <option value="network">network</option>
                              </select>
                            </Field>
                            <Field label="Locked props (tenant can't edit)">
                              <input
                                data-testid="lab-catalog-edit-locked-props"
                                value={editLockedProps}
                                onChange={(e) => setEditLockedProps(e.target.value)}
                                placeholder="e.g. tone, style.textColor"
                                style={{ ...inputStyle, width: 260 }}
                              />
                            </Field>
                            <Field label="Default variant">
                              <select
                                value={editDefaultVariant}
                                onChange={(e) => setEditDefaultVariant(e.target.value)}
                                style={{ ...inputStyle, width: 170 }}
                              >
                                <option value="">— default —</option>
                                {DEFAULT_VARIANT_OPTIONS.map((v) => (
                                  <option key={v} value={v}>
                                    {v}
                                  </option>
                                ))}
                              </select>
                            </Field>
                            <Field label="Default props (JSON)">
                              <textarea
                                data-testid="lab-catalog-edit-default-props"
                                value={editDefaultProps}
                                onChange={(e) => {
                                  setEditDefaultProps(e.target.value);
                                  if (editDefaultPropsError) setEditDefaultPropsError(null);
                                }}
                                placeholder={'{\n  "tone": "primary"\n}'}
                                spellCheck={false}
                                rows={4}
                                style={{
                                  ...inputStyle,
                                  width: 300,
                                  minHeight: 76,
                                  fontFamily: "ui-monospace, monospace",
                                  resize: "vertical",
                                  borderColor: editDefaultPropsError ? T.red : undefined,
                                }}
                              />
                              {editDefaultPropsError ? (
                                <span style={{ fontSize: 10.5, color: T.red }}>
                                  {editDefaultPropsError}
                                </span>
                              ) : null}
                            </Field>
                            <Field label="Data-source defaults (JSON)">
                              <textarea
                                value={editDataSourceDefaults}
                                onChange={(e) => {
                                  setEditDataSourceDefaults(e.target.value);
                                  if (editDataSourceDefaultsError) {
                                    setEditDataSourceDefaultsError(null);
                                  }
                                }}
                                placeholder={'{\n  "maxItems": 6\n}'}
                                spellCheck={false}
                                rows={4}
                                style={{
                                  ...inputStyle,
                                  width: 300,
                                  minHeight: 76,
                                  fontFamily: "ui-monospace, monospace",
                                  resize: "vertical",
                                  borderColor: editDataSourceDefaultsError ? T.red : undefined,
                                }}
                              />
                              {editDataSourceDefaultsError ? (
                                <span style={{ fontSize: 10.5, color: T.red }}>
                                  {editDataSourceDefaultsError}
                                </span>
                              ) : null}
                            </Field>
                            <span style={{ fontSize: 11, color: T.inkDim }}>
                              Blank = built-in default. Icon names match the gallery icon set. Plan only
                              tightens (never widens). <strong>Locked props</strong> are dot-paths
                              (comma-separated) the tenant can&apos;t change once inserted — the look stays
                              on-brand, they still edit the copy. <strong>Default variant</strong> picks the
                              native preset applied at insert (when the item has no built-in variant).{" "}
                              <strong>Default props</strong> (a JSON object) are deep-merged over the
                              component&apos;s defaults at insert (arrays replaced) — the admin&apos;s
                              canonical starting content. <strong>Data-source defaults</strong> (a JSON
                              object, e.g. <code>{"{ \"maxItems\": 6 }"}</code>) are merged into a connected
                              component&apos;s <code>dataBinding</code> at insert. Reflected in both
                              builders on next open.
                            </span>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </section>
      ))}

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
      ) : currentView === "playground" ? (
        <PlaygroundView onLaunchEditor={onLaunchEditor} />
      ) : (
        <SiteStarterKitView onLaunchEditor={onLaunchEditor} />
      )}
    </div>
  );
}

// ── Site Starter Kit ──────────────────────────────────────────────────────────

const STARTER_KIT_GROUPS = [
  {
    key: "workspace" as const,
    label: "Agency Starter Kit",
    blurb: "Full-page starts for an agency / workspace storefront.",
  },
  {
    key: "talent" as const,
    label: "Talent Starter Kit",
    blurb: "Full-page starts for a single talent's Max page.",
  },
];

/** A design belongs to a surface group when it targets that surface or "both". */
function designsForSurface(
  surface: "talent" | "workspace",
): PageDesignSummary[] {
  return PAGE_DESIGN_SUMMARIES.filter(
    (d) => d.target === surface || d.target === "both",
  );
}

/**
 * Site Starter Kit (Catalog) — the full-page starter designs. The shared
 * SurfaceSwitcher shows one kit at a time (Agency / Talent), matching Site
 * Defaults; "both"-target designs appear in both. "Use this starter" creates a
 * Playground draft seeded with the chosen design's baked tree (server-side) and
 * opens the editor on it.
 */
function SiteStarterKitView({
  onLaunchEditor,
}: {
  onLaunchEditor?: (target: BuilderLabTarget, draftId?: string) => void;
}) {
  const [surface, setSurface] = useState<"talent" | "workspace">("workspace");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startFromDesign = useCallback(
    async (design: PageDesignSummary) => {
      setBusyId(design.id);
      setError(null);
      const res = await createPlaygroundDraftFromDesign({
        designId: design.id,
        target: surface,
      });
      setBusyId(null);
      if (res.ok) {
        onLaunchEditor?.(surface, res.draftId);
      } else {
        setError(res.error);
      }
    },
    [onLaunchEditor, surface],
  );

  const group = STARTER_KIT_GROUPS.find((g) => g.key === surface);
  const designs = designsForSurface(surface);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <SurfaceSwitcher
        options={STARTER_KIT_GROUPS}
        value={surface}
        onChange={setSurface}
        ariaLabel="Starter kit surface"
      />
      {group ? (
        <div style={{ fontSize: 12, color: T.inkMuted }}>{group.blurb}</div>
      ) : null}
      {error ? <div style={{ fontSize: 12, color: T.red }}>{error}</div> : null}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          gap: 12,
        }}
      >
        {designs.map((d) => (
          <StarterKitCard
            key={d.id}
            design={d}
            busy={busyId === d.id}
            onUse={() => void startFromDesign(d)}
          />
        ))}
      </div>
    </div>
  );
}

function StarterKitCard({
  design,
  busy,
  onUse,
}: {
  design: PageDesignSummary;
  busy?: boolean;
  onUse: () => void;
}) {
  return (
    <div
      style={{
        ...panelStyle,
        padding: 14,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>{design.label}</span>
        <LabBadge tone="muted">{design.archetype}</LabBadge>
      </div>
      <p style={{ fontSize: 11.5, color: T.inkMuted, lineHeight: 1.5, margin: 0, flex: 1 }}>
        {design.description}
      </p>
      <LabButton
        variant="soft"
        disabled={busy}
        onClick={onUse}
        style={{ alignSelf: "flex-start" }}
      >
        {busy ? "Creating…" : "Use this starter →"}
      </LabButton>
    </div>
  );
}

// ── Playground ────────────────────────────────────────────────────────────────

/** A "+ New" draft recipe — the kind/tab/seed metadata for `createTemplateDraft`.
 *  Page-template targets vary by surface; shell templates are platform-authored
 *  header/footer drafts that apply to a tenant's site_shell. */
type PlaygroundNewSpec = {
  kind: BuilderTemplateKind;
  target: BuilderLabTarget;
  gallery_tab: BuilderGalleryTab;
  category: string;
  titleSeed: string;
  slugSeed: string;
};

const PLAYGROUND_TARGETS: ReadonlyArray<{
  spec: PlaygroundNewSpec;
  label: string;
  blurb: string;
}> = [
  {
    spec: {
      kind: "page_template",
      target: "talent",
      gallery_tab: "page_templates",
      category: "playground",
      titleSeed: "Untitled draft",
      slugSeed: "playground",
    },
    label: "Talent page",
    blurb: "Author against a single talent's live data.",
  },
  {
    spec: {
      kind: "page_template",
      target: "workspace",
      gallery_tab: "page_templates",
      category: "playground",
      titleSeed: "Untitled draft",
      slugSeed: "playground",
    },
    label: "Workspace page",
    blurb: "Author against a workspace / hub.",
  },
  {
    spec: {
      kind: "page_template",
      target: "both",
      gallery_tab: "page_templates",
      category: "playground",
      titleSeed: "Untitled draft",
      slugSeed: "playground",
    },
    label: "Both",
    blurb: "A design for both surfaces — preview against a talent or a workspace.",
  },
  // A7 follow-up — shell (header/footer) templates. Platform-authored; they
  // surface ONLY on the shell-surface gallery and apply to a tenant's
  // site_shell row via applyShellTemplateToTenant. Authored against a workspace
  // preview subject (the shell hydrates against the tenant default).
  {
    spec: {
      kind: "shell_header",
      target: "workspace",
      gallery_tab: "shell",
      category: "shell",
      titleSeed: "Untitled header",
      slugSeed: "shell-header",
    },
    label: "Shell header",
    blurb: "A reusable site header — apply it to a tenant's shell.",
  },
  {
    spec: {
      kind: "shell_footer",
      target: "workspace",
      gallery_tab: "shell",
      category: "shell",
      titleSeed: "Untitled footer",
      slugSeed: "shell-footer",
    },
    label: "Shell footer",
    blurb: "A reusable site footer — apply it to a tenant's shell.",
  },
];

const PLAYGROUND_STATUS_FILTERS: ReadonlyArray<{
  key: "all" | BuilderTemplateStatus;
  label: string;
}> = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "in_review", label: "In Review" },
  { key: "published", label: "Published" },
  { key: "archived", label: "Archived" },
];

const STATUS_TONE: Record<BuilderTemplateStatus, { bg: string; fg: string }> = {
  draft: { bg: "rgba(255,255,255,0.07)", fg: T.inkMuted },
  in_review: { bg: "rgba(155,168,183,0.16)", fg: "#9BA8B7" },
  published: { bg: "rgba(93,211,160,0.16)", fg: T.accent },
  archived: { bg: "rgba(255,255,255,0.05)", fg: T.inkDim },
};

/** builder_templates target_context → the editor's launch target. */
function targetToLabTarget(t: BuilderTemplateTarget): BuilderLabTarget {
  return t === "talent" || t === "workspace" ? t : "both";
}

/**
 * Playground (Phase 3) — the workbench. A persistent list of your full-page
 * drafts (builder_templates, kind=page_template) with status pills. "+ New"
 * creates a draft for the picked target and opens it; clicking a draft reopens
 * it. The editor binds to the draft id, so edits persist and Publish promotes
 * the draft into the page-templates gallery — the live builders' "+" Add →
 * Page Templates tab (scoped by the draft's target_context).
 */
function PlaygroundView({
  onLaunchEditor,
}: {
  onLaunchEditor?: (target: BuilderLabTarget, draftId?: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [drafts, setDrafts] = useState<BuilderTemplateRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | BuilderTemplateStatus>(
    "all",
  );
  const [creating, setCreating] = useState(false);

  const reload = useCallback(async () => {
    const res = await listAllTemplates();
    if (res.ok) {
      // A7 follow-up — the Playground lists full-page drafts AND the shell
      // (header/footer) drafts, so a shell template can be authored + reopened
      // here just like a page template.
      setDrafts(
        res.data.filter(
          (t) =>
            t.kind === "page_template" ||
            t.kind === "shell_header" ||
            t.kind === "shell_footer",
        ),
      );
    } else {
      setError(res.error);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const createAndOpen = useCallback(
    async (spec: PlaygroundNewSpec) => {
      setMenuOpen(false);
      setCreating(true);
      setError(null);
      const stamp = Date.now().toString(36);
      const res = await createTemplateDraft({
        kind: spec.kind,
        title: spec.titleSeed,
        slug: `${spec.slugSeed}-${stamp}-${Math.random()
          .toString(36)
          .slice(2, 7)}`,
        category: spec.category,
        gallery_tab: spec.gallery_tab,
        target_context: spec.target,
      });
      setCreating(false);
      if (res.ok) {
        onLaunchEditor?.(spec.target, res.data.id);
      } else {
        setError(res.error);
      }
    },
    [onLaunchEditor],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: drafts?.length ?? 0 };
    for (const d of drafts ?? []) c[d.status] = (c[d.status] ?? 0) + 1;
    return c;
  }, [drafts]);

  const visible = (drafts ?? []).filter(
    (d) => statusFilter === "all" || d.status === statusFilter,
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>Playground</div>
          <div style={{ fontSize: 12, color: T.inkMuted, marginTop: 2 }}>
            Your workbench — full-page drafts. Start one, author against real data,
            then publish it into the page-templates gallery.
          </div>
        </div>

        <div style={{ position: "relative" }}>
          <button
            type="button"
            data-testid="lab-playground-new"
            onClick={() => setMenuOpen((v) => !v)}
            disabled={creating}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5DD3A0]/60"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              padding: "8px 16px",
              borderRadius: RADII.control,
              border: "none",
              background: T.accent,
              color: T.accentInk,
              fontSize: 13,
              fontWeight: 700,
              cursor: creating ? "default" : "pointer",
              opacity: creating ? 0.6 : 1,
            }}
          >
            {creating ? "Creating…" : "+ New"}
            <span aria-hidden style={{ fontSize: 9, opacity: 0.75 }}>
              {menuOpen ? "▲" : "▼"}
            </span>
          </button>

          {menuOpen ? (
            <div
              role="menu"
              aria-label="New draft target"
              style={{
                position: "absolute",
                top: "calc(100% + 6px)",
                right: 0,
                zIndex: 60,
                width: 320,
                maxWidth: "90vw",
                background: T.card,
                border: `1px solid ${T.border}`,
                borderRadius: 12,
                boxShadow: "0 18px 48px rgba(0,0,0,0.45)",
                padding: 8,
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: 0.6,
                  textTransform: "uppercase",
                  color: T.inkDim,
                  padding: "4px 8px 6px",
                }}
              >
                New draft — pick a target
              </div>
              {PLAYGROUND_TARGETS.map((opt) => (
                <button
                  key={`${opt.spec.kind}:${opt.spec.target}`}
                  type="button"
                  role="menuitem"
                  onClick={() => void createAndOpen(opt.spec)}
                  className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5DD3A0]/60"
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    background: "transparent",
                    border: "none",
                    borderRadius: 9,
                    padding: "9px 10px",
                    cursor: "pointer",
                    color: T.ink,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = T.cardSoft;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{opt.label}</div>
                  <div style={{ fontSize: 11.5, color: T.inkMuted, marginTop: 2, lineHeight: 1.4 }}>
                    {opt.blurb}
                  </div>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {/* Status pills */}
      <PillToggle
        size="sm"
        ariaLabel="Filter drafts by status"
        value={statusFilter}
        onChange={setStatusFilter}
        options={PLAYGROUND_STATUS_FILTERS.map((f) => ({
          key: f.key,
          label: f.label,
          count: counts[f.key] ?? 0,
        }))}
      />

      {error ? (
        <div style={{ fontSize: 12, color: T.red }}>{error}</div>
      ) : null}

      {drafts === null ? (
        <div style={{ color: T.inkMuted, fontSize: 13, padding: "10px 0" }}>Loading drafts…</div>
      ) : visible.length === 0 ? (
        <EmptyCard>
          {statusFilter === "all"
            ? "No drafts yet. Hit + New to start a full-page draft — it’s saved as you edit."
            : `No ${statusFilter.replace("_", " ")} drafts.`}
        </EmptyCard>
      ) : (
        <section style={{ ...panelStyle, overflow: "hidden" }}>
          {visible.map((d, i) => {
            const tone = STATUS_TONE[d.status];
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => onLaunchEditor?.(targetToLabTarget(d.target_context), d.id)}
                className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5DD3A0]/60"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  width: "100%",
                  textAlign: "left",
                  background: "transparent",
                  border: "none",
                  borderTop: i === 0 ? "none" : `1px solid ${T.borderSoft}`,
                  padding: "12px 16px",
                  cursor: "pointer",
                  color: T.ink,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = T.cardSoft;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {d.title || "Untitled draft"}
                  </div>
                  <div style={{ fontSize: 11, color: T.inkDim, marginTop: 2 }}>
                    Updated {new Date(d.updated_at).toLocaleDateString()} · v{d.version}
                  </div>
                </div>
                <LabBadge tone="muted" style={{ flexShrink: 0 }}>
                  {d.target_context}
                </LabBadge>
                <LabBadge tone="custom" bg={tone.bg} fg={tone.fg} style={{ flexShrink: 0 }}>
                  {d.status.replace("_", " ")}
                </LabBadge>
                <span aria-hidden style={{ color: T.inkDim, fontSize: 14, flexShrink: 0 }}>›</span>
              </button>
            );
          })}
        </section>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = { ...fieldStyle, width: 220 };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 10, color: T.inkMuted, letterSpacing: 0.4, textTransform: "uppercase" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function Th({ children, center, right }: { children: React.ReactNode; center?: boolean; right?: boolean }) {
  return (
    <th
      style={{
        padding: "9px 16px",
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 0.8,
        textTransform: "uppercase",
        textAlign: center ? "center" : right ? "right" : "left",
      }}
    >
      {children}
    </th>
  );
}

function Badge({ text, tone }: { text: string; tone: "accent" | "neutral" }) {
  return <LabBadge tone={tone}>{text}</LabBadge>;
}

function ToggleCell({
  on,
  disabled,
  locked,
  onClick,
  label,
  surface,
}: {
  on: boolean;
  disabled: boolean;
  locked: boolean;
  onClick: () => void;
  label: string;
  surface: string;
}) {
  const title = locked
    ? "Not targeted to this surface"
    : on
      ? "Visible — click to hide"
      : "Hidden — click to show";
  return (
    <td style={{ padding: "9px 16px", textAlign: "center" }}>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        title={title}
        aria-pressed={on}
        aria-label={`${label} on ${surface}: ${locked ? "not available" : on ? "visible" : "hidden"}`}
        className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5DD3A0]/60"
        style={{
          cursor: disabled ? "default" : "pointer",
          border: `1px solid ${on ? "rgba(93,211,160,0.45)" : T.border}`,
          background: on ? "rgba(93,211,160,0.16)" : "transparent",
          color: locked ? T.no : on ? T.yes : T.inkMuted,
          borderRadius: 999,
          padding: "3px 11px",
          fontSize: 11,
          fontWeight: 700,
          minWidth: 52,
        }}
      >
        {locked ? "—" : on ? "On" : "Off"}
      </button>
    </td>
  );
}

function LinkBtn({
  label,
  onClick,
  disabled,
  primary,
  testId,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  /** QA harness — optional inert data-testid for browser automation. */
  testId?: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
      className="rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5DD3A0]/60"
      style={{
        background: "transparent",
        border: "none",
        color: disabled ? T.inkDim : primary ? T.accent : T.inkMuted,
        fontSize: 12,
        fontWeight: 600,
        cursor: disabled ? "default" : "pointer",
        padding: 0,
      }}
    >
      {label}
    </button>
  );
}
