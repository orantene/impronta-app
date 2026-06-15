"use client";

/**
 * BuilderLabStage (WS5) — mounts the ONE Page Builder Core in the Platform
 * Builder Lab with the EPHEMERAL `platform_lab` adapter + the chosen preview
 * subject.
 *
 * Subject switching (Playground Phase 1): the preview subject is chosen and
 * SWITCHED from inside the editor. The header bridge (which lives inside the
 * provider, so it can read the live tree via `useBuilderTree`) hosts a
 * "Pick a talent / Pick a workspace" dropdown — the same search + photo list as
 * the Lab pickers. Selecting one rebuilds the canvas render data for that
 * subject + the live tree (`buildLabCanvasRenderData`) and lifts it to the
 * stage, which feeds it back down as `canvasRenderData` — a reactive prop, so
 * connected nodes re-hydrate to the new subject WITHOUT remounting (the design
 * you are building survives the switch).
 *
 * Persistence stays ephemeral: the `platform_lab` adapter's autosave / save /
 * publish are no-op sinks. The only durable output is a `builder_templates` row.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { BuilderEditorMount } from "@/lib/site-admin/builder-core/mount/BuilderEditorMount";
import { buildPlatformLabBuilderConfig } from "@/lib/site-admin/builder-core/config";
import { platformLabAdapter } from "@/lib/site-admin/builder-core/adapters/platform-lab-adapter";
import { buildLabCanvasRenderData } from "@/lib/site-admin/builder-core/lab/lab-canvas-render-data";
import type { InEditorCanvasRenderData } from "@/lib/site-admin/builder-core/in-editor-canvas-render-data";
import { useBuilderTree } from "@/components/edit-chrome/builder-tree-bridge";
import { CHROME } from "@/components/edit-chrome/kit/tokens";

import { PreviewSubjectPicker, type PreviewSubject } from "./preview-subject-picker";

export function BuilderLabStage({
  area,
  subject: initialSubject,
  tenantId,
  workspacePlan,
  locale,
  onExit,
}: {
  /** Which Lab area is active — drives the surface config's previewSubjectKind. */
  area: "talent" | "workspace";
  /** Optional starting subject (legacy Talent/Workspace Lab entry). Null → pick inside. */
  subject: PreviewSubject | null;
  /** Active platform tenant id (builder credentials/scope). */
  tenantId: string;
  workspacePlan?: string | null;
  locale?: string;
  /** Return to the Lab dashboard (closes the editor). */
  onExit: () => void;
}) {
  const surfaceConfig = useMemo(
    () => buildPlatformLabBuilderConfig(platformLabAdapter, area),
    [area],
  );

  // The chosen preview subject + its rebuilt canvas render data. `canvasRenderData`
  // is a reactive prop consumed by InEditorCanvasRegion, so updating it re-hydrates
  // connected nodes in place — the design tree (separate editor state) is untouched.
  const [subject, setSubject] = useState<PreviewSubject | null>(initialSubject);
  const [canvasRenderData, setCanvasRenderData] =
    useState<InEditorCanvasRenderData | null>(null);

  const onSubjectResolved = useCallback(
    (next: PreviewSubject, data: InEditorCanvasRenderData) => {
      setSubject(next);
      setCanvasRenderData(data);
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
            ? `Previewing ${area === "talent" ? "talent" : "workspace"}: ${subject.label}`
            : "Builder Lab — pick a subject"
        }
      >
        <BuilderLabStageHeaderBridge
          area={area}
          subject={subject}
          initialSubject={initialSubject}
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
 */
function BuilderLabStageHeaderBridge({
  area,
  subject,
  initialSubject,
  tenantId,
  locale,
  onExit,
  onSubjectResolved,
}: {
  area: "talent" | "workspace";
  subject: PreviewSubject | null;
  initialSubject: PreviewSubject | null;
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

  // Hydrate once on mount when the editor was opened with a starting subject
  // (legacy Talent/Workspace Lab entry). New flow opens subject-less.
  const ranInitial = useRef(false);
  useEffect(() => {
    if (ranInitial.current || !initialSubject) return;
    ranInitial.current = true;
    void buildFor(initialSubject);
  }, [initialSubject, buildFor]);

  const kindLabel = area === "talent" ? "talent" : "workspace";

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
              {area === "talent" ? "Talent" : "Workspace"}: {subject.label}
            </>
          ) : (
            `Pick a ${kindLabel}`
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
              Pick a {kindLabel} to preview against
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
              kind={area}
              selectedId={subject?.id ?? null}
              onSelect={(s) => void buildFor(s)}
            />
          </div>
        ) : null}
      </div>

      {!subject ? (
        <span style={{ fontSize: 11, color: CHROME.muted, fontWeight: 500 }}>
          Pick a {kindLabel} to preview live data on connected blocks.
        </span>
      ) : null}
    </div>
  );
}

/**
 * The preview-subject chip — kept exported for any chrome slot that renders the
 * subject indicator outside the stage.
 */
export function PreviewSubjectChip({
  area,
  subject,
}: {
  area: "talent" | "workspace";
  subject: PreviewSubject | null;
}) {
  if (!subject) {
    return (
      <span style={{ fontSize: 11.5, color: CHROME.muted, fontWeight: 500 }}>
        No {area} selected — pick a subject to preview live data.
      </span>
    );
  }
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        padding: "3px 10px",
        borderRadius: 999,
        background: CHROME.greenBg,
        color: CHROME.green,
        fontSize: 11.5,
        fontWeight: 600,
      }}
    >
      <span aria-hidden style={{ width: 6, height: 6, borderRadius: "50%", background: CHROME.green }} />
      {area === "talent" ? "Talent" : "Workspace"}: {subject.label}
    </span>
  );
}
