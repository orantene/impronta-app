"use client";

/**
 * useCatalogActions — the ComponentCatalog mutation handlers, carved VERBATIM out
 * of component-catalog.tsx (god-file decomposition). The catalog controller owns
 * all state; this hook receives its setters/state and returns the row-level
 * action callbacks. The useCallback bodies are an exact lift (same identifiers,
 * same deps) so there is no behavior change, and the hook is invoked once at a
 * fixed position so React hook order is preserved.
 */

import { useCallback } from "react";

import {
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
  clearComponentOverlay,
  setComponentOverlay,
} from "@/lib/site-admin/builder-core/templates/catalog-overlay-actions";
import {
  archiveTemplate,
  publishTemplate,
  rejectToDraft,
  submitTemplateForReview,
  unpublishTemplate,
} from "@/lib/site-admin/builder-core/templates/registry-actions";
import { targetAllows } from "./catalog-row-table";
import {
  type EditFormMap,
  type EditFormState,
  editFormFromItem,
  emptyEditForm,
} from "./catalog-edit-accordion";
import { LAB as T } from "./ui";
import type { LabToastAction } from "./ui";
import {
  buildUndoDescriptor,
  type UndoMutationKind,
  type UndoRevert,
} from "./catalog-undo";
import {
  SURFACE_ENABLED_COLUMN,
  parseJsonObjectField,
  parseLockedProps,
} from "./component-catalog-helpers";

type ToastState = { message: string; undo: LabToastAction | null } | null;

export function useCatalogActions(params: {
  items: CatalogAdminItem[] | null;
  expandedIds: ReadonlySet<string>;
  editForms: EditFormMap;
  setPendingId: (id: string | null) => void;
  setError: (msg: string | null) => void;
  reload: () => Promise<void>;
  setToast: (toast: ToastState) => void;
  flash: (msg: string) => void;
  setItems: React.Dispatch<React.SetStateAction<CatalogAdminItem[] | null>>;
  patchEditForm: (id: string, patch: Partial<EditFormState>) => void;
  setEditForms: React.Dispatch<React.SetStateAction<EditFormMap>>;
  setExpandedIds: React.Dispatch<React.SetStateAction<ReadonlySet<string>>>;
  setConfirmingResetId: (id: string | null) => void;
}) {
  const {
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
  } = params;

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

  return {
    toggleSurface,
    toggleLab,
    startEdit,
    closeEdit,
    toggleEdit,
    saveEdit,
    confirmReset,
    startResetOptimistic,
    setStatus,
  };
}
