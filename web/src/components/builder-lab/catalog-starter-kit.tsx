"use client";

/**
 * SiteStarterKitView (Catalog) — the full-page STARTER manager.
 *
 * Was a read-only grid of the hardcoded `PAGE_DESIGN_SUMMARIES`. Now a
 * DB-backed, manageable TABLE over `builder_templates` rows on the
 * `page_templates` gallery tab (the same rows the live builders' "+" → Page
 * Templates tab serves), styled like the component-catalog table.
 *
 * Per row the admin can: inline-edit metadata (title / description / category /
 * tags / target), open it in the page builder, duplicate it, archive (delete)
 * it, and publish / unpublish it. "Sync built-in starters" imports/refreshes the
 * hand-authored PAGE_DESIGNS into this table (idempotent).
 *
 * The Agency / Talent switcher filters by `target_context` (Agency = workspace
 * OR both; Talent = talent OR both), matching Site Defaults / Connected.
 *
 * All mutations reuse the existing super_admin-gated registry actions; this view
 * adds no parallel CRUD path.
 */

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";

import {
  archiveTemplate,
  duplicateTemplate,
  publishTemplate,
  rejectToDraft,
  submitTemplateForReview,
  unpublishTemplate,
  updateTemplateDraft,
} from "@/lib/site-admin/builder-core/templates/registry-actions";
import {
  listStarterTemplatesAction,
  syncBuiltinStartersAction,
} from "@/lib/site-admin/builder-core/templates/import-builtin-starters";
import type {
  BuilderTemplateRow,
  BuilderTemplateTarget,
} from "@/lib/site-admin/builder-core/templates/registry-rows";
import { getTemplatePreviewUrl } from "@/lib/site-admin/builder-core/templates/template-def";
import {
  isPartialRollout,
  rolloutChipText,
} from "./template-rollout-panel";
import { SurfaceSwitcher } from "./surface-switcher";
import type { BuilderLabTarget } from "./builder-lab-stage";
import {
  LAB as T,
  fieldStyle,
  panelStyle,
  LabButton,
  LabBadge,
  LabChip,
  LabToast,
  LabViewHeader,
  LinkBtn,
  LabStatusDropdown,
  LAB_STATUS_LABEL,
  SectionLabel,
  EmptyCard,
  type LabStatus,
  type LabStatusOption,
} from "./ui";

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

/** A row belongs to a surface group when it targets that surface or "both".
 *  Rows with target_context="platform" match neither surface and are shown in a
 *  dedicated recovery section so they are always reachable. */
function rowTargetsSurface(
  target: BuilderTemplateTarget,
  surface: "talent" | "workspace",
): boolean {
  return target === surface || target === "both";
}

/** Returns rows whose target_context is "platform" — these are unreachable via
 *  the normal Agency / Talent surface filters and need a recovery section. */
function platformTargetRows(rows: BuilderTemplateRow[]): BuilderTemplateRow[] {
  return rows.filter((r) => r.target_context === "platform");
}

/** builder_templates target_context → the editor's launch target. */
function targetToLabTarget(t: BuilderTemplateTarget): BuilderLabTarget {
  return t === "talent" || t === "workspace" ? t : "both";
}

/** Open the SHARED hydrated `/template-preview` route for a persisted starter in
 *  a new tab. The `db-template` family keys on the row id and renders its
 *  authored `builder_tree` through the freeform renderer — no second render
 *  path. */
function openStarterPreview(row: BuilderTemplateRow): void {
  if (typeof window === "undefined") return;
  window.open(
    getTemplatePreviewUrl(row.id, { family: "db-template" }),
    "_blank",
    "noopener,noreferrer",
  );
}

/** Human label for the Target badge. */
function targetLabel(t: BuilderTemplateTarget): string {
  switch (t) {
    case "talent":
      return "Talent";
    case "workspace":
      return "Agency";
    case "both":
      return "Both";
    default:
      return "Platform";
  }
}

const STATUS_ORDER: ReadonlyArray<LabStatus> = [
  "draft",
  "in_review",
  "published",
  "archived",
];

/** Legal transitions for a starter (= DB template) row, mirroring the guarded
 *  registry actions. Disabled options stay visible (so the full ladder always
 *  reads) but inert, with a why-not tooltip. */
function statusOptionsFor(current: LabStatus): LabStatusOption[] {
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

/** Coerce a starter row's status string to the LabStatus union. */
function toLabStatus(status: string): LabStatus {
  return status === "draft" ||
    status === "in_review" ||
    status === "published" ||
    status === "archived"
    ? status
    : "draft";
}

/** Parse the Tags input (comma / newline separated) into a deduped array. */
function parseTags(raw: string): string[] {
  const seen = new Set<string>();
  for (const tok of raw.split(/[,\n]+/)) {
    const tag = tok.trim();
    if (tag) seen.add(tag);
  }
  return [...seen];
}

interface EditDraft {
  title: string;
  description: string;
  category: string;
  tags: string;
  target: BuilderTemplateTarget;
}

export function SiteStarterKitView({
  onLaunchEditor,
}: {
  onLaunchEditor?: (target: BuilderLabTarget, draftId?: string) => void;
}) {
  const [surface, setSurface] = useState<"talent" | "workspace">("workspace");
  const [rows, setRows] = useState<BuilderTemplateRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditDraft | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(
    null,
  );
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  /** "all" = no rollout filter; "partial" = only canaried starters */
  const [rolloutFilter, setRolloutFilter] = useState<"all" | "partial">("all");

  const flash = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), T.toastMs);
  }, []);

  const reload = useCallback(async () => {
    const res = await listStarterTemplatesAction();
    if (res.ok) {
      setRows(res.data);
    } else {
      setError(res.error);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    listStarterTemplatesAction()
      .then((res) => {
        if (cancelled) return;
        if (res.ok) setRows(res.data);
        else setError(res.error);
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load starters.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Run a per-row mutation with explicit pending state, then reload. */
  const mutate = useCallback(
    async (id: string, run: () => Promise<{ ok: boolean; error?: string }>) => {
      setPendingId(id);
      setError(null);
      try {
        const res = await run();
        if (!res.ok) setError(res.error ?? "Update failed.");
        await reload();
        return res.ok;
      } catch {
        setError("Update failed.");
        return false;
      } finally {
        setPendingId(null);
      }
    },
    [reload],
  );

  const startEdit = useCallback((row: BuilderTemplateRow) => {
    setConfirmingDeleteId(null);
    setEditingId(row.id);
    setEdit({
      title: row.title,
      description: row.description ?? "",
      category: row.category,
      tags: row.tags.join(", "),
      target: row.target_context,
    });
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEdit(null);
  }, []);

  const saveEdit = useCallback(
    (row: BuilderTemplateRow) => {
      if (!edit) return;
      const title = edit.title.trim();
      if (!title) {
        setError("Title can't be empty.");
        return;
      }
      void mutate(row.id, () =>
        updateTemplateDraft({
          id: row.id,
          title,
          description: edit.description.trim() || null,
          category: edit.category.trim() || row.category,
          tags: parseTags(edit.tags),
          target_context: edit.target,
        }),
      ).then((ok) => {
        if (ok) {
          cancelEdit();
          flash("Saved ✓");
        }
      });
    },
    [edit, mutate, cancelEdit, flash],
  );

  // Full lifecycle transition for a starter row. Each starter is a DB template,
  // so this dispatches the EXISTING super_admin registry actions — no parallel
  // CRUD path. Only the legal transition for the row's current status is enabled
  // by the dropdown (see statusOptionsFor), so in_review / archived are now
  // reachable here (previously the row only toggled published↔draft).
  const setStatus = useCallback(
    (row: BuilderTemplateRow, next: LabStatus) => {
      const action =
        next === "in_review"
          ? () => submitTemplateForReview(row.id)
          : next === "published"
            ? () => publishTemplate(row.id)
            : next === "archived"
              ? () => archiveTemplate(row.id)
              : // → draft: from in_review use rejectToDraft, else unpublish.
                row.status === "in_review"
                ? () => rejectToDraft(row.id)
                : () => unpublishTemplate(row.id);
      void mutate(row.id, action).then((ok) => {
        if (ok) {
          const labels: Record<LabStatus, string> = {
            draft: "Moved to draft",
            in_review: "Submitted for review",
            published: "Published ✓",
            archived: "Archived",
          };
          flash(labels[next]);
        }
      });
    },
    [mutate, flash],
  );

  const duplicate = useCallback(
    (row: BuilderTemplateRow) => {
      void mutate(row.id, () => duplicateTemplate(row.id)).then((ok) => {
        if (ok) flash(`Duplicated "${row.title}"`);
      });
    },
    [mutate, flash],
  );

  const confirmDelete = useCallback(
    (row: BuilderTemplateRow) => {
      setConfirmingDeleteId(null);
      void mutate(row.id, () => archiveTemplate(row.id)).then((ok) => {
        if (ok) flash("Deleted");
      });
    },
    [mutate, flash],
  );

  const runSync = useCallback(async () => {
    setSyncing(true);
    setError(null);
    try {
      const res = await syncBuiltinStartersAction();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const { imported, updated, errors } = res.data;
      await reload();
      const parts: string[] = [];
      if (imported) parts.push(`${imported} imported`);
      if (updated) parts.push(`${updated} refreshed`);
      flash(
        `Built-in starters synced — ${parts.join(", ") || "no changes"}` +
          (errors.length ? ` · ${errors.length} error(s)` : ""),
      );
      if (errors.length) setError(errors.join(" · "));
    } catch {
      setError("Sync failed.");
    } finally {
      setSyncing(false);
    }
  }, [reload, flash]);

  const group = STARTER_KIT_GROUPS.find((g) => g.key === surface);
  const surfaceRows = useMemo(
    () =>
      (rows ?? [])
        .filter((r) => rowTargetsSurface(r.target_context, surface))
        .sort(
          (a, b) =>
            a.category.localeCompare(b.category) ||
            a.title.localeCompare(b.title),
        ),
    [rows, surface],
  );
  const visibleRows = useMemo(
    () =>
      rolloutFilter === "partial"
        ? surfaceRows.filter(isPartialRollout)
        : surfaceRows,
    [surfaceRows, rolloutFilter],
  );
  /** Count of canaried starters in the current surface group — drives the
   *  "Partial rollout (N)" filter chip visibility. */
  const partialRolloutCount = useMemo(
    () => surfaceRows.filter(isPartialRollout).length,
    [surfaceRows],
  );

  /** Starters with target_context="platform" are invisible to the Agency/Talent
   *  filters. Expose them here so they can be re-targeted. */
  const platformRows = useMemo(
    () =>
      platformTargetRows(rows ?? []).sort(
        (a, b) =>
          a.category.localeCompare(b.category) || a.title.localeCompare(b.title),
      ),
    [rows],
  );

  return (
    <div
      data-testid="lab-starter-kit-root"
      style={{ display: "flex", flexDirection: "column", gap: 14 }}
    >
      <LabViewHeader
        title="Site Starter Kit"
        blurb="Full-page starters in the page-templates gallery. Edit, tag, publish, or open them in the builder. Sync pulls in the built-in designs."
        actions={
          <LabButton
            variant="secondary"
            disabled={syncing}
            onClick={() => void runSync()}
            ariaLabel="Sync built-in starters"
          >
            {syncing ? "Syncing…" : "Sync built-in starters"}
          </LabButton>
        }
      />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <SurfaceSwitcher
          options={STARTER_KIT_GROUPS}
          value={surface}
          onChange={(s) => {
            setSurface(s);
            // Reset rollout filter when switching surface so the count
            // reflects the new surface's rows.
            setRolloutFilter("all");
          }}
          ariaLabel="Starter kit surface"
        />
        {/* Partial-rollout filter — only shown when this surface has canaried starters */}
        {partialRolloutCount > 0 ? (
          <button
            type="button"
            onClick={() =>
              setRolloutFilter((f) => (f === "partial" ? "all" : "partial"))
            }
            style={{
              background:
                rolloutFilter === "partial"
                  ? "rgba(155,168,183,0.20)"
                  : "transparent",
              color: rolloutFilter === "partial" ? "#B6C2CF" : T.inkMuted,
              border: `1px solid ${
                rolloutFilter === "partial"
                  ? "rgba(155,168,183,0.40)"
                  : T.borderSoft
              }`,
              fontSize: 11.5,
              fontWeight: 600,
              padding: "5px 12px",
              borderRadius: 999,
              cursor: "pointer",
            }}
          >
            {rolloutFilter === "partial"
              ? "Partial rollout ×"
              : `Partial rollout (${partialRolloutCount})`}
          </button>
        ) : null}
      </div>
      {group ? (
        <div style={{ fontSize: 12, color: T.inkMuted }}>{group.blurb}</div>
      ) : null}

      {toast ? <LabToast>{toast}</LabToast> : null}
      {error ? <div style={{ fontSize: 12, color: T.red }}>{error}</div> : null}

      {rows === null ? (
        <div style={{ color: T.inkMuted, fontSize: 13, padding: "10px 0" }}>
          Loading starters…
        </div>
      ) : visibleRows.length === 0 ? (
        <EmptyCard>
          {rolloutFilter === "partial" ? (
            <>
              No partially-rolled-out starters on this surface. Toggle off
              the filter to see all starters.
            </>
          ) : (
            <>
              No starters target this surface yet. Hit{" "}
              <strong>Sync built-in starters</strong> to import the built-in
              designs, or create one in the Playground.
            </>
          )}
        </EmptyCard>
      ) : (
        <StarterTable
          rows={visibleRows}
          pendingId={pendingId}
          editingId={editingId}
          edit={edit}
          setEdit={setEdit}
          confirmingDeleteId={confirmingDeleteId}
          onRowClick={(r) =>
            editingId === r.id ? cancelEdit() : startEdit(r)
          }
          onSaveEdit={saveEdit}
          onCancelEdit={cancelEdit}
          onOpen={(r) =>
            onLaunchEditor?.(targetToLabTarget(r.target_context), r.id)
          }
          onDuplicate={duplicate}
          onSetStatus={setStatus}
          onStartDelete={(id) => setConfirmingDeleteId(id)}
          onCancelDelete={() => setConfirmingDeleteId(null)}
          onConfirmDelete={confirmDelete}
        />
      )}

      {/* Recovery section — starters with target_context="platform" are hidden
          from both the Agency and Talent kit filters. Show them here so the
          admin can re-target them to agency / talent / both. */}
      {platformRows.length > 0 ? (
        <PlatformStarterRecovery
          rows={platformRows}
          pendingId={pendingId}
          editingId={editingId}
          edit={edit}
          setEdit={setEdit}
          confirmingDeleteId={confirmingDeleteId}
          onRowClick={(r) => (editingId === r.id ? cancelEdit() : startEdit(r))}
          onSaveEdit={saveEdit}
          onCancelEdit={cancelEdit}
          onOpen={(r) =>
            onLaunchEditor?.(targetToLabTarget(r.target_context), r.id)
          }
          onDuplicate={duplicate}
          onSetStatus={setStatus}
          onStartDelete={(id) => setConfirmingDeleteId(id)}
          onCancelDelete={() => setConfirmingDeleteId(null)}
          onConfirmDelete={confirmDelete}
        />
      ) : null}
    </div>
  );
}

// ── Platform-target recovery section ──────────────────────────────────────

/** Renders starters whose target_context="platform" in a clearly-labeled
 *  warning section below the normal surface kits. Each row is fully editable
 *  so the admin can re-target it to agency / talent / both and make it
 *  reachable again. The "platform" option is intentionally absent from the
 *  Target select so new dead-ends cannot be created. */
function PlatformStarterRecovery(props: StarterTableProps) {
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

interface StarterTableProps {
  rows: BuilderTemplateRow[];
  pendingId: string | null;
  editingId: string | null;
  edit: EditDraft | null;
  setEdit: (e: EditDraft) => void;
  confirmingDeleteId: string | null;
  onRowClick: (row: BuilderTemplateRow) => void;
  onSaveEdit: (row: BuilderTemplateRow) => void;
  onCancelEdit: () => void;
  onOpen: (row: BuilderTemplateRow) => void;
  onDuplicate: (row: BuilderTemplateRow) => void;
  onSetStatus: (row: BuilderTemplateRow, next: LabStatus) => void;
  onStartDelete: (id: string) => void;
  onCancelDelete: () => void;
  onConfirmDelete: (row: BuilderTemplateRow) => void;
}

function StarterTable(props: StarterTableProps) {
  const {
    rows,
    pendingId,
    editingId,
    confirmingDeleteId,
    onRowClick,
    onSaveEdit,
    onCancelEdit,
    onOpen,
    onDuplicate,
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
                          gap: 8,
                          alignItems: "center",
                        }}
                      >
                        <span style={{ fontSize: 11, color: T.inkMuted }}>
                          Delete this starter?
                        </span>
                        <LinkBtn
                          label="Yes"
                          onClick={() => onConfirmDelete(r)}
                          disabled={busy}
                          danger
                        />
                        <LinkBtn
                          label="No"
                          onClick={onCancelDelete}
                          disabled={busy}
                        />
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
                          label="Delete"
                          onClick={() => onStartDelete(r.id)}
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
      <td colSpan={7} style={{ padding: "12px 16px" }}>
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
            target — use Both if the starter suits all surfaces. Editing a
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

