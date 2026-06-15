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
 * Persistence stays ephemeral: the `platform_lab` adapter's autosave / save /
 * publish are no-op sinks. The only durable output is a `builder_templates` row.
 */

import { useCallback, useMemo, useState } from "react";

import { BuilderEditorMount } from "@/lib/site-admin/builder-core/mount/BuilderEditorMount";
import { buildPlatformLabBuilderConfig } from "@/lib/site-admin/builder-core/config";
import type { BuilderPreviewSubjectKind } from "@/lib/site-admin/builder-core/config";
import { platformLabAdapter } from "@/lib/site-admin/builder-core/adapters/platform-lab-adapter";
import { buildLabCanvasRenderData } from "@/lib/site-admin/builder-core/lab/lab-canvas-render-data";
import type { InEditorCanvasRenderData } from "@/lib/site-admin/builder-core/in-editor-canvas-render-data";
import { useBuilderTree } from "@/components/edit-chrome/builder-tree-bridge";
import { CHROME } from "@/components/edit-chrome/kit/tokens";

import { PreviewSubjectPicker, type PreviewSubject } from "./preview-subject-picker";

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
  tenantId,
  workspacePlan,
  locale,
  onExit,
}: {
  /** Who the draft is for — drives the gallery scope + which picker(s) appear. */
  target: BuilderLabTarget;
  /** Active platform tenant id (builder credentials/scope). */
  tenantId: string;
  workspacePlan?: string | null;
  locale?: string;
  /** Return to the Lab dashboard (closes the editor). */
  onExit: () => void;
}) {
  const surfaceConfig = useMemo(
    () =>
      buildPlatformLabBuilderConfig(
        platformLabAdapter,
        targetToPreviewSubjectKind(target),
      ),
    [target],
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

  return (
    <div data-builder-lab-stage style={{ minHeight: "calc(100vh - 50px)" }}>
      <BuilderEditorMount
        surfaceConfig={surfaceConfig}
        tenantId={tenantId}
        workspacePlan={workspacePlan ?? null}
        locale={locale}
        pageSlug={null}
        canInsertRawHtmlElements
        canvasRenderData={canvasRenderData}
        tenantSiteLabel={
          subject
            ? `Previewing ${subject.kind}: ${subject.label}`
            : "Builder Lab — pick a subject"
        }
      >
        <BuilderLabStageHeaderBridge
          target={target}
          activeKind={activeKind}
          onKindChange={setBothKind}
          subject={subject}
          tenantId={tenantId}
          locale={locale}
          onExit={onExit}
          onSubjectResolved={onSubjectResolved}
        />
      </BuilderEditorMount>
    </div>
  );
}

/**
 * Bridges the Lab's exit control + the in-editor subject picker into the editor
 * chrome. Lives INSIDE the provider tree so it can read the live builder tree
 * (`useBuilderTree`) when rebuilding the preview against a switched subject.
 *
 * For a "both" target it also renders a talent ⇄ workspace kind toggle so the
 * operator can preview the same design against either surface's data.
 */
function BuilderLabStageHeaderBridge({
  target,
  activeKind,
  onKindChange,
  subject,
  tenantId,
  locale,
  onExit,
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
  onExit: () => void;
  onSubjectResolved: (s: PreviewSubject, data: InEditorCanvasRenderData) => void;
}) {
  const tree = useBuilderTree();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <div
      data-builder-lab-header-bridge
      style={{
        position: "sticky",
        top: 50,
        zIndex: 41,
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 16px",
        background: CHROME.paper,
        borderBottom: `1px solid ${CHROME.line}`,
      }}
    >
      <button
        type="button"
        onClick={onExit}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "5px 12px",
          borderRadius: 8,
          border: `1px solid ${CHROME.controlBorder}`,
          background: CHROME.controlFill,
          color: CHROME.text,
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        ← Exit Lab
      </button>

      {/* In-editor subject switcher — the keystone of the Playground flow. */}
      <div style={{ position: "relative" }}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
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

        {open ? (
          <div
            role="listbox"
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              left: 0,
              zIndex: 60,
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
                be previewed against either surface's live data. */}
            {isBoth ? (
              <div
                role="tablist"
                aria-label="Preview against"
                style={{
                  display: "inline-flex",
                  background: "rgba(255,255,255,0.05)",
                  borderRadius: 999,
                  padding: 2,
                  marginBottom: 10,
                }}
              >
                {(["talent", "workspace"] as const).map((k) => {
                  const on = activeKind === k;
                  return (
                    <button
                      key={k}
                      type="button"
                      role="tab"
                      aria-selected={on}
                      onClick={() => onKindChange(k)}
                      style={{
                        background: on ? CHROME.green : "transparent",
                        color: on ? "#0F0F11" : "rgba(245,242,235,0.62)",
                        border: "none",
                        fontSize: 11,
                        fontWeight: 700,
                        padding: "4px 14px",
                        borderRadius: 999,
                        cursor: "pointer",
                        textTransform: "capitalize",
                      }}
                    >
                      {k}
                    </button>
                  );
                })}
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

      {!subject ? (
        <span style={{ fontSize: 11, color: CHROME.muted, fontWeight: 500 }}>
          {isBoth
            ? "Pick a talent or workspace to preview live data on connected blocks."
            : `Pick a ${activeKind} to preview live data on connected blocks.`}
        </span>
      ) : null}
    </div>
  );
}
