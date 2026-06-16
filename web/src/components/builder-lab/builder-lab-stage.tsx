"use client";

/**
 * BuilderLabStage (WS5) — mounts the ONE Page Builder Core in the Platform
 * Builder Lab with the EPHEMERAL `platform_lab` adapter + the chosen preview
 * subject.
 *
 * The Lab always opens SUBJECT-LESS (launched from Playground's "+ New"). The
 * editor is launched against a TARGET — who the draft is *for*:
 *   - "talent"    → preview against a single talent (previewSubjectKind="talent").
 *   - "workspace" → preview against a single workspace (previewSubjectKind="workspace").
 *   - "both"      → the draft is for both surfaces; the editor exposes a
 *                   talent ⇄ workspace KIND TOGGLE so you can preview against
 *                   either. The gallery is unscoped (previewSubjectKind=null)
 *                   so the full component union is offered, and that scope stays
 *                   STABLE no matter which subject kind you preview against.
 *
 * Subject switching (Playground Phase 1): the preview subject is chosen and
 * SWITCHED from inside the editor. The header bridge (which lives inside the
 * provider, so it can read the live tree via `useBuilderTree`) hosts a
 * "Pick a talent / Pick a workspace" dropdown — the same search + photo list as
 * the Lab pickers. Selecting one rebuilds the canvas render data for that
 * subject + the live tree (`buildLabCanvasRenderData`) and lifts it to the
 * stage, which feeds it back down as `canvasRenderData` — a reactive prop, so
 * connected nodes re-hydrate to the new subject WITHOUT remounting (the design
 * you are building survives the switch). For "both" the kind toggle drives which
 * picker is shown; switching kind + re-picking re-hydrates against the new kind.
 *
 * Persistence (Phase 3): when opened on a `draftId`, the editor binds to a
 * `builder_templates` draft — load/save/publish go through the draft-bound
 * adapter. Opened without one, the canvas is the ephemeral no-op sink (scratch).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { BuilderEditorMount } from "@/lib/site-admin/builder-core/mount/BuilderEditorMount";
import { buildPlatformLabBuilderConfig } from "@/lib/site-admin/builder-core/config";
import type { BuilderPreviewSubjectKind } from "@/lib/site-admin/builder-core/config";
import { platformLabAdapter } from "@/lib/site-admin/builder-core/adapters/platform-lab-adapter";
import { createDraftBoundPlatformLabAdapter } from "@/lib/site-admin/builder-core/adapters/platform-lab-adapter-draft";
import { buildLabCanvasRenderData } from "@/lib/site-admin/builder-core/lab/lab-canvas-render-data";
import type { InEditorCanvasRenderData } from "@/lib/site-admin/builder-core/in-editor-canvas-render-data";
import { useBuilderTree } from "@/components/edit-chrome/builder-tree-bridge";
import { CHROME } from "@/components/edit-chrome/kit/tokens";

import { PreviewSubjectPicker, type PreviewSubject } from "./preview-subject-picker";
import { PillToggle } from "./ui";

/** Who a Playground draft is *for* — chosen at "+ New". Distinct from the
 *  preview SUBJECT (the specific talent/workspace authored against in-canvas). */
export type BuilderLabTarget = "talent" | "workspace" | "both";

/** A subject kind that can be previewed in-canvas (the half of `both` you are
 *  currently authoring against). */
type PreviewKind = "talent" | "workspace";

/** Map the draft target → the gallery's previewSubjectKind. "both" is unscoped
 *  (null) so the full component union is offered and stays stable across the
 *  talent ⇄ workspace preview toggle (the gallery filter reads this immutable
 *  config, not the live preview subject). */
function targetToPreviewSubjectKind(
  target: BuilderLabTarget,
): BuilderPreviewSubjectKind {
  return target === "both" ? null : target;
}

export function BuilderLabStage({
  target,
  draftId,
  tenantId,
  workspacePlan,
  locale,
  onExit,
}: {
  /** Who the draft is for — drives the gallery scope + which picker(s) appear. */
  target: BuilderLabTarget;
  /**
   * When set, the editor is bound to a `builder_templates` DRAFT — load reads
   * its tree and save/publish persist (Phase 3). When omitted, the canvas is the
   * ephemeral no-op sink (a throwaway scratch session).
   */
  draftId?: string;
  /** Active platform tenant id (builder credentials/scope). */
  tenantId: string;
  workspacePlan?: string | null;
  locale?: string;
  /** Return to the Lab dashboard (closes the editor). */
  onExit: () => void;
}) {
  // Draft-bound adapter (persists to builder_templates) when a draft is open;
  // otherwise the ephemeral singleton. Memoized on draftId so the editor mount
  // keeps a stable adapter for its lifetime.
  const adapter = useMemo(
    () =>
      draftId ? createDraftBoundPlatformLabAdapter(draftId) : platformLabAdapter,
    [draftId],
  );
  const surfaceConfig = useMemo(
    () => buildPlatformLabBuilderConfig(adapter, targetToPreviewSubjectKind(target)),
    [adapter, target],
  );

  // For "both" the operator toggles which kind they preview against; for a
  // single-target draft the active kind is fixed to the target.
  const [bothKind, setBothKind] = useState<PreviewKind>("talent");
  const activeKind: PreviewKind = target === "both" ? bothKind : target;

  // The chosen preview subject + its rebuilt canvas render data. `canvasRenderData`
  // is a reactive prop consumed by InEditorCanvasRegion, so updating it re-hydrates
  // connected nodes in place — the design tree (separate editor state) is untouched.
  const [subject, setSubject] = useState<PreviewSubject | null>(null);
  const [canvasRenderData, setCanvasRenderData] =
    useState<InEditorCanvasRenderData | null>(null);

  const onSubjectResolved = useCallback(
    (next: PreviewSubject, data: InEditorCanvasRenderData) => {
      setSubject(next);
      setCanvasRenderData(data);
      // Keep the toggle in sync with whatever kind was just picked (for "both").
      setBothKind(next.kind);
    },
    [],
  );

  // Full-screen popup: lock the page behind it from scrolling while the editor
  // is open, and restore on close. Also move focus into the popup on open — it
  // covers the whole platform-admin app, so keyboard/SR focus must not stay on
  // the now-hidden "+ New" trigger behind the z-50 overlay.
  const stageRef = useRef<HTMLDivElement | null>(null);
  // QA harness — flips after mount so automation can wait for the editor stage
  // to hydrate (data-hydrated="true") before driving it. Inert; no behavior change.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    stageRef.current?.focus();
    setHydrated(true);
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // The in-editor subject picker lives in the editor's ONE topbar (passed as
  // previewSubjectChip) — not a separate bar — so the editor is one clean window.
  const subjectPicker = (
    <BuilderLabSubjectPicker
      target={target}
      activeKind={activeKind}
      onKindChange={setBothKind}
      subject={subject}
      tenantId={tenantId}
      locale={locale}
      onSubjectResolved={onSubjectResolved}
    />
  );

  return (
    <div
      data-builder-lab-stage
      data-testid="lab-stage"
      data-hydrated={hydrated ? "true" : undefined}
      ref={stageRef}
      role="dialog"
      aria-modal="true"
      aria-label={
        subject
          ? `Builder Lab — previewing ${subject.kind}: ${subject.label}`
          : "Builder Lab editor"
      }
      tabIndex={-1}
      style={{
        position: "fixed",
        inset: 0,
        // Above the admin sticky header (z-40) so the editor is a full-screen
        // popup that covers the platform admin chrome; the editor's own
        // body-portal selection layer (z-83) still paints above the canvas.
        zIndex: 50,
        background: "#E9E9EE",
        overflow: "auto",
        outline: "none",
      }}
    >
      <BuilderEditorMount
        surfaceConfig={surfaceConfig}
        tenantId={tenantId}
        workspacePlan={workspacePlan ?? null}
        locale={locale}
        pageSlug={null}
        canInsertRawHtmlElements
        canvasRenderData={canvasRenderData}
        tenantSiteLabel={
          subject ? `Previewing ${subject.kind}: ${subject.label}` : "Builder Lab"
        }
        headerVariant="lab"
        onExit={onExit}
        exitLabel="Exit Lab"
        previewSubjectChip={subjectPicker}
      />
    </div>
  );
}

/**
 * The Lab's in-editor preview-subject picker — a chip + dropdown rendered in the
 * editor TOPBAR (passed as previewSubjectChip), so the whole editor is one clean
 * window. Lives INSIDE the provider tree so it can read the live builder tree
 * (`useBuilderTree`) when rebuilding the preview against a switched subject. For
 * a "both" target it includes a talent ⇄ workspace kind toggle.
 */
function BuilderLabSubjectPicker({
  target,
  activeKind,
  onKindChange,
  subject,
  tenantId,
  locale,
  onSubjectResolved,
}: {
  target: BuilderLabTarget;
  /** Which kind's picker is shown — fixed for single-target, toggled for "both". */
  activeKind: PreviewKind;
  /** Switch the previewed kind (only used when target === "both"). */
  onKindChange: (kind: PreviewKind) => void;
  subject: PreviewSubject | null;
  tenantId: string;
  locale?: string;
  onSubjectResolved: (s: PreviewSubject, data: InEditorCanvasRenderData) => void;
}) {
  const tree = useBuilderTree();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Fixed-position anchor so the dropdown ESCAPES the editor topbar's
  // overflow-x-auto/overflow-y-hidden scroll container (which clips an
  // absolutely-positioned child). Coords are computed from the trigger rect on
  // open — same "F7 fix" pattern the publish-split menu uses.
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(
    null,
  );

  // Dismiss the open subject dropdown on Escape or an outside click (mirrors the
  // editor's PagePicker). Scoped to this picker via the data-attr — it does not
  // touch the editor's own Escape handling.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && !t.closest("[data-builder-lab-subject-picker]")) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Dismiss the open subject dropdown on Escape or an outside click (mirrors the
  // editor's PagePicker). Scoped to this picker via the data-attr — it does not
  // touch the editor's own Escape handling.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && !t.closest("[data-builder-lab-subject-picker]")) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const buildFor = useCallback(
    async (next: PreviewSubject) => {
      setPending(true);
      setError(null);
      const res = await buildLabCanvasRenderData({
        tenantId,
        tree,
        locale,
        previewSubject: { kind: next.kind, id: next.id },
      });
      setPending(false);
      if (res.ok) {
        onSubjectResolved(next, res.data);
        setOpen(false);
      } else {
        setError(res.error);
      }
    },
    [tenantId, tree, locale, onSubjectResolved],
  );

  const isBoth = target === "both";
  // The chip/dropdown copy is driven by the subject (once picked) or the active
  // kind (while picking). "both" hasn't a fixed kind, so its empty hint is generic.
  const emptyChipLabel = isBoth
    ? "Pick a subject"
    : `Pick a ${activeKind}`;
  // The picker highlight only applies when the current subject matches the
  // active kind (toggling kind on a "both" draft clears the visible highlight).
  const pickerSelectedId =
    subject && subject.kind === activeKind ? subject.id : null;

  return (
    <div data-builder-lab-subject-picker style={{ position: "relative" }}>
        <button
          type="button"
          ref={triggerRef}
          onClick={() =>
            setOpen((v) => {
              const next = !v;
              if (next && triggerRef.current) {
                const rect = triggerRef.current.getBoundingClientRect();
                const MENU_W = 340;
                const left = Math.max(
                  8,
                  Math.min(rect.left, window.innerWidth - MENU_W - 8),
                );
                setMenuPos({ top: rect.bottom + 6, left });
              }
              return next;
            })
          }
          aria-haspopup="listbox"
          aria-expanded={open}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            padding: "5px 12px",
            borderRadius: 999,
            border: `1px solid ${subject ? CHROME.green : CHROME.controlBorder}`,
            background: subject ? CHROME.greenBg : CHROME.controlFill,
            color: subject ? CHROME.green : CHROME.text,
            fontSize: 11.5,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {subject ? (
            <>
              <span
                aria-hidden
                style={{ width: 6, height: 6, borderRadius: "50%", background: CHROME.green }}
              />
              {subject.kind === "talent" ? "Talent" : "Workspace"}: {subject.label}
            </>
          ) : (
            emptyChipLabel
          )}
          <span aria-hidden style={{ fontSize: 9, opacity: 0.7 }}>{open ? "▲" : "▼"}</span>
          {pending ? (
            <span style={{ fontSize: 10, color: CHROME.muted, fontWeight: 500 }}>loading…</span>
          ) : null}
        </button>

        {open && menuPos ? (
          <div
            role="listbox"
            style={{
              // Fixed (not absolute) so the topbar's overflow-y-hidden scroll
              // container can't clip it — anchored to the trigger rect.
              position: "fixed",
              top: menuPos.top,
              left: menuPos.left,
              zIndex: 120,
              width: 340,
              maxWidth: "90vw",
              background: "#16161A",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 12,
              boxShadow: "0 18px 48px rgba(0,0,0,0.45)",
              padding: 12,
            }}
          >
            {/* "Both" target → talent ⇄ workspace toggle so the same design can
                be previewed against either surface's live data. Uses the shared
                PillToggle so it matches the Catalog surface switchers. */}
            {isBoth ? (
              <div style={{ marginBottom: 10 }}>
                <PillToggle
                  ariaLabel="Preview against"
                  value={activeKind}
                  onChange={onKindChange}
                  options={[
                    { key: "talent", label: "Talent" },
                    { key: "workspace", label: "Workspace" },
                  ]}
                />
              </div>
            ) : null}
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: 0.6,
                textTransform: "uppercase",
                color: "rgba(245,242,235,0.55)",
                marginBottom: 8,
              }}
            >
              Pick a {activeKind} to preview against
            </div>
            {error ? (
              <div
                style={{
                  fontSize: 11.5,
                  color: "#F36772",
                  background: "rgba(243,103,114,0.12)",
                  borderRadius: 8,
                  padding: "6px 9px",
                  marginBottom: 8,
                }}
              >
                {error}
              </div>
            ) : null}
            <PreviewSubjectPicker
              // Re-mount the picker per kind so its internal search/query resets
              // cleanly when the "both" toggle flips.
              key={activeKind}
              kind={activeKind}
              selectedId={pickerSelectedId}
              onSelect={(s) => void buildFor(s)}
            />
          </div>
        ) : null}
      </div>
  );
}
