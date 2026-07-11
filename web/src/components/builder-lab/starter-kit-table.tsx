"use client";

/**
 * The table half of the Site Starter Kit view — StarterTable (+ its EditAccordionRow,
 * Field, Th cells) and the PlatformStarterRecovery section — split out of
 * catalog-starter-kit.tsx to keep it under the 800-line max-lines cap. These are
 * presentational: all state lives in SiteStarterKitView and is threaded via props
 * (StarterTableProps). Pure helpers + EditDraft come from starter-kit-helpers.ts.
 */
import { Fragment } from "react";

import type { ComponentDependent } from "@/lib/site-admin/builder-core/templates/dependency-scan";
import type {
  BuilderTemplateRow,
  BuilderTemplateTarget,
} from "@/lib/site-admin/builder-core/templates/registry-rows";
import { TemplateThumbnailCell } from "./template-thumbnail-cell";
import { rolloutChipText } from "./template-rollout-panel";
import {
  openStarterPreview,
  statusOptionsFor,
  targetLabel,
  toLabStatus,
  type EditDraft,
} from "./starter-kit-helpers";
import {
  LAB as T,
  fieldStyle,
  panelStyle,
  LabBadge,
  LabChip,
  LinkBtn,
  LabStatusDropdown,
  SectionLabel,
  type LabStatus,
} from "./ui";

// ── Platform-target recovery section ──────────────────────────────────────

/** Renders starters whose target_context="platform" in a clearly-labeled
 *  warning section below the normal surface kits. Each row is fully editable
 *  so the admin can re-target it to agency / talent / both and make it
 *  reachable again. The "platform" option is intentionally absent from the
 *  Target select so new dead-ends cannot be created. */
export function PlatformStarterRecovery(props: StarterTableProps) {
  return (
    <div data-testid="lab-starter-platform-recovery">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 6,
        }}
      >
        <SectionLabel>Platform-targeted starters (unreachable)</SectionLabel>
      </div>
      <div
        style={{
          fontSize: 12,
          color: T.red,
          background: `${T.red}12`,
          border: `1px solid ${T.red}30`,
          borderRadius: 6,
          padding: "8px 12px",
          marginBottom: 8,
          lineHeight: 1.55,
        }}
        role="alert"
      >
        These starters have <strong>target = Platform</strong> and are hidden
        from both the Agency and Talent kits. Re-target each one to{" "}
        <strong>Agency</strong>, <strong>Talent</strong>, or{" "}
        <strong>Both</strong> using the Edit form to make it reachable.
      </div>
      <StarterTable {...props} />
    </div>
  );
}

// ── Table ──────────────────────────────────────────────────────────────────

export interface StarterTableProps {
  rows: BuilderTemplateRow[];
  pendingId: string | null;
  editingId: string | null;
  edit: EditDraft | null;
  setEdit: (e: EditDraft) => void;
  confirmingDeleteId: string | null;
  /** G5 — published templates depending on the starter pending delete confirm. */
  deleteDependents: ComponentDependent[];
  /** G5 — true while the pre-delete dependency scan is in flight. */
  scanningDelete: boolean;
  /** A3 — id of the row whose export fetch is in flight. */
  exportingId: string | null;
  /** A2 — media scope for the thumbnail picker (hub tenant; null = disabled). */
  mediaTenantId: string | null;
  /** A2 — resolved starter id → thumbnail public URL. */
  thumbUrlByRow: Map<string, string>;
  /** A2 — id of the starter whose thumbnail is currently saving. */
  thumbBusyId: string | null;
  /** A2 — persist a starter's thumbnail (assetId=null clears it). */
  onSetThumbnail: (
    rowId: string,
    assetId: string | null,
    publicUrl: string | null,
  ) => void;
  onRowClick: (row: BuilderTemplateRow) => void;
  onSaveEdit: (row: BuilderTemplateRow) => void;
  onCancelEdit: () => void;
  onOpen: (row: BuilderTemplateRow) => void;
  onDuplicate: (row: BuilderTemplateRow) => void;
  /** A3 — serialize and download this row as `<slug>.template.json`. */
  onExport: (row: BuilderTemplateRow) => void;
  onSetStatus: (row: BuilderTemplateRow, next: LabStatus) => void;
  onStartDelete: (row: BuilderTemplateRow) => void;
  onCancelDelete: () => void;
  onConfirmDelete: (row: BuilderTemplateRow) => void;
}

export function StarterTable(props: StarterTableProps) {
  const {
    rows,
    pendingId,
    editingId,
    confirmingDeleteId,
    deleteDependents,
    scanningDelete,
    exportingId,
    mediaTenantId,
    thumbUrlByRow,
    thumbBusyId,
    onSetThumbnail,
    onRowClick,
    onSaveEdit,
    onCancelEdit,
    onOpen,
    onDuplicate,
    onExport,
    onSetStatus,
    onStartDelete,
    onCancelDelete,
    onConfirmDelete,
  } = props;

  return (
    <section style={{ ...panelStyle, overflow: "hidden" }}>
      <table
        style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}
      >
        <thead>
          <tr style={{ color: T.inkDim }}>
            <Th>Thumb</Th>
            <Th>Name</Th>
            <Th>Category</Th>
            <Th>Tags</Th>
            <Th>Target</Th>
            <Th center>Status</Th>
            <Th>Rollout</Th>
            <Th right>Manage</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const busy = pendingId === r.id;
            const exporting = exportingId === r.id;
            const editing = editingId === r.id;
            return (
              <Fragment key={r.id}>
                <tr
                  data-testid={`lab-starter-row-${r.id}`}
                  onClick={(e) => {
                    if (
                      (e.target as HTMLElement).closest(
                        "button, input, a, select, textarea",
                      )
                    )
                      return;
                    onRowClick(r);
                  }}
                  style={{
                    borderTop: `1px solid ${T.borderSoft}`,
                    opacity: busy ? 0.55 : 1,
                    cursor: "pointer",
                  }}
                >
                  <td style={{ padding: "10px 16px", verticalAlign: "top" }}>
                    <TemplateThumbnailCell
                      tenantId={mediaTenantId}
                      thumbUrl={thumbUrlByRow.get(r.id) ?? null}
                      busy={thumbBusyId === r.id}
                      size="sm"
                      onPick={(assetId, publicUrl) =>
                        onSetThumbnail(r.id, assetId, publicUrl)
                      }
                    />
                  </td>
                  <td style={{ padding: "10px 16px" }}>
                    <div
                      style={{ color: T.ink, fontWeight: 600, minWidth: 0 }}
                    >
                      {r.title || "Untitled"}
                    </div>
                    <div
                      style={{
                        color: T.inkDim,
                        fontSize: 10.5,
                        fontFamily: "ui-monospace, monospace",
                      }}
                    >
                      {r.slug}
                    </div>
                  </td>
                  <td style={{ padding: "10px 16px", color: T.inkMuted }}>
                    {r.category}
                  </td>
                  <td style={{ padding: "10px 16px" }}>
                    {r.tags.length ? (
                      <span
                        style={{
                          display: "inline-flex",
                          flexWrap: "wrap",
                          gap: 4,
                        }}
                      >
                        {r.tags.map((tag) => (
                          <LabChip key={tag} tone="neutral">
                            {tag}
                          </LabChip>
                        ))}
                      </span>
                    ) : (
                      <span style={{ color: T.inkDim }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: "10px 16px" }}>
                    <LabBadge tone="muted">
                      {targetLabel(r.target_context)}
                    </LabBadge>
                  </td>
                  <td style={{ padding: "10px 16px", textAlign: "center" }}>
                    <LabStatusDropdown
                      testId={`lab-starter-status-${r.id}`}
                      status={toLabStatus(r.status)}
                      options={statusOptionsFor(toLabStatus(r.status))}
                      busy={busy}
                      onSelect={(next) => onSetStatus(r, next)}
                    />
                  </td>
                  {/* Rollout chip — shown when the starter has non-default
                      rollout settings; empty cell when fully rolled out. */}
                  <td style={{ padding: "10px 16px", whiteSpace: "nowrap" }}>
                    {(() => {
                      const chip = rolloutChipText(r);
                      return chip !== null ? (
                        <LabChip
                          tone="lock"
                          title={`Canary rollout active: ${chip}`}
                        >
                          {chip}
                        </LabChip>
                      ) : (
                        <span
                          style={{ fontSize: 10, color: T.inkDim }}
                          title="Fully rolled out to all tenants"
                        >
                          100%
                        </span>
                      );
                    })()}
                  </td>
                  <td
                    style={{
                      padding: "10px 16px",
                      textAlign: "right",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {editing ? (
                      <span style={{ display: "inline-flex", gap: 10 }}>
                        <LinkBtn
                          label="Save"
                          testId={`lab-starter-save-${r.id}`}
                          onClick={() => onSaveEdit(r)}
                          disabled={busy}
                          primary
                        />
                        <LinkBtn
                          label="Cancel"
                          onClick={onCancelEdit}
                          disabled={busy}
                        />
                      </span>
                    ) : confirmingDeleteId === r.id ? (
                      <span
                        style={{
                          display: "inline-flex",
                          flexDirection: "column",
                          gap: 6,
                          alignItems: "flex-end",
                          textAlign: "right",
                        }}
                      >
                        {scanningDelete ? (
                          <span
                            style={{ fontSize: 11, color: T.inkMuted }}
                          >
                            Checking dependents…
                          </span>
                        ) : deleteDependents.length > 0 ? (
                          <span
                            style={{
                              fontSize: 11,
                              color: T.inkMuted,
                              maxWidth: 320,
                              whiteSpace: "normal",
                            }}
                          >
                            {deleteDependents.length} published template
                            {deleteDependents.length === 1 ? "" : "s"} depend on
                            this component:{" "}
                            <strong style={{ color: T.ink }}>
                              {deleteDependents.map((d) => d.title).join(", ")}
                            </strong>
                            . Archive anyway?
                          </span>
                        ) : (
                          <span
                            style={{ fontSize: 11, color: T.inkMuted }}
                          >
                            Delete this starter?
                          </span>
                        )}
                        <span
                          style={{
                            display: "inline-flex",
                            gap: 8,
                            alignItems: "center",
                          }}
                        >
                          <LinkBtn
                            label={
                              deleteDependents.length > 0
                                ? "Archive anyway"
                                : "Yes"
                            }
                            onClick={() => onConfirmDelete(r)}
                            disabled={busy || scanningDelete}
                            danger
                          />
                          <LinkBtn
                            label="No"
                            onClick={onCancelDelete}
                            disabled={busy}
                          />
                        </span>
                      </span>
                    ) : (
                      <span style={{ display: "inline-flex", gap: 10 }}>
                        <LinkBtn
                          label="Edit"
                          onClick={() => onRowClick(r)}
                          disabled={busy}
                        />
                        <LinkBtn
                          label="Open preview"
                          testId={`lab-starter-preview-${r.id}`}
                          onClick={() => openStarterPreview(r)}
                          disabled={busy}
                        />
                        <LinkBtn
                          label="Open in builder"
                          onClick={() => onOpen(r)}
                          disabled={busy}
                        />
                        <LinkBtn
                          label="Duplicate"
                          onClick={() => onDuplicate(r)}
                          disabled={busy}
                        />
                        <LinkBtn
                          label={exporting ? "Exporting…" : "Export"}
                          testId={`lab-starter-export-${r.id}`}
                          onClick={() => onExport(r)}
                          disabled={busy || exporting}
                        />
                        <LinkBtn
                          label="Delete"
                          onClick={() => onStartDelete(r)}
                          disabled={busy}
                          danger
                        />
                      </span>
                    )}
                  </td>
                </tr>
                {editing && props.edit ? (
                  <EditAccordionRow
                    row={r}
                    edit={props.edit}
                    setEdit={props.setEdit}
                  />
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

// ── Inline metadata editor ───────────────────────────────────────────────────

function EditAccordionRow({
  row,
  edit,
  setEdit,
}: {
  row: BuilderTemplateRow;
  edit: EditDraft;
  setEdit: (e: EditDraft) => void;
}) {
  return (
    <tr style={{ background: T.cardSoft }}>
      <td colSpan={8} style={{ padding: "12px 16px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <SectionLabel>Edit starter</SectionLabel>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              alignItems: "flex-start",
            }}
          >
            <Field label="Name">
              <input
                data-testid={`lab-starter-edit-title-${row.id}`}
                value={edit.title}
                onChange={(e) => setEdit({ ...edit, title: e.target.value })}
                placeholder="Starter name"
                style={{ ...inputStyle, width: 240 }}
              />
            </Field>
            <Field label="Category">
              <input
                value={edit.category}
                onChange={(e) =>
                  setEdit({ ...edit, category: e.target.value })
                }
                placeholder={row.category}
                style={{ ...inputStyle, width: 170 }}
              />
            </Field>
            <Field label="Target">
              <select
                value={edit.target === "platform" ? "both" : edit.target}
                onChange={(e) =>
                  setEdit({
                    ...edit,
                    target: e.target.value as BuilderTemplateTarget,
                  })
                }
                style={{ ...inputStyle, width: 150 }}
              >
                <option value="workspace">Agency (workspace)</option>
                <option value="talent">Talent</option>
                <option value="both">Both</option>
                {/* "platform" is intentionally omitted — starters are
                    agency/talent/both only. Existing platform rows are shown
                    in the recovery section below the kit tables. */}
              </select>
            </Field>
            <Field label="Tags (comma-separated)">
              <input
                value={edit.tags}
                onChange={(e) => setEdit({ ...edit, tags: e.target.value })}
                placeholder="e.g. agency, editorial"
                style={{ ...inputStyle, width: 260 }}
              />
            </Field>
          </div>
          <Field label="Description">
            <textarea
              value={edit.description}
              onChange={(e) =>
                setEdit({ ...edit, description: e.target.value })
              }
              placeholder="One-line description shown on the starter."
              rows={2}
              style={{
                ...inputStyle,
                width: "100%",
                maxWidth: 560,
                minHeight: 52,
                resize: "vertical",
              }}
            />
          </Field>
          <span style={{ fontSize: 11, color: T.inkDim, lineHeight: 1.5 }}>
            Metadata only. Target controls which kit (Agency / Talent / Both)
            lists the starter and which surface the builders&apos; &quot;+&quot;
            gallery offers it on. &quot;Platform&quot; is not a valid starter
            target, use Both if the starter suits all surfaces. Editing a
            built-in&apos;s metadata here is overwritten the next time you sync
            built-in starters.
          </span>
        </div>
      </td>
    </tr>
  );
}

// ── Primitives (match catalog-row-table.tsx) ─────────────────────────────────

const inputStyle: React.CSSProperties = { ...fieldStyle, width: 220 };

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span
        style={{
          fontSize: 10,
          color: T.inkMuted,
          letterSpacing: 0.4,
          textTransform: "uppercase",
        }}
      >
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
}: {
  children: React.ReactNode;
  center?: boolean;
  right?: boolean;
}) {
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

// ── A7: collapsible per-category sections (extracted from SiteStarterKitView) ──

/** Renders starter rows grouped into collapsible per-category sections with a
 *  quick category-rename affordance. State lives in SiteStarterKitView and is
 *  threaded in via props (same names as the originating locals, so the JSX is a
 *  verbatim move). */
export function StarterCategoryGroups({
  categoryGroups,
  collapsedCategories,
  renamingCategory,
  renameValue,
  renameBusy,
  toggleCollapse,
  saveCategoryRename,
  cancelCategoryRename,
  startCategoryRename,
  setRenameValue,
  tableProps,
}: {
  categoryGroups: ReadonlyArray<{ category: string; rows: BuilderTemplateRow[] }>;
  collapsedCategories: Set<string>;
  renamingCategory: string | null;
  renameValue: string;
  renameBusy: boolean;
  toggleCollapse: (category: string) => void;
  saveCategoryRename: (category: string) => void;
  cancelCategoryRename: () => void;
  startCategoryRename: (category: string) => void;
  setRenameValue: (value: string) => void;
  tableProps: Omit<StarterTableProps, "rows">;
}) {
  return (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {categoryGroups.map(({ category, rows: catRows }) => {
            const collapsed = collapsedCategories.has(category);
            const isRenaming = renamingCategory === category;
            return (
              <div key={category} data-testid={`lab-starter-category-${category}`}>
                {/* Category section header */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: collapsed ? 0 : 6,
                    padding: "4px 0",
                  }}
                >
                  {/* Collapse toggle */}
                  <button
                    type="button"
                    aria-expanded={!collapsed}
                    aria-label={
                      collapsed
                        ? `Expand ${category} category`
                        : `Collapse ${category} category`
                    }
                    onClick={() => toggleCollapse(category)}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: T.inkDim,
                      cursor: "pointer",
                      fontSize: 11,
                      padding: "2px 4px",
                      lineHeight: 1,
                      borderRadius: 4,
                    }}
                  >
                    {collapsed ? "▶" : "▼"}
                  </button>

                  {/* Category name / rename input */}
                  {isRenaming ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <input
                        data-testid={`lab-starter-category-rename-input-${category}`}
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void saveCategoryRename(category);
                          if (e.key === "Escape") cancelCategoryRename();
                        }}
                        autoFocus
                        style={{
                          ...fieldStyle,
                          fontSize: 11.5,
                          padding: "3px 8px",
                          width: 180,
                        }}
                        disabled={renameBusy}
                      />
                      <LinkBtn
                        label={renameBusy ? "Saving…" : "Save"}
                        testId={`lab-starter-category-rename-save-${category}`}
                        onClick={() => void saveCategoryRename(category)}
                        disabled={renameBusy}
                        primary
                      />
                      <LinkBtn
                        label="Cancel"
                        onClick={cancelCategoryRename}
                        disabled={renameBusy}
                      />
                    </span>
                  ) : (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      <SectionLabel>{category}</SectionLabel>
                      <LabChip tone="neutral">
                        {catRows.length}
                      </LabChip>
                      {/* Quick-rename button */}
                      <button
                        type="button"
                        data-testid={`lab-starter-category-rename-btn-${category}`}
                        title={`Rename "${category}" category across all starters`}
                        onClick={() => startCategoryRename(category)}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: T.inkDim,
                          cursor: "pointer",
                          fontSize: 10,
                          fontWeight: 600,
                          padding: "1px 5px",
                          borderRadius: 4,
                          lineHeight: 1.4,
                        }}
                      >
                        Rename
                      </button>
                    </span>
                  )}
                </div>

                {/* Category rows table (hidden when collapsed) */}
                {collapsed ? null : (
                  <StarterTable rows={catRows} {...tableProps} />
                )}
              </div>
            );
          })}
        </div>
  );
}
