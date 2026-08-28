"use client";

/**
 * CatalogGalleryView — the Builder Lab catalog's gallery surface (search/filter,
 * preset strip, expand/collapse header, and the per-component overlay row table).
 * Carved VERBATIM out of component-catalog.tsx (god-file decomposition): every
 * prop is named identically to the originating local in ComponentCatalog so the
 * moved JSX is an exact lift with no behavior change. The catalog controller owns
 * all state/handlers and threads them in.
 */

import type { Dispatch, RefObject, SetStateAction } from "react";

import type { CatalogAdminItem } from "@/lib/site-admin/add-gallery";
import {
  CatalogRowTable,
  type CatalogEditFormBundle,
} from "./catalog-row-table";
import { SurfaceSwitcher } from "./surface-switcher";
import {
  buildCatalogItemPreview,
  buildTemplateItemPreview,
  type CatalogItemPreview,
} from "./component-preview-stage";
import {
  LAB as T,
  fieldStyle,
  LabButton,
  LabChip,
  PillToggle,
  LabToast,
  EmptyCard,
  type LabToastAction,
} from "./ui";
import {
  type FilterPreset,
  type FilterState,
  BUILT_IN_PRESETS,
  saveActivePresetKey,
  stateMatchesPreset,
} from "./catalog-filter-presets";
import { type CatalogView } from "./catalog-nav";
import type { CatalogHealthReport } from "./catalog-health";
import {
  CONNECTED_DATA_GROUPS,
  PLACEHOLDER_EDIT_FORM_PROPS,
  humanize,
  type ConnectedDataGroup,
} from "./component-catalog-helpers";

type RowGroup = { key: string; label: string; rows: CatalogAdminItem[] };

export function CatalogGalleryView({
  error,
  toast,
  allPresets,
  currentFilterState,
  applyPreset,
  deletePreset,
  savingPreset,
  presetInputRef,
  presetDraftLabel,
  setPresetDraftLabel,
  commitSavePreset,
  setSavingPreset,
  query,
  setQuery,
  filterMode,
  setFilterMode,
  currentView,
  connectedSurface,
  setConnectedSurface,
  rowGroups,
  viewLabel,
  visibleExpandedCount,
  visibleRowIds,
  onExpandAllVisible,
  allVisibleExpanded,
  onCollapseAllVisible,
  healthReport,
  selectView,
  pendingId,
  expandedIds,
  formBundleFor,
  closeEdit,
  confirmingResetId,
  toggleEdit,
  toggleSurface,
  toggleLab,
  setStatus,
  saveEdit,
  confirmReset,
  startResetOptimistic,
  setConfirmingResetId,
  reload,
  onPreviewComponent,
}: {
  error: string | null;
  toast: { message: string; undo: LabToastAction | null } | null;
  allPresets: FilterPreset[];
  currentFilterState: () => FilterState;
  applyPreset: (preset: FilterPreset) => void;
  deletePreset: (key: string) => void;
  savingPreset: boolean;
  presetInputRef: RefObject<HTMLInputElement | null>;
  presetDraftLabel: string;
  setPresetDraftLabel: Dispatch<SetStateAction<string>>;
  commitSavePreset: () => void;
  setSavingPreset: Dispatch<SetStateAction<boolean>>;
  query: string;
  setQuery: Dispatch<SetStateAction<string>>;
  filterMode: "all" | "hidden" | "customized";
  setFilterMode: (v: "all" | "hidden" | "customized") => void;
  currentView: CatalogView;
  connectedSurface: ConnectedDataGroup;
  setConnectedSurface: Dispatch<SetStateAction<ConnectedDataGroup>>;
  rowGroups: RowGroup[];
  viewLabel: (view: CatalogView) => string;
  visibleExpandedCount: number;
  visibleRowIds: string[];
  onExpandAllVisible: () => void;
  allVisibleExpanded: boolean;
  onCollapseAllVisible: () => void;
  healthReport: CatalogHealthReport;
  selectView: (view: CatalogView) => void;
  pendingId: string | null;
  expandedIds: ReadonlySet<string>;
  formBundleFor: (id: string) => CatalogEditFormBundle;
  closeEdit: (id: string) => void;
  confirmingResetId: string | null;
  toggleEdit: (item: CatalogAdminItem) => void;
  toggleSurface: (item: CatalogAdminItem, surfaceKey: import("@/lib/site-admin/add-gallery/registry-db-merge").CatalogSurfaceKey) => void;
  toggleLab: (item: CatalogAdminItem) => void;
  setStatus: (item: CatalogAdminItem, next: "draft" | "in_review" | "published" | "archived") => void;
  saveEdit: (item: CatalogAdminItem) => void;
  confirmReset: (item: CatalogAdminItem) => void;
  startResetOptimistic: (id: string) => void;
  setConfirmingResetId: Dispatch<SetStateAction<string | null>>;
  reload: () => Promise<void>;
  onPreviewComponent?: (preview: CatalogItemPreview) => void;
}) {
  return (
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

      {currentView === "data" ? (
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
          {/* P1 — health-issue chip on the Structure/gallery surface header.
              Replaces the always-on health strip: when there are issues, it
              jumps to the (Admin-group) Health view. Hidden when all-clear. */}
          {healthReport.totalIssues > 0 ? (
            <button
              type="button"
              data-testid="lab-health-chip"
              onClick={() => selectView("health")}
              title="Open the Catalog-health view"
              style={{
                marginLeft: "auto",
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
              }}
            >
              <LabChip tone="accent">
                {healthReport.totalIssues} issue
                {healthReport.totalIssues === 1 ? "" : "s"}
              </LabChip>
            </button>
          ) : null}
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
        Toggles control per-surface visibility (subtract-only: a component can&apos;t be forced onto a
        surface its <code>target_context</code> excludes; locked cells show that). Renames apply to both
        builders&apos; &quot;+&quot; gallery on next open. Built-in components can be hidden, renamed,
        re-iconed, or plan-gated here; changing their internal structure is a code change.
      </p>
    </>
  );
}
