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
 * A7 additions: collapsible category sections with per-category counts + a
 * category/tag filter bar (reuse PillToggle pattern) + a quick category rename
 * affordance per section header (calls renameTemplateCategory server action so
 * ALL starters in the category are re-tagged at once).
 *
 * All mutations reuse the existing super_admin-gated registry actions; this view
 * adds no parallel CRUD path.
 */

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  archiveTemplate,
  createTemplateDraft,
  duplicateTemplate,
  publishTemplate,
  rejectToDraft,
  scanComponentDependents,
  submitTemplateForReview,
  unpublishTemplate,
  updateTemplateDraft,
} from "@/lib/site-admin/builder-core/templates/registry-actions";
import type { ComponentDependent } from "@/lib/site-admin/builder-core/templates/dependency-scan";
import {
  listStarterTemplatesAction,
  syncBuiltinStartersAction,
} from "@/lib/site-admin/builder-core/templates/import-builtin-starters";
import {
  getTemplateById,
  resolveLabMediaTenantId,
  resolveTemplateThumbnails,
} from "@/lib/site-admin/builder-core/templates/registry-admin-actions";
import { triggerTemplateDownload } from "./template-export";
import {
  parsePortableTemplate,
  buildImportDraftInput,
} from "./template-import";
import { mintCopySlug } from "@/lib/site-admin/builder-core/templates/slug-minting";
import { renameTemplateCategory } from "@/lib/site-admin/builder-core/templates/taxonomy-actions";
import {
  distinctThumbnailAssetIds,
  resolveTemplateThumbnailMap,
  templateThumbnailPatch,
} from "./thumbnail-helpers";
import { TemplateThumbnailCell } from "./template-thumbnail-cell";
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
  groupByCategory,
  categoryFilterOptions,
  applyStarterCategoryFilter,
} from "./catalog-starter-kit-grouping";
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
  PillToggle,
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
  // G5 — dependents found for the starter currently pending delete confirm.
  // Non-empty → the confirm shows "archive anyway, N templates depend on this"
  // and lists them; the actual archive then passes confirmDependents: true.
  const [deleteDependents, setDeleteDependents] = useState<ComponentDependent[]>(
    [],
  );
  const [scanningDeleteId, setScanningDeleteId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  /** "all" = no rollout filter; "partial" = only canaried starters */
  const [rolloutFilter, setRolloutFilter] = useState<"all" | "partial">("all");
  // A2 — thumbnail affordance: media scope (hub tenant) + resolved row→url map +
  // the id of the starter whose thumbnail is currently saving.
  const [mediaTenantId, setMediaTenantId] = useState<string | null>(null);
  const [thumbUrlByRow, setThumbUrlByRow] = useState<Map<string, string>>(
    new Map(),
  );
  const [thumbBusyId, setThumbBusyId] = useState<string | null>(null);
  // A7 — category filter: "all" or a specific category string
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  // A7 — which category section is currently collapsed (set of category names)
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(
    new Set(),
  );
  // A3 — id of the row currently being exported (shows "Exporting…" while the
  // server action fetch is in flight for built-in templates).
  const [exportingId, setExportingId] = useState<string | null>(null);
  // A7 — quick-rename: the category being renamed and the draft value
  const [renamingCategory, setRenamingCategory] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  // A4 — import: busy flag (true while the server action is in flight);
  // a hidden <input type="file"> ref used to trigger the file picker.
  const [importing, setImporting] = useState(false);
  const importFileRef = useRef<HTMLInputElement | null>(null);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), T.toastMs);
  }, []);

  /** Resolve every starter's thumbnail asset id → public URL in one batch. */
  const refreshThumbnails = useCallback(
    async (rowsToResolve: BuilderTemplateRow[]) => {
      const ids = distinctThumbnailAssetIds(rowsToResolve);
      if (ids.length === 0) {
        setThumbUrlByRow(new Map());
        return;
      }
      const res = await resolveTemplateThumbnails(ids).catch(() => null);
      const urlById = new Map<string, string>(
        res && res.ok ? Object.entries(res.data) : [],
      );
      setThumbUrlByRow(resolveTemplateThumbnailMap(rowsToResolve, urlById));
    },
    [],
  );

  const reload = useCallback(async () => {
    const res = await listStarterTemplatesAction();
    if (res.ok) {
      setRows(res.data);
      void refreshThumbnails(res.data);
    } else {
      setError(res.error);
    }
  }, [refreshThumbnails]);

  useEffect(() => {
    let cancelled = false;
    listStarterTemplatesAction()
      .then((res) => {
        if (cancelled) return;
        if (res.ok) {
          setRows(res.data);
          void refreshThumbnails(res.data);
        } else setError(res.error);
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load starters.");
      });
    return () => {
      cancelled = true;
    };
  }, [refreshThumbnails]);

  // Resolve the Lab's media scope (hub tenant) once so the thumbnail picker can
  // open. A failure leaves the picker disabled (the cell renders a hint).
  useEffect(() => {
    let cancelled = false;
    resolveLabMediaTenantId()
      .then((res) => {
        if (!cancelled && res.ok) setMediaTenantId(res.data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  /** Persist a starter's thumbnail (assetId=null clears it) with explicit busy
   *  state, then optimistically update the rendered URL. */
  const setThumbnail = useCallback(
    async (rowId: string, assetId: string | null, publicUrl: string | null) => {
      setThumbBusyId(rowId);
      setError(null);
      const res = await updateTemplateDraft(
        templateThumbnailPatch(rowId, assetId),
      );
      setThumbBusyId(null);
      if (!res.ok) {
        setError(res.error ?? "Failed to save thumbnail.");
        return;
      }
      setThumbUrlByRow((prev) => {
        const next = new Map(prev);
        if (assetId && publicUrl) next.set(rowId, publicUrl);
        else next.delete(rowId);
        return next;
      });
      flash(assetId ? "Thumbnail set ✓" : "Thumbnail removed ✓");
    },
    [flash],
  );

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

  // G5 — opening the delete confirm runs a pre-write dependency scan: walk every
  // published template tree for ones that embed this starter (keyed on its slug
  // as a section_embed sectionTypeKey). If any depend on it, the confirm lists
  // them and requires an explicit "archive anyway"; an unreferenced starter
  // confirms normally.
  const startDelete = useCallback(
    (row: BuilderTemplateRow) => {
      setConfirmingDeleteId(row.id);
      setDeleteDependents([]);
      setScanningDeleteId(row.id);
      void scanComponentDependents({ sectionEmbedKeys: [row.slug] })
        .then((res) => {
          if (res.ok) setDeleteDependents(res.data.dependents);
        })
        .finally(() => setScanningDeleteId(null));
    },
    [],
  );

  const cancelDelete = useCallback(() => {
    setConfirmingDeleteId(null);
    setDeleteDependents([]);
    setScanningDeleteId(null);
  }, []);

  const confirmDelete = useCallback(
    (row: BuilderTemplateRow) => {
      const hadDependents = deleteDependents.length > 0;
      setConfirmingDeleteId(null);
      setDeleteDependents([]);
      // confirmDependents mirrors the on-screen confirm: when the operator
      // explicitly clicks "archive anyway", the server-side block is bypassed.
      void mutate(row.id, () =>
        archiveTemplate(row.id, { confirmDependents: hadDependents }),
      ).then((ok) => {
        if (ok) flash("Deleted");
      });
    },
    [mutate, flash, deleteDependents],
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

  // ── A4 import handler ──────────────────────────────────────────────────────

  /**
   * Parse and validate a JSON file from the browser file picker, then create a
   * DRAFT via `createTemplateDraft` with a collision-safe slug. Inline error
   * messages follow the admin-edit-UX bar (explicit, persistent, no silent
   * failure). The file picker is wired to a hidden <input type="file"> so this
   * button looks like the rest of the header actions.
   */
  const handleImportFile = useCallback(
    async (file: File) => {
      setImporting(true);
      setError(null);
      try {
        // ── 1. Read the file as text
        let text: string;
        try {
          text = await file.text();
        } catch {
          setError("Import failed: could not read the file.");
          return;
        }

        // ── 2. JSON parse
        let raw: unknown;
        try {
          raw = JSON.parse(text);
        } catch {
          setError("Import failed: file is not valid JSON.");
          return;
        }

        // ── 3. Zod-validate against PortableTemplate schema
        const parsed = parsePortableTemplate(raw);
        if (!parsed.ok) {
          setError(`Import rejected: ${parsed.error}`);
          return;
        }

        // ── 4. Fetch existing slugs for this kind so we can mint a collision-safe one
        const existing = await listStarterTemplatesAction();
        const existingSlugsForKind = new Set(
          (existing.ok ? existing.data : [])
            .filter((r) => r.kind === parsed.data.kind)
            .map((r) => r.slug),
        );

        // ── 5. Mint a collision-safe slug (F1 helper — same as duplicate)
        const safeSlug = existingSlugsForKind.has(parsed.data.slug)
          ? mintCopySlug(parsed.data.slug, existingSlugsForKind)
          : parsed.data.slug;

        // ── 6. Build the CreateTemplateDraftInput and persist
        const draftInput = buildImportDraftInput(parsed.data, safeSlug);
        const res = await createTemplateDraft(draftInput);
        if (!res.ok) {
          setError(`Import failed: ${res.error}`);
          return;
        }

        await reload();
        flash(`Imported "${parsed.data.title}" as draft (slug: ${safeSlug})`);
      } catch {
        setError("Import failed: unexpected error.");
      } finally {
        setImporting(false);
        // Reset the file input so the same file can be re-imported after a fix.
        if (importFileRef.current) importFileRef.current.value = "";
      }
    },
    [reload, flash],
  );

  // ── A7 quick-rename handlers ───────────────────────────────────────────────

  const startCategoryRename = useCallback((category: string) => {
    setRenamingCategory(category);
    setRenameValue(category);
  }, []);

  const cancelCategoryRename = useCallback(() => {
    setRenamingCategory(null);
    setRenameValue("");
  }, []);

  const saveCategoryRename = useCallback(
    async (fromCategory: string) => {
      const toCategory = renameValue.trim();
      if (!toCategory) {
        setError("Category name can't be empty.");
        return;
      }
      if (toCategory === fromCategory) {
        cancelCategoryRename();
        return;
      }
      setRenameBusy(true);
      setError(null);
      try {
        const res = await renameTemplateCategory(fromCategory, toCategory);
        if (!res.ok) {
          setError(res.error ?? "Rename failed.");
          return;
        }
        flash(
          `Category renamed to "${toCategory}" (${res.data.updatedCount} starter${res.data.updatedCount === 1 ? "" : "s"} updated)`,
        );
        // If the active category filter was the old name, update it
        if (categoryFilter === fromCategory) setCategoryFilter(toCategory);
        // Collapse state key may have changed; update if needed
        setCollapsedCategories((prev) => {
          if (!prev.has(fromCategory)) return prev;
          const next = new Set(prev);
          next.delete(fromCategory);
          next.add(toCategory);
          return next;
        });
        await reload();
        cancelCategoryRename();
      } catch {
        setError("Rename failed.");
      } finally {
        setRenameBusy(false);
      }
    },
    [renameValue, categoryFilter, reload, flash, cancelCategoryRename],
  );

  // ── A3 export handler ──────────────────────────────────────────────────────

  /** Fetch a fresh row (to capture the latest builder_tree) then trigger a
   *  `<slug>.template.json` download with only portable fields. */
  const exportRow = useCallback(
    async (row: BuilderTemplateRow) => {
      setExportingId(row.id);
      setError(null);
      try {
        const res = await getTemplateById(row.id);
        if (!res.ok) {
          setError(res.error ?? "Export failed.");
          return;
        }
        // res.data has the freshest builder_tree from the DB.
        triggerTemplateDownload(res.data, res.data.builder_tree);
        flash(`Exported "${row.title}"`);
      } catch {
        setError("Export failed.");
      } finally {
        setExportingId(null);
      }
    },
    [flash],
  );

  // ── A7 category collapse toggle ────────────────────────────────────────────

  const toggleCollapse = useCallback((category: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }, []);

  // ── Derived row lists ──────────────────────────────────────────────────────

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
  const rolloutFiltered = useMemo(
    () =>
      rolloutFilter === "partial"
        ? surfaceRows.filter(isPartialRollout)
        : surfaceRows,
    [surfaceRows, rolloutFilter],
  );
  const visibleRows = useMemo(
    () => applyStarterCategoryFilter(rolloutFiltered, categoryFilter),
    [rolloutFiltered, categoryFilter],
  );
  /** Count of canaried starters in the current surface group — drives the
   *  "Partial rollout (N)" filter chip visibility. */
  const partialRolloutCount = useMemo(
    () => surfaceRows.filter(isPartialRollout).length,
    [surfaceRows],
  );

  // A7 — category filter options built from the rollout-filtered rows (so the
  // counts reflect the same universe the rollout toggle shows).
  const catFilterOpts = useMemo(
    () => categoryFilterOptions(rolloutFiltered),
    [rolloutFiltered],
  );

  // A7 — group the visible rows into category buckets for section rendering.
  const categoryGroups = useMemo(
    () => groupByCategory(visibleRows),
    [visibleRows],
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

  // Shared prop bag for StarterTable instances
  const tableProps = {
    pendingId,
    editingId,
    edit,
    setEdit,
    confirmingDeleteId,
    deleteDependents,
    scanningDelete: scanningDeleteId !== null,
    exportingId,
    mediaTenantId,
    thumbUrlByRow,
    thumbBusyId,
    onSetThumbnail: setThumbnail,
    onRowClick: (r: BuilderTemplateRow) =>
      editingId === r.id ? cancelEdit() : startEdit(r),
    onSaveEdit: saveEdit,
    onCancelEdit: cancelEdit,
    onOpen: (r: BuilderTemplateRow) =>
      onLaunchEditor?.(targetToLabTarget(r.target_context), r.id),
    onDuplicate: duplicate,
    onExport: (r: BuilderTemplateRow) => void exportRow(r),
    onSetStatus: setStatus,
    onStartDelete: startDelete,
    onCancelDelete: cancelDelete,
    onConfirmDelete: confirmDelete,
  };

  return (
    <div
      data-testid="lab-starter-kit-root"
      style={{ display: "flex", flexDirection: "column", gap: 14 }}
    >
      {/* A4 — hidden file input wired to the Import button */}
      <input
        ref={importFileRef}
        type="file"
        accept=".json,application/json"
        aria-hidden="true"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleImportFile(file);
        }}
      />

      <LabViewHeader
        title="Site Starter Kit"
        blurb="Full-page starters in the page-templates gallery. Edit, tag, publish, or open them in the builder. Sync pulls in the built-in designs."
        actions={
          <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
            <LabButton
              variant="secondary"
              disabled={importing}
              onClick={() => importFileRef.current?.click()}
              ariaLabel="Import template from JSON file"
            >
              {importing ? "Importing…" : "Import"}
            </LabButton>
            <LabButton
              variant="secondary"
              disabled={syncing}
              onClick={() => void runSync()}
              ariaLabel="Sync built-in starters"
            >
              {syncing ? "Syncing…" : "Sync built-in starters"}
            </LabButton>
          </span>
        }
      />

      {/* Surface switcher + rollout filter */}
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
            // Reset filters when switching surface
            setRolloutFilter("all");
            setCategoryFilter("all");
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

      {/* A7 — Category filter bar (only shown when there's more than one category) */}
      {catFilterOpts.length > 2 ? (
        <div
          data-testid="lab-starter-category-filter"
          style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}
        >
          <PillToggle
            options={catFilterOpts}
            value={categoryFilter}
            onChange={(k) => setCategoryFilter(k)}
            ariaLabel="Filter starters by category"
            size="sm"
          />
        </div>
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
          ) : categoryFilter !== "all" ? (
            <>
              No starters in the &ldquo;{categoryFilter}&rdquo; category on
              this surface. Choose a different category or hit{" "}
              <strong>All</strong> to see everything.
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
        // A7 — render one collapsible section per category bucket
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
      )}

      {/* Recovery section — starters with target_context="platform" are hidden
          from both the Agency and Talent kit filters. Show them here so the
          admin can re-target them to agency / talent / both. */}
      {platformRows.length > 0 ? (
        <PlatformStarterRecovery rows={platformRows} {...tableProps} />
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

function StarterTable(props: StarterTableProps) {
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
