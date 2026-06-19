"use client";

/**
 * CatalogRowTable — the Builder Lab Catalog's per-tab component table + its
 * inline override-edit accordion. Extracted from component-catalog.tsx (which
 * was over the max-lines cap) so the parent stays a focused controller: it owns
 * the data load, the overlay mutations, and ALL edit-form state, threading them
 * down here as props. Behavior-identical to the inlined version.
 *
 * Each group renders one `<section>` with a header (label + count) and a table
 * of rows. A row click (off any control) toggles its edit accordion; the
 * accordion groups the governance inputs under a "Governance" subhead.
 */

import { Fragment, useEffect, useMemo, useRef, useState } from "react";

import type {
  AddGalleryNativeVariant,
  CatalogAdminItem,
} from "@/lib/site-admin/add-gallery";
import {
  listBuilderLabAudit,
  type BuilderLabAuditEntry,
} from "@/lib/site-admin/builder-core/templates/builder-lab-audit";
import {
  revertOverlayToAudit,
  setComponentOverlayBatch,
  clearComponentOverlayBatch,
} from "@/lib/site-admin/builder-core/templates/catalog-overlay-actions";
// Import the 4-surface helpers/constants directly from their module, NOT the
// add-gallery barrel — the barrel transitively pulls a `.css` side-effect import
// that the tsx test runner can't parse (it compiles CSS as JS). The erased types
// are barrel-safe but we keep them co-located here.
import {
  CATALOG_SURFACE_KEYS,
  CATALOG_SURFACE_LABEL,
  surfaceKeyToTarget,
  type CatalogSurfaceKey,
} from "@/lib/site-admin/add-gallery/registry-db-merge";
// O2 — the PURE selection-set + batch-input derivation (no React/DB) the sticky
// bulk action bar drives. Kept in its own leaf so the tsx test runner can load
// it without the .css side-effect the add-gallery barrel drags in.
import {
  toggleSelected,
  selectAllVisible,
  clearVisible,
  clearSelection,
  allVisibleSelected,
  selectedRows as selectedRowsOf,
  deriveSurfaceBatchInputs,
  deriveAvailabilityBatchInputs,
  deriveResetRefs,
} from "./catalog-bulk-selection";
// O8 — the PURE roving-tabindex + key→action logic the keyboard handler drives.
// Lives in its own leaf (no React/DOM) so the off-by-one movement math + the
// key map are unit-testable; the table owns the focused-row id + the listener.
import {
  keyToRowAction,
  actionNeedsFocusedRow,
  nextRowId,
  prevRowId,
  shouldIgnoreKeyForTarget,
} from "./catalog-row-keymap";
import { AddGalleryIcon } from "@/components/edit-chrome/add-gallery/add-gallery-icons";
import { governanceChips } from "./catalog-governance";
import {
  LAB as T,
  fieldStyle,
  panelStyle,
  LabBadge,
  LabChip,
  LinkBtn,
  LabStatusDropdown,
  LAB_STATUS_LABEL,
  SectionLabel,
  type LabStatus,
  type LabStatusOption,
} from "./ui";

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

export function targetAllows(
  targetContext: CatalogAdminItem["targetContext"],
  surface: "talent" | "workspace",
): boolean {
  if (targetContext === "both") return true;
  return targetContext === surface;
}

/** X4 — does the row's target_context allow the given precise surface? Reduces
 *  the 4 surfaces to their coarse target then defers to {@link targetAllows}. */
function surfaceKeyAllowed(
  targetContext: CatalogAdminItem["targetContext"],
  surfaceKey: CatalogSurfaceKey,
): boolean {
  return targetAllows(targetContext, surfaceKeyToTarget(surfaceKey));
}

const STATUS_ORDER: ReadonlyArray<LabStatus> = [
  "draft",
  "in_review",
  "published",
  "archived",
];

const CODE_DISABLED_TOOLTIP =
  "Code components ship live — only Published / Archived apply.";

/**
 * The four-status menu for one row, with `disabled` + `tooltip` set per the row
 * source's real transition rules. PRESENTATIONAL input to {@link LabStatusDropdown}
 * — the parent's `onSetStatus` performs the actual transition.
 *
 *  • Code rows: Published / Archived only (they map to the availability overlay).
 *    Draft + In-review are shown disabled (a code component has no draft state).
 *  • DB-template rows: only the legal next states for `current` are enabled,
 *    mirroring the guarded registry actions
 *    (draft→in_review/published/archived, in_review→draft/published/archived,
 *    published→draft/archived, archived→published).
 */
function statusOptionsFor(
  source: "code" | "template",
  current: LabStatus,
): LabStatusOption[] {
  if (source === "code") {
    return STATUS_ORDER.map((value) => {
      const codeApplicable = value === "published" || value === "archived";
      return {
        value,
        label: LAB_STATUS_LABEL[value],
        disabled: !codeApplicable,
        tooltip: codeApplicable ? undefined : CODE_DISABLED_TOOLTIP,
      };
    });
  }
  // DB template — legal forward/back transitions per registry-actions guards.
  const legal: Record<LabStatus, ReadonlyArray<LabStatus>> = {
    draft: ["in_review", "published", "archived"],
    in_review: ["draft", "published", "archived"],
    published: ["draft", "archived"],
    archived: ["published"],
  };
  const allowed = new Set<LabStatus>([current, ...legal[current]]);
  return STATUS_ORDER.map((value) => ({
    value,
    label: LAB_STATUS_LABEL[value],
    disabled: !allowed.has(value),
    tooltip: allowed.has(value)
      ? undefined
      : `Can't move from ${LAB_STATUS_LABEL[current]} to ${LAB_STATUS_LABEL[value]} directly.`,
  }));
}

/** Coerce the (string) admin-view status to the LabStatus union. Code rows are
 *  already derived to published/archived; templates carry the real enum. */
function toLabStatus(status: string): LabStatus {
  return status === "draft" ||
    status === "in_review" ||
    status === "published" ||
    status === "archived"
    ? status
    : "published";
}

/**
 * O9 — multi-row edit accordion adapter. When supplied, the row table opens an
 * inline editor for EVERY row whose id `isExpanded` returns true (not just the
 * single `editingId`), and sources that row's form values from a PER-ROW bundle
 * keyed by id — so several rows' locked/default-prop editors stay open
 * side-by-side, each with independent inputs.
 *
 * This is the single additive seam ComponentCatalog uses to drive multi-open;
 * the per-row `CatalogEditFormBundle` is exactly the flat edit-form value/setter
 * slice that {@link EditAccordionRow} already consumes. When `multiEdit` is
 * omitted the table falls back to the legacy single-open `editingId` path
 * verbatim (backward-compatible).
 */
export type CatalogEditFormBundle = Pick<
  CatalogRowTableProps,
  | "editLabel"
  | "setEditLabel"
  | "editCategory"
  | "setEditCategory"
  | "editIcon"
  | "setEditIcon"
  | "editPlan"
  | "setEditPlan"
  | "editLockedProps"
  | "setEditLockedProps"
  | "editDefaultVariant"
  | "setEditDefaultVariant"
  | "editDefaultProps"
  | "setEditDefaultProps"
  | "editDefaultPropsError"
  | "setEditDefaultPropsError"
  | "editDataSourceDefaults"
  | "setEditDataSourceDefaults"
  | "editDataSourceDefaultsError"
  | "setEditDataSourceDefaultsError"
>;

export interface CatalogMultiEditAdapter {
  /** True iff this row's override editor should render open. */
  isExpanded: (id: string) => boolean;
  /** The per-row form value/setter bundle for an expanded row. */
  formFor: (id: string) => CatalogEditFormBundle;
  /** Close ONE row's editor (the per-row Cancel affordance under multi-open). */
  closeRow: (id: string) => void;
}

/** Props the parent threads into each row group's table. The edit-form value +
 *  setter pairs are owned by ComponentCatalog so save/cancel/reset stay there. */
export interface CatalogRowTableProps {
  groups: Array<{ key: string; label: string; rows: CatalogAdminItem[] }>;
  humanize: (id: string) => string;
  pendingId: string | null;
  editingId: string | null;
  /** O9 — optional multi-open adapter; when set it supersedes `editingId` for
   *  deciding which rows show the editor and supplies per-row form state. */
  multiEdit?: CatalogMultiEditAdapter;
  confirmingResetId: string | null;
  // edit-form state (owned by parent)
  editLabel: string;
  setEditLabel: (v: string) => void;
  editCategory: string;
  setEditCategory: (v: string) => void;
  editIcon: string;
  setEditIcon: (v: string) => void;
  editPlan: string;
  setEditPlan: (v: string) => void;
  editLockedProps: string;
  setEditLockedProps: (v: string) => void;
  editDefaultVariant: string;
  setEditDefaultVariant: (v: string) => void;
  editDefaultProps: string;
  setEditDefaultProps: (v: string) => void;
  editDefaultPropsError: string | null;
  setEditDefaultPropsError: (v: string | null) => void;
  editDataSourceDefaults: string;
  setEditDataSourceDefaults: (v: string) => void;
  editDataSourceDefaultsError: string | null;
  setEditDataSourceDefaultsError: (v: string | null) => void;
  // actions
  onRowClick: (item: CatalogAdminItem) => void;
  /** X4 — toggle ONE of the four real surfaces (each has its own overlay column). */
  onToggleSurface: (item: CatalogAdminItem, surface: CatalogSurfaceKey) => void;
  /** X6 — toggle the INDEPENDENT Builder-Lab visibility (the 5th, orthogonal
   *  axis; never gated by target_context, never mirrors a tenant surface). */
  onToggleLab: (item: CatalogAdminItem) => void;
  /** Dispatch a lifecycle transition for the row (the parent maps it to the
   *  availability overlay for code rows / the registry actions for templates). */
  onSetStatus: (item: CatalogAdminItem, next: LabStatus) => void;
  onSaveEdit: (item: CatalogAdminItem) => void;
  onCancelEdit: () => void;
  onConfirmReset: (item: CatalogAdminItem) => void;
  onStartReset: (id: string) => void;
  onCancelReset: () => void;
  onPreview: (item: CatalogAdminItem) => void;
  /** G7 — called after a successful per-row overlay REVERT so the parent reloads
   *  the catalog view (the reverted item's toggles/overrides changed). */
  onReverted: () => void | Promise<void>;
}

export function CatalogRowTable(props: CatalogRowTableProps) {
  const {
    groups,
    humanize,
    pendingId,
    editingId,
    multiEdit,
    confirmingResetId,
    onRowClick,
    onToggleSurface,
    onToggleLab,
    onSetStatus,
    onSaveEdit,
    onCancelEdit,
    onConfirmReset,
    onStartReset,
    onCancelReset,
    onPreview,
    onReverted,
  } = props;

  // Which row's audit history popover is open (G1 per-row history affordance).
  const [historyId, setHistoryId] = useState<string | null>(null);

  // O2 — bulk selection. The selected ids are LOCAL to the table (the parent
  // owns no selection state); the sticky action bar fires the O1 batch server
  // actions directly and reloads the catalog through the existing `onReverted`
  // prop (already wired to the parent's reload). Optimistic flip is the table's
  // `pendingBulk` opacity; reload() reconciles against server truth.
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);

  // O8 — roving-tabindex keyboard focus. The focused row id is LOCAL to the
  // table; the container's keydown handler moves it (j/k) and fires the existing
  // row handlers (e=edit/onRowClick, p=preview, t/w=toggle the two primary
  // surfaces). `/` focuses the catalog search field; Esc clears focus + collapses
  // any open editor. Mirrors the Lab's window-keydown pattern but scoped to the
  // table container so the chords only fire while the catalog table has focus.
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());

  // All visible row ids across every group (the selection spans grouped tables).
  const visibleIds = useMemo(
    () => groups.flatMap((g) => g.rows.map((r) => r.id)),
    [groups],
  );
  const allRows = useMemo(() => groups.flatMap((g) => g.rows), [groups]);

  // Drop any selected id that scrolled out of the current (filtered) view so the
  // "N selected" count + batch inputs never reference a row no longer rendered.
  useEffect(() => {
    setSelected((prev) => {
      const visible = new Set(visibleIds);
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (visible.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [visibleIds]);

  const headerAllSelected = allVisibleSelected(selected, visibleIds);

  // O8 — if the focused row scrolled out of the (filtered) view, drop the focus
  // so j/k re-enter cleanly at the top/bottom instead of pointing at a ghost row.
  useEffect(() => {
    setFocusedId((prev) =>
      prev !== null && !visibleIds.includes(prev) ? null : prev,
    );
  }, [visibleIds]);

  // O8 — the roving-tabindex keydown handler, mounted on the table container and
  // torn down on unmount. We DON'T hijack keys while an input/textarea/select is
  // focused (the operator is typing) — except "/", which always jumps to the
  // catalog search field. The pure keymap (catalog-row-keymap) owns the off-by-
  // one movement + key→action mapping; this effect just dispatches the action
  // against the already-threaded row handlers.
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const onKey = (e: KeyboardEvent) => {
      // Let chords with modifiers (Cmd/Ctrl-K palette, browser shortcuts) pass.
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();
      const targetTag =
        (e.target as HTMLElement | null)?.tagName?.toLowerCase() ?? "";
      if (shouldIgnoreKeyForTarget(key, targetTag)) return;
      const action = keyToRowAction(key);
      if (!action) return;

      // The focused row (if any) the row-scoped actions operate on.
      const current = allRows.find((r) => r.id === focusedId) ?? null;
      if (actionNeedsFocusedRow(action) && !current) {
        // e/p/t/w with nothing focused: enter the table at the top instead of
        // silently doing nothing, so the keyboard path is always reachable.
        if (visibleIds.length > 0) {
          e.preventDefault();
          setFocusedId(visibleIds[0]);
        }
        return;
      }

      switch (action.type) {
        case "focus-next":
          e.preventDefault();
          setFocusedId((prev) => nextRowId(prev, visibleIds));
          break;
        case "focus-prev":
          e.preventDefault();
          setFocusedId((prev) => prevRowId(prev, visibleIds));
          break;
        case "edit":
          if (current) {
            e.preventDefault();
            onRowClick(current);
          }
          break;
        case "preview":
          if (current) {
            e.preventDefault();
            onPreview(current);
          }
          break;
        case "toggle-surface":
          if (current) {
            e.preventDefault();
            onToggleSurface(current, action.surface);
          }
          break;
        case "focus-search": {
          e.preventDefault();
          const search = document.querySelector<HTMLInputElement>(
            'input[type="search"][aria-label="Search components"]',
          );
          search?.focus();
          search?.select();
          break;
        }
        case "collapse":
          e.preventDefault();
          setFocusedId(null);
          if (focusedId) {
            const editing = multiEdit
              ? multiEdit.isExpanded(focusedId)
              : editingId === focusedId;
            if (editing) {
              if (multiEdit) multiEdit.closeRow(focusedId);
              else onCancelEdit();
            }
          }
          break;
      }
    };
    node.addEventListener("keydown", onKey);
    return () => node.removeEventListener("keydown", onKey);
  }, [
    allRows,
    visibleIds,
    focusedId,
    onRowClick,
    onPreview,
    onToggleSurface,
    onCancelEdit,
    editingId,
    multiEdit,
  ]);

  // O8 — scroll the focused row into view as j/k move down/up a long list.
  useEffect(() => {
    if (!focusedId) return;
    rowRefs.current
      .get(focusedId)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focusedId]);

  /** Run a batch op, optimistically dim the table, then reload + clear on success. */
  async function runBulk(
    run: () => Promise<{ ok: boolean; error?: string }>,
  ): Promise<void> {
    setBulkBusy(true);
    setBulkError(null);
    try {
      const res = await run();
      if (!res.ok) {
        setBulkError(res.error ?? "Bulk update failed.");
      }
      // Reconcile against server truth whether or not it reported ok — a partial
      // batch still wrote some rows, and reload() is the source of truth.
      await onReverted();
      if (res.ok) setSelected(clearSelection());
    } catch {
      setBulkError("Bulk update failed.");
      await onReverted();
    } finally {
      setBulkBusy(false);
    }
  }

  const chosen = () => selectedRowsOf(allRows, selected);

  const bulkSetSurface = (surfaceKey: CatalogSurfaceKey, enabled: boolean) =>
    void runBulk(() =>
      setComponentOverlayBatch(deriveSurfaceBatchInputs(chosen(), surfaceKey, enabled)),
    );
  const bulkSetAvailability = (availability: "available" | "hidden") =>
    void runBulk(() =>
      setComponentOverlayBatch(deriveAvailabilityBatchInputs(chosen(), availability)),
    );
  const bulkReset = () =>
    void runBulk(() => clearComponentOverlayBatch(deriveResetRefs(chosen())));

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      role="grid"
      data-testid="lab-catalog-row-grid"
      aria-label="Catalog components — keyboard: j/k move, t/w toggle surfaces, e edit, p preview, slash search, Esc collapse"
      onFocus={() => {
        // First Tab into the grid auto-focuses the top row so j/k have an anchor.
        if (focusedId === null && visibleIds.length > 0) {
          setFocusedId(visibleIds[0]);
        }
      }}
      style={{ outline: "none", display: "flex", flexDirection: "column", gap: 16 }}
    >
      {selected.size > 0 ? (
        <BulkActionBar
          count={selected.size}
          busy={bulkBusy}
          error={bulkError}
          onClear={() => setSelected(clearSelection())}
          onShowSurface={(sk) => bulkSetSurface(sk, true)}
          onHideSurface={(sk) => bulkSetSurface(sk, false)}
          onPublish={() => bulkSetAvailability("available")}
          onArchive={() => bulkSetAvailability("hidden")}
          onReset={bulkReset}
        />
      ) : null}
      {groups.map((group) => (
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
                <th
                  style={{
                    padding: "9px 0 9px 16px",
                    width: 34,
                    textAlign: "center",
                  }}
                >
                  <input
                    type="checkbox"
                    data-testid="lab-catalog-select-all"
                    aria-label="Select all visible components"
                    checked={headerAllSelected}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? selectAllVisible(selected, visibleIds)
                          : clearVisible(selected, visibleIds),
                      )
                    }
                    style={{ cursor: "pointer", accentColor: T.accent }}
                  />
                </th>
                <Th>Component</Th>
                <Th>Category</Th>
                <Th>Source</Th>
                {/* X4 — a TRUE 4-surface matrix: each real builder surface has
                    its OWN independent enable toggle. The talent shell no longer
                    rides the Workspace toggle (the lossy 3-on-1 collapse is gone). */}
                <Th center help="The talent's freeform profile page builder gallery (talent_profile_enabled).">
                  Talent profile
                </Th>
                <Th center help="The talent Max-SITE header/footer shell gallery — now its OWN toggle (talent_shell_enabled), no longer chained to Workspace.">
                  Talent shell
                </Th>
                <Th center help="The agency storefront freeform page gallery (workspace_page_enabled).">
                  Workspace page
                </Th>
                <Th center help="The agency site header/footer shell gallery (workspace_shell_enabled).">
                  Workspace shell
                </Th>
                {/* X6 — the FIFTH, INDEPENDENT axis: visibility in the Builder
                    Lab itself (lab_enabled). Orthogonal to the four tenant
                    surfaces + to target_context, so it has NO surface lock — a
                    component can be Lab-only, tenant-only, both, or neither. */}
                <Th center help="Visibility in the Builder Lab's own gallery (lab_enabled) — independent of the four tenant surfaces and never gated by target_context.">
                  Builder Lab
                </Th>
                {/* D1 — how many tenant trees reference this component TYPE
                    (node.kind), tallied across every tenant tree column
                    (cms_pages.blocks / cms_sections.props_jsonb /
                    cms_builder_components.subtree_jsonb / talent_sites
                    snapshots + shell). "—" for items with no single countable
                    type (a DB page/section template is inlined as a subtree). */}
                <Th center help="How many tenant pages use this component type, tallied across every tenant tree (pages, saved sections, reusable components, talent Max-sites + shells).">
                  Used
                </Th>
                <Th right>Manage</Th>
              </tr>
            </thead>
            <tbody>
              {group.rows.map((r) => {
                const busy = pendingId === r.id;
                // O9 — multi-open: when the adapter is supplied, a row's editor
                // is open per the expanded SET; otherwise the legacy single id.
                const editing = multiEdit
                  ? multiEdit.isExpanded(r.id)
                  : editingId === r.id;
                const isTemplate = r.source === "template";
                const chips = governanceChips(r.overlay);
                return (
                  <Fragment key={r.id}>
                    <tr
                      data-testid={`lab-catalog-row-${r.id}`}
                      ref={(el) => {
                        // O8 — track each row's element so j/k can scroll the
                        // focused row into view. Clean up on unmount/remove.
                        if (el) rowRefs.current.set(r.id, el);
                        else rowRefs.current.delete(r.id);
                      }}
                      aria-selected={focusedId === r.id}
                      onClick={(e) => {
                        // Click anywhere on the row (except an interactive control)
                        // to toggle its override accordion.
                        if (
                          (e.target as HTMLElement).closest(
                            "button, input, a, select, textarea",
                          )
                        )
                          return;
                        // O8 — a mouse click also moves keyboard focus here so
                        // j/k continue from the row the operator just touched.
                        setFocusedId(r.id);
                        onRowClick(r);
                      }}
                      style={{
                        borderTop: `1px solid ${T.borderSoft}`,
                        opacity: busy || (bulkBusy && selected.has(r.id)) ? 0.55 : 1,
                        cursor: "pointer",
                        // O8 — roving-focus ring: an inset accent outline marks the
                        // keyboard-focused row without shifting layout.
                        boxShadow:
                          focusedId === r.id
                            ? `inset 3px 0 0 ${T.accent}`
                            : undefined,
                        background:
                          focusedId === r.id
                            ? "rgba(93,211,160,0.09)"
                            : selected.has(r.id)
                              ? "rgba(93,211,160,0.06)"
                              : undefined,
                      }}
                    >
                      <td style={{ padding: "9px 0 9px 16px", textAlign: "center" }}>
                        <input
                          type="checkbox"
                          data-testid={`lab-catalog-select-${r.id}`}
                          aria-label={`Select ${r.effectiveLabel}`}
                          checked={selected.has(r.id)}
                          onChange={() =>
                            setSelected((prev) => toggleSelected(prev, r.id))
                          }
                          style={{ cursor: "pointer", accentColor: T.accent }}
                        />
                      </td>
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
                            <div
                              style={{
                                color: T.ink,
                                fontWeight: 600,
                                display: "flex",
                                alignItems: "center",
                                gap: 7,
                                flexWrap: "wrap",
                              }}
                            >
                              {r.effectiveLabel}
                              {/* Governance chips — legible per-dimension flags
                                  (was a single ambiguous dot). */}
                              {chips.map((c) => (
                                <LabChip
                                  key={c.kind}
                                  tone={c.kind === "locked" ? "lock" : "accent"}
                                  title={c.title}
                                >
                                  {c.label}
                                </LabChip>
                              ))}
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
                        <LabBadge tone={isTemplate ? "accent" : "neutral"}>
                          {isTemplate ? "Template" : "Code"}
                        </LabBadge>
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
                      {CATALOG_SURFACE_KEYS.map((sk) => {
                        const allowed = surfaceKeyAllowed(r.targetContext, sk);
                        return (
                          <ToggleCell
                            key={sk}
                            on={r.surfaceVisible[sk]}
                            disabled={busy || !allowed}
                            locked={!allowed}
                            lockedTooltip={
                              !allowed
                                ? `This component targets "${r.targetContext}"; can't be enabled on ${CATALOG_SURFACE_LABEL[sk]}.`
                                : undefined
                            }
                            onClick={() => onToggleSurface(r, sk)}
                            label={r.effectiveLabel}
                            surface={CATALOG_SURFACE_LABEL[sk]}
                          />
                        );
                      })}
                      {/* X6 — the Builder-Lab toggle. NEVER locked by
                          target_context: the Lab authors for every audience, so
                          the cell is always actionable (only `busy` disables it). */}
                      <ToggleCell
                        on={r.labVisible}
                        disabled={busy}
                        locked={false}
                        onClick={() => onToggleLab(r)}
                        label={r.effectiveLabel}
                        surface="Builder Lab"
                      />
                      <UsageCell count={r.usageCount} label={r.effectiveLabel} />
                      <td style={{ padding: "9px 16px", textAlign: "right", whiteSpace: "nowrap" }}>
                        {editing ? (
                          <span style={{ display: "inline-flex", gap: 6 }}>
                            <LinkBtn label="Save" testId={`lab-catalog-row-save-${r.id}`} onClick={() => onSaveEdit(r)} disabled={busy} primary />
                            <LinkBtn
                              label="Cancel"
                              onClick={
                                // O9 — close THIS row when multi-open; else the
                                // legacy single-editor cancel.
                                multiEdit
                                  ? () => multiEdit.closeRow(r.id)
                                  : onCancelEdit
                              }
                              disabled={busy}
                            />
                          </span>
                        ) : confirmingResetId === r.id ? (
                          <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                            <span style={{ fontSize: 11, color: T.inkMuted }}>Reset to default?</span>
                            <LinkBtn label="Yes" onClick={() => onConfirmReset(r)} disabled={busy} primary />
                            <LinkBtn label="No" onClick={onCancelReset} disabled={busy} />
                          </span>
                        ) : (
                          <span style={{ display: "inline-flex", gap: 10, alignItems: "center" }}>
                            <LabStatusDropdown
                              testId={`lab-catalog-row-status-${r.id}`}
                              status={toLabStatus(r.status)}
                              options={statusOptionsFor(r.source, toLabStatus(r.status))}
                              busy={busy}
                              onSelect={(next) => onSetStatus(r, next)}
                            />
                            <LinkBtn label="Preview" onClick={() => onPreview(r)} disabled={busy} />
                            <LinkBtn
                              label={historyId === r.id ? "Hide history" : "History"}
                              testId={`lab-catalog-row-history-${r.id}`}
                              onClick={() => setHistoryId(historyId === r.id ? null : r.id)}
                            />
                            {r.overlay ? (
                              <LinkBtn label="Reset" onClick={() => onStartReset(r.id)} disabled={busy} />
                            ) : null}
                          </span>
                        )}
                      </td>
                    </tr>
                    {historyId === r.id ? (
                      <RowHistoryRow
                        itemRef={r.id}
                        templateId={r.dbTemplateId}
                        onClose={() => setHistoryId(null)}
                        onReverted={onReverted}
                      />
                    ) : null}
                    {editing ? (
                      // O9 — when multi-open, override the shared flat form
                      // value/setters with THIS row's per-id bundle so every
                      // open editor edits its own values independently.
                      <EditAccordionRow
                        item={r}
                        {...props}
                        {...(multiEdit ? multiEdit.formFor(r.id) : {})}
                      />
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}

// ── O2: sticky bulk action bar ───────────────────────────────────────────────

/**
 * The sticky "N selected" bar shown above the grouped tables whenever ≥1 row is
 * checked. Offers Show/Hide on each of the four real surfaces (subtract-only —
 * the underlying derivation skips rows whose target_context forbids a surface),
 * plus Publish / Archive (availability overlay) and Reset overlay. Every action
 * dispatches through one of the O1 batch server actions; while in-flight the
 * whole bar is `busy`. Pure presentation — the parent table owns selection +
 * dispatch.
 */
function BulkActionBar({
  count,
  busy,
  error,
  onClear,
  onShowSurface,
  onHideSurface,
  onPublish,
  onArchive,
  onReset,
}: {
  count: number;
  busy: boolean;
  error: string | null;
  onClear: () => void;
  onShowSurface: (surfaceKey: CatalogSurfaceKey) => void;
  onHideSurface: (surfaceKey: CatalogSurfaceKey) => void;
  onPublish: () => void;
  onArchive: () => void;
  onReset: () => void;
}) {
  return (
    <div
      data-testid="lab-catalog-bulk-bar"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 5,
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 12,
        padding: "10px 16px",
        borderRadius: 12,
        border: `1px solid ${T.border}`,
        background: T.cardSoft,
        boxShadow: "0 6px 18px rgba(0,0,0,0.18)",
        opacity: busy ? 0.7 : 1,
      }}
    >
      <span
        data-testid="lab-catalog-bulk-count"
        style={{ fontSize: 12.5, fontWeight: 700, color: T.ink, whiteSpace: "nowrap" }}
      >
        {count} selected
      </span>

      {/* Per-surface show/hide. Each surface offers both directions; the
          derivation subtract-only skips rows the surface can't widen onto. */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        {CATALOG_SURFACE_KEYS.map((sk) => (
          <span
            key={sk}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "3px 8px",
              borderRadius: 999,
              border: `1px solid ${T.borderSoft}`,
            }}
          >
            <span style={{ fontSize: 10.5, color: T.inkMuted, whiteSpace: "nowrap" }}>
              {CATALOG_SURFACE_LABEL[sk]}
            </span>
            <BulkBtn
              label="Show"
              testId={`lab-catalog-bulk-show-${sk}`}
              onClick={() => onShowSurface(sk)}
              disabled={busy}
            />
            <BulkBtn
              label="Hide"
              testId={`lab-catalog-bulk-hide-${sk}`}
              onClick={() => onHideSurface(sk)}
              disabled={busy}
            />
          </span>
        ))}
      </div>

      <span style={{ width: 1, height: 18, background: T.borderSoft }} aria-hidden />

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <BulkBtn
          label="Publish"
          testId="lab-catalog-bulk-publish"
          onClick={onPublish}
          disabled={busy}
          primary
        />
        <BulkBtn
          label="Archive"
          testId="lab-catalog-bulk-archive"
          onClick={onArchive}
          disabled={busy}
        />
        <BulkBtn
          label="Reset overlay"
          testId="lab-catalog-bulk-reset"
          onClick={onReset}
          disabled={busy}
        />
      </div>

      <span style={{ marginLeft: "auto", display: "inline-flex", gap: 12, alignItems: "center" }}>
        {error ? (
          <span data-testid="lab-catalog-bulk-error" style={{ fontSize: 11, color: T.red }}>
            {error}
          </span>
        ) : null}
        <LinkBtn label="Clear" onClick={onClear} disabled={busy} />
      </span>
    </div>
  );
}

/** A pill button for the bulk bar (matches the LinkBtn affordance but reads as a
 *  discrete action chip). */
function BulkBtn({
  label,
  testId,
  onClick,
  disabled,
  primary,
}: {
  label: string;
  testId: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
      className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5DD3A0]/60"
      style={{
        cursor: disabled ? "default" : "pointer",
        border: `1px solid ${primary ? "rgba(93,211,160,0.45)" : T.border}`,
        background: primary ? "rgba(93,211,160,0.16)" : "transparent",
        color: primary ? T.yes : T.inkMuted,
        borderRadius: 999,
        padding: "2px 9px",
        fontSize: 10.5,
        fontWeight: 700,
      }}
    >
      {label}
    </button>
  );
}

/** The inline override-edit accordion row, shown under the editing row. Splits
 *  the 8 inputs into "Display" (cosmetic) + "Governance" (insert-time policy)
 *  groups with a subhead + helper text each. */
function EditAccordionRow({
  item: r,
  editLabel,
  setEditLabel,
  editCategory,
  setEditCategory,
  editIcon,
  setEditIcon,
  editPlan,
  setEditPlan,
  editLockedProps,
  setEditLockedProps,
  editDefaultVariant,
  setEditDefaultVariant,
  editDefaultProps,
  setEditDefaultProps,
  editDefaultPropsError,
  setEditDefaultPropsError,
  editDataSourceDefaults,
  setEditDataSourceDefaults,
  editDataSourceDefaultsError,
  setEditDataSourceDefaultsError,
}: CatalogRowTableProps & { item: CatalogAdminItem }) {
  return (
    <tr style={{ background: T.cardSoft }}>
      <td colSpan={11} style={{ padding: "12px 16px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Display group — cosmetic overrides */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <SectionLabel>Display</SectionLabel>
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
            </div>
            <span style={{ fontSize: 11, color: T.inkDim, lineHeight: 1.5 }}>
              Blank = built-in default. Icon names match the gallery icon set. Renames apply to both
              builders&apos; &quot;+&quot; gallery on next open.
            </span>
          </div>

          {/* Governance group — insert-time policy */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <SectionLabel>Governance</SectionLabel>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-start" }}>
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
            </div>
            <span style={{ fontSize: 11, color: T.inkDim, lineHeight: 1.5 }}>
              Plan only tightens (never widens). <strong>Locked props</strong> are dot-paths
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
        </div>
      </td>
    </tr>
  );
}

// ── Per-row audit history (G1) ────────────────────────────────────────────────

/** "el-button" / "db-template:<uuid>" / template id labelling for a history line. */
function historyActionLabel(action: string): string {
  switch (action) {
    case "overlay.set":
      return "Set overlay";
    case "overlay.clear":
      return "Cleared overlay";
    case "template.publish":
      return "Published";
    case "template.unpublish":
      return "Unpublished";
    case "template.archive":
      return "Archived";
    case "template.rollout":
      return "Changed rollout";
    default:
      return action;
  }
}

/**
 * Inline accordion row showing the audit history for ONE catalog item. Loads
 * lazily on open via the super_admin-gated `listBuilderLabAudit`, scoped by both
 * the overlay `item_ref` (code + template overlay writes) and, for DB templates,
 * the raw `template_id` (lifecycle writes). Read-only; mirrors the platform-wide
 * Activity feed but for a single row.
 */
function RowHistoryRow({
  itemRef,
  templateId,
  onClose,
  onReverted,
}: {
  itemRef: string;
  templateId?: string;
  onClose: () => void;
  /** G7 — bubble a successful revert up so the parent reloads the catalog. */
  onReverted: () => void | Promise<void>;
}) {
  const [entries, setEntries] = useState<BuilderLabAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  // G7 — which audit row is mid-revert (disables every revert button), and the
  // last revert error (shown inline, mirrors the parent's error surface).
  const [revertingId, setRevertingId] = useState<string | null>(null);
  const [revertError, setRevertError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const loaders = [listBuilderLabAudit({ itemRef })];
    if (templateId) loaders.push(listBuilderLabAudit({ templateId }));
    void Promise.all(loaders)
      .then((lists) => {
        if (!active) return;
        // Merge + dedupe by id, newest first.
        const byId = new Map<string, BuilderLabAuditEntry>();
        for (const list of lists) for (const e of list) byId.set(e.id, e);
        const merged = [...byId.values()].sort((a, b) =>
          a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0,
        );
        setEntries(merged);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [itemRef, templateId, reloadKey]);

  // G7 — revert this item's overlay to the chosen audit row's captured state.
  // The server re-applies the full snapshot through the normal writer (guard +
  // dual-write + a fresh audit row), so on success we reload BOTH this strip
  // (the new revert row appears) and the parent catalog (toggles changed).
  async function revertTo(auditId: string) {
    setRevertingId(auditId);
    setRevertError(null);
    try {
      const res = await revertOverlayToAudit(auditId);
      if (!res.ok) {
        setRevertError(res.error ?? "Revert failed.");
        return;
      }
      await onReverted();
      setReloadKey((k) => k + 1);
    } catch {
      setRevertError("Revert failed.");
    } finally {
      setRevertingId(null);
    }
  }

  return (
    <tr>
      <td colSpan={11} style={{ padding: "10px 16px", background: T.cardSoft }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <SectionLabel>History</SectionLabel>
          <LinkBtn label="Close" onClick={onClose} />
        </div>
        {revertError ? (
          <div
            data-testid="lab-row-revert-error"
            style={{ fontSize: 11, color: T.red, marginBottom: 8 }}
          >
            {revertError}
          </div>
        ) : null}
        {loading ? (
          <div style={{ fontSize: 11.5, color: T.inkMuted }}>Loading history…</div>
        ) : entries.length === 0 ? (
          <div style={{ fontSize: 11.5, color: T.inkMuted }}>
            No governance changes recorded for this item yet.
          </div>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
            {entries.map((e) => {
              // Only overlay writes captured a revertable snapshot (lifecycle
              // rows aren't overlay state). The newest overlay row is the CURRENT
              // state, so reverting to its `before` still "undoes" that change.
              const revertable =
                e.action === "overlay.set" || e.action === "overlay.clear";
              const when = new Date(e.createdAt).toLocaleString();
              return (
                <li
                  key={e.id}
                  data-testid={`lab-row-history-${e.id}`}
                  style={{ display: "flex", gap: 10, alignItems: "baseline", fontSize: 11.5 }}
                >
                  <span style={{ color: T.ink, fontWeight: 600, minWidth: 110 }}>
                    {historyActionLabel(e.action)}
                  </span>
                  <span style={{ color: T.inkMuted }}>
                    {e.actorName ?? (e.actorId ? `${e.actorId.slice(0, 8)}…` : "—")}
                  </span>
                  <span style={{ color: T.inkDim, whiteSpace: "nowrap" }}>{when}</span>
                  {revertable ? (
                    <span
                      style={{ marginLeft: "auto" }}
                      title={`Revert this item to its state on ${when}`}
                    >
                      <LinkBtn
                        label={revertingId === e.id ? "Reverting…" : "Revert to this state"}
                        testId={`lab-row-revert-${e.id}`}
                        onClick={() => void revertTo(e.id)}
                        disabled={revertingId !== null}
                      />
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </td>
    </tr>
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

function Th({
  children,
  center,
  right,
  help,
}: {
  children: React.ReactNode;
  center?: boolean;
  right?: boolean;
  /** When set, the header carries a hover note (native title) + a small "?"
   *  affordance — used on the Talent-Max / Workspace columns to explain the real
   *  surface mapping the audit documented. */
  help?: string;
}) {
  return (
    <th
      title={help}
      style={{
        padding: "9px 16px",
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 0.8,
        textTransform: "uppercase",
        textAlign: center ? "center" : right ? "right" : "left",
        cursor: help ? "help" : undefined,
      }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          justifyContent: center ? "center" : right ? "flex-end" : "flex-start",
        }}
      >
        {children}
        {help ? (
          <span
            aria-hidden
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 12,
              height: 12,
              borderRadius: 999,
              border: `1px solid ${T.border}`,
              fontSize: 8,
              fontWeight: 700,
              color: T.inkMuted,
              lineHeight: 1,
            }}
          >
            ?
          </span>
        ) : null}
      </span>
    </th>
  );
}

/**
 * D1 — the "Used N" cell. Shows how many tenant pages reference this component
 * TYPE (node.kind), aggregated across every tenant tree. `undefined` ⇒ the item
 * has no single countable type (a DB page/section template is inlined as a whole
 * subtree, not one kind) → render a muted "—". A real count (incl. 0) renders as
 * a pill, dim when 0 (unused) so high-usage types stand out at a glance.
 */
function UsageCell({
  count,
  label,
}: {
  count: number | undefined;
  label: string;
}) {
  if (count === undefined) {
    return (
      <td
        style={{ padding: "9px 16px", textAlign: "center", color: T.inkDim }}
        title="Not a single countable component type (templates are inlined as a subtree)."
      >
        —
      </td>
    );
  }
  const used = count > 0;
  return (
    <td style={{ padding: "9px 16px", textAlign: "center" }}>
      <span
        title={`${label} is used on ${count} tenant page${count === 1 ? "" : "s"}.`}
        aria-label={`Used on ${count} tenant page${count === 1 ? "" : "s"}`}
        style={{
          display: "inline-block",
          minWidth: 36,
          padding: "3px 9px",
          borderRadius: 999,
          border: `1px solid ${used ? "rgba(93,211,160,0.45)" : T.border}`,
          background: used ? "rgba(93,211,160,0.12)" : "transparent",
          color: used ? T.yes : T.inkDim,
          fontSize: 11.5,
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {count}
      </span>
    </td>
  );
}

function ToggleCell({
  on,
  disabled,
  locked,
  lockedTooltip,
  onClick,
  label,
  surface,
}: {
  on: boolean;
  disabled: boolean;
  locked: boolean;
  /** Custom tooltip shown when `locked` is true. Falls back to a generic
   *  "Not targeted to this surface" message when not provided. */
  lockedTooltip?: string;
  onClick: () => void;
  label: string;
  surface: string;
}) {
  const title = locked
    ? (lockedTooltip ?? "Not targeted to this surface")
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


