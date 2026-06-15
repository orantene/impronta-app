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
  type AddGalleryTab,
  type CatalogAdminItem,
  type CatalogOverlayRow,
} from "@/lib/site-admin/add-gallery";
import { loadCatalogAdminView } from "@/lib/site-admin/add-gallery/catalog-admin-view-action";
import {
  clearComponentOverlay,
  setComponentOverlay,
} from "@/lib/site-admin/builder-core/templates/catalog-overlay-actions";
import { AddGalleryIcon } from "@/components/edit-chrome/add-gallery/add-gallery-icons";
import { SiteDefaultsEditor } from "./site-defaults-editor";
import type { BuilderLabTarget } from "./builder-lab-stage";

const T = {
  card: "#16161A",
  cardSoft: "rgba(255,255,255,0.04)",
  border: "rgba(255,255,255,0.10)",
  borderSoft: "rgba(255,255,255,0.06)",
  ink: "#F5F2EB",
  inkMuted: "rgba(245,242,235,0.62)",
  inkDim: "rgba(245,242,235,0.38)",
  accent: "#5DD3A0",
  yes: "#5DD3A0",
  no: "rgba(245,242,235,0.28)",
  field: "#0F0F11",
};

const ALL_TABS: ReadonlyArray<AddGalleryTab> = [
  "layout",
  "elements",
  "sections",
  "connected",
  "page_templates",
];

const TAB_LABEL: Record<AddGalleryTab, string> = {
  layout: "Layout",
  elements: "Elements",
  sections: "Sections",
  connected: "Connected",
  page_templates: "Page Templates",
};

// Special (non-gallery) Catalog views shown after the component categories.
const SPECIAL_TABS = ["site_starter_kit", "site_defaults", "playground"] as const;
type SpecialTab = (typeof SPECIAL_TABS)[number];
type CatalogView = AddGalleryTab | SpecialTab;
const VIEW_LABEL: Record<CatalogView, string> = {
  ...TAB_LABEL,
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
// inquiry sources → "Agency Data". This is a DISPLAY grouping (derived from the
// stable `connectedSource`, not from target_context), so it never changes the
// real per-surface gating — that stays controlled by the Talent-Max / Workspace
// toggles on each row.
const CONNECTED_DATA_GROUPS = [
  { key: "talent", label: "Talent Data" },
  { key: "agency", label: "Agency Data" },
] as const;
type ConnectedDataGroup = (typeof CONNECTED_DATA_GROUPS)[number]["key"];

function connectedDataGroupOf(item: CatalogAdminItem): ConnectedDataGroup {
  const src = item.connectedSource ?? "";
  return src === "Talent Collection" || src === "Talent Directory"
    ? "talent"
    : "agency";
}

export function ComponentCatalog({
  onLaunchEditor,
  defaultView,
}: {
  /** Launch the editor from Playground's "+ New" against the chosen target. */
  onLaunchEditor?: (target: BuilderLabTarget) => void;
  /** Initial inner view — defaults to the first component tab; the shell passes
   *  "playground" so exiting the editor returns to the workbench. */
  defaultView?: CatalogView;
} = {}) {
  const [items, setItems] = useState<CatalogAdminItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editIcon, setEditIcon] = useState("");
  const [editPlan, setEditPlan] = useState("");
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
  // W11 — transient success toast.
  const [toast, setToast] = useState<string | null>(null);

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
  }, []);

  const saveEdit = useCallback(
    (item: CatalogAdminItem) => {
      void mutate(item.id, () =>
        setComponentOverlay({
          item_ref: item.id,
          source: item.source,
          label_override: editLabel.trim() || null,
          category_override: editCategory.trim() || null,
          icon_override: editIcon.trim() || null,
          required_plan_override:
            (editPlan as "free" | "studio" | "agency" | "network" | "") || null,
        }),
      ).then(() => {
        setEditingId(null);
        flash("Saved ✓");
      });
    },
    [mutate, editLabel, editCategory, editIcon, editPlan, flash],
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
    return <div style={{ color: "#ff8585", fontSize: 13 }}>{error}</div>;
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

  // The Connected view renders two labeled groups (Talent Data | Agency Data);
  // every other gallery view renders as a single group. Empty groups are dropped.
  const rowGroups: Array<{ key: string; label: string; rows: CatalogAdminItem[] }> = (
    currentView === "connected"
      ? CONNECTED_DATA_GROUPS.map((g) => ({
          key: g.key,
          label: g.label,
          rows: currentRows.filter((r) => connectedDataGroupOf(r) === g.key),
        }))
      : [{ key: String(currentView), label: VIEW_LABEL[currentView], rows: currentRows }]
  ).filter((g) => g.rows.length > 0);

  const total = items.length;
  const templates = items.filter((r) => r.source === "template").length;
  const overridden = items.filter((r) => r.overlay).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
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
                {VIEW_LABEL[view]}
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
      <div style={{ display: "flex", flexWrap: "wrap", gap: 18, fontSize: 12.5, alignItems: "flex-end" }}>
        <Stat label="Components" value={total} />
        <Stat label="Built-in (code)" value={total - templates} />
        <Stat label="Templates" value={templates} />
        <Stat label="Customized" value={overridden} />
        {error ? (
          <span style={{ color: "#ff8585", fontSize: 12 }}>{error}</span>
        ) : null}
      </div>

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
          style={{
            flex: 1,
            minWidth: 240,
            background: T.field,
            border: `1px solid ${T.border}`,
            borderRadius: 8,
            color: T.ink,
            fontSize: 12.5,
            padding: "8px 11px",
          }}
        />
        <div style={{ display: "inline-flex", background: T.cardSoft, borderRadius: 999, padding: 2 }}>
          {(["all", "hidden", "customized"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setFilterMode(m)}
              style={{
                background: filterMode === m ? T.ink : "transparent",
                color: filterMode === m ? "#0F0F11" : T.inkMuted,
                border: "none",
                fontSize: 11.5,
                fontWeight: 600,
                padding: "5px 13px",
                borderRadius: 999,
                cursor: "pointer",
                textTransform: "capitalize",
              }}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {currentRows.length === 0 ? (
        <div style={{ color: T.inkMuted, fontSize: 13, padding: "12px 0" }}>
          No {VIEW_LABEL[currentView]} components
          {query ? ` matching “${query}”` : ""}
          {filterMode !== "all" ? ` (${filterMode})` : ""}.
        </div>
      ) : null}

      {rowGroups.map((group) => (
        <section
          key={group.key}
          style={{
            background: T.card,
            border: `1px solid ${T.borderSoft}`,
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
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
                  <tr style={{ borderTop: `1px solid ${T.borderSoft}`, opacity: busy ? 0.55 : 1 }}>
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
                          <LinkBtn label="Save" onClick={() => saveEdit(r)} disabled={busy} primary />
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
                          <LinkBtn label="Edit" onClick={() => startEdit(r)} disabled={busy} />
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
                            <span style={{ fontSize: 11, color: T.inkDim }}>
                              Blank = built-in default. Icon names match the gallery icon set. Plan only
                              tightens (never widens). Reflected in both builders on next open.
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
      ) : currentView === "site_defaults" ? (
        <SiteDefaultsEditor />
      ) : currentView === "playground" ? (
        <PlaygroundView onLaunchEditor={onLaunchEditor} />
      ) : (
        <div
          style={{
            background: T.card,
            border: `1px solid ${T.borderSoft}`,
            borderRadius: 12,
            padding: "36px 20px",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 700, color: T.ink, marginBottom: 6 }}>
            {VIEW_LABEL[currentView]}
          </div>
          <p style={{ fontSize: 12.5, color: T.inkMuted, margin: "0 auto", maxWidth: 460, lineHeight: 1.55 }}>
            Coming soon — this view will hold the full-page starter designs (the
            editor&rsquo;s &ldquo;Start with a design&rdquo; set).
          </p>
        </div>
      )}
    </div>
  );
}

// ── Playground ────────────────────────────────────────────────────────────────

const PLAYGROUND_TARGETS: ReadonlyArray<{
  target: BuilderLabTarget;
  label: string;
  blurb: string;
}> = [
  {
    target: "talent",
    label: "Talent page",
    blurb: "Author against a single talent's live data.",
  },
  {
    target: "workspace",
    label: "Workspace page",
    blurb: "Author against a workspace / hub.",
  },
  {
    target: "both",
    label: "Both",
    blurb: "A design for both surfaces — preview against a talent or a workspace.",
  },
];

/**
 * Playground (Phase 2) — the workbench. A single "+ New" launches the editor
 * SUBJECT-LESS against the picked target (talent / workspace / both); you choose
 * + switch the preview subject inside the editor. The persistent draft list
 * lands in Phase 3.
 */
function PlaygroundView({
  onLaunchEditor,
}: {
  onLaunchEditor?: (target: BuilderLabTarget) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  const launch = (target: BuilderLabTarget) => {
    setMenuOpen(false);
    onLaunchEditor?.(target);
  };

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
            Your workbench — start a fresh draft, pick its target, author against
            real data inside the editor.
          </div>
        </div>

        <div style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5DD3A0]/60"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              padding: "8px 16px",
              borderRadius: 9,
              border: "none",
              background: T.accent,
              color: "#0F0F11",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            + New
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
                  key={opt.target}
                  type="button"
                  role="menuitem"
                  onClick={() => launch(opt.target)}
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

      <div
        style={{
          background: T.card,
          border: `1px solid ${T.borderSoft}`,
          borderRadius: 12,
          padding: "32px 20px",
          textAlign: "center",
        }}
      >
        <p style={{ fontSize: 12.5, color: T.inkMuted, margin: "0 auto", maxWidth: 480, lineHeight: 1.55 }}>
          No saved drafts yet. Hit <strong style={{ color: T.ink }}>+ New</strong> to open a fresh
          editor canvas. Persistence — a list of your drafts with{" "}
          <em>All / Draft / In&nbsp;Review / Published / Archived</em> states — lands in Phase 3.
        </p>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: T.field,
  border: `1px solid ${T.border}`,
  borderRadius: 8,
  color: T.ink,
  fontSize: 12.5,
  padding: "7px 10px",
  width: 220,
};

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

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 18, fontWeight: 700, color: T.ink }}>{value}</span>
      <span style={{ fontSize: 10.5, color: T.inkMuted, letterSpacing: 0.4 }}>{label}</span>
    </div>
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
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 0.4,
        textTransform: "uppercase",
        padding: "2px 7px",
        borderRadius: 999,
        background: tone === "accent" ? "rgba(93,211,160,0.14)" : "rgba(255,255,255,0.07)",
        color: tone === "accent" ? T.accent : T.inkMuted,
      }}
    >
      {text}
    </span>
  );
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
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
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
