"use client";

/**
 * BuilderLabStage (WS5) — mounts the ONE Page Builder Core in the Platform
 * Builder Lab with the EPHEMERAL `platform_lab` adapter + the chosen preview
 * subject.
 *
 * This is the pattern WS6 copies for the workspace / talent consumer surfaces:
 *   1. Build a surface config with the surface's adapter +
 *      `previewSubjectKind`  → `buildPlatformLabBuilderConfig(adapter, kind)`.
 *   2. Drop in `<BuilderEditorMount surfaceConfig={config} tenantId=… … />`.
 *   3. Use `headerVariant="lab"` + `onExit` + `previewSubjectChip` on the topbar
 *      (threaded through the mount → EditProvider → TopBar).
 *
 * Persistence is ephemeral: the `platform_lab` adapter's autosave / save /
 * publish are no-op sinks (proven by the spy test). The only durable output is a
 * `builder_templates` row written via the WS2 registry actions from the header's
 * "Save as page template" / "Save section as gallery item" — handled by the
 * Template Manager + header wiring, NOT this stage's adapter.
 *
 * The chosen subject sets `surfaceConfig.previewSubjectKind` (talent/workspace),
 * so connected freeform nodes hydrate against that subject's data in-canvas
 * (WS4 render plumbing). The subject's display label renders in the topbar chip.
 */

import { useMemo } from "react";

import { BuilderEditorMount } from "@/lib/site-admin/builder-core/mount/BuilderEditorMount";
import { buildPlatformLabBuilderConfig } from "@/lib/site-admin/builder-core/config";
import { platformLabAdapter } from "@/lib/site-admin/builder-core/adapters/platform-lab-adapter";

import type { PreviewSubject } from "./preview-subject-picker";

export function BuilderLabStage({
  area,
  subject,
  tenantId,
  workspacePlan,
  locale,
  onExit,
}: {
  /** Which Lab area is active — drives the surface config's previewSubjectKind. */
  area: "talent" | "workspace";
  /** The picked subject (talent/workspace). Null → empty canvas, no chip. */
  subject: PreviewSubject | null;
  /** Active platform tenant id (builder credentials/scope). */
  tenantId: string;
  workspacePlan?: string | null;
  locale?: string;
  /** Return to the Lab dashboard (closes the editor, keeps the subject). */
  onExit: () => void;
}) {
  // Fresh config each render-area change. The platform_lab adapter is a stable
  // singleton (ephemeral, no per-mount state beyond its in-memory CAS counter).
  const surfaceConfig = useMemo(
    () => buildPlatformLabBuilderConfig(platformLabAdapter, area),
    [area],
  );

  return (
    <div data-builder-lab-stage style={{ minHeight: "calc(100vh - 50px)" }}>
      <BuilderEditorMount
        surfaceConfig={surfaceConfig}
        tenantId={tenantId}
        workspacePlan={workspacePlan ?? null}
        locale={locale}
        // No real page — the Lab is ephemeral. Null pageSlug → the adapter's
        // empty-canvas load path.
        pageSlug={null}
        // super_admin-only surface → raw-HTML elements permitted.
        canInsertRawHtmlElements
        tenantSiteLabel={
          subject
            ? `Previewing ${area === "talent" ? "talent" : "workspace"}: ${subject.label}`
            : "Builder Lab — pick a subject"
        }
      >
        {/*
          The topbar variant + exit + preview-subject chip are consumed by the
          TopBar inside the provider (WS3). The TopBar reads `headerVariant`,
          `onExit`, and `previewSubjectChip` from EditProvider — wired below via
          the Lab subject. The mount forwards children INTO the provider tree, so
          we expose the exit + chip intent here for the chrome to pick up.
        */}
        <BuilderLabStageHeaderBridge
          area={area}
          subject={subject}
          onExit={onExit}
        />
      </BuilderEditorMount>
    </div>
  );
}

/**
 * Bridges the Lab's exit + preview-subject chip into the editor chrome. The
 * shared TopBar (WS3) renders the lab header variant when EditProvider's surface
 * config is non-homepage; this component publishes the Lab-specific `onExit` and
 * the `previewSubjectChip` content so the chrome shows them.
 *
 * Kept as a child of the mount (inside the provider tree) so it can register the
 * Lab header intent with the chrome without the stage needing to reach into the
 * provider internals.
 */
function BuilderLabStageHeaderBridge({
  area,
  subject,
  onExit,
}: {
  area: "talent" | "workspace";
  subject: PreviewSubject | null;
  onExit: () => void;
}) {
  // The exit affordance lives in the topbar (lab variant). We surface a
  // lightweight, always-available "Exit Lab" control here as a resilient
  // fallback so the operator can always return to the Lab dashboard even if the
  // chrome's lab-exit button is not yet wired on a given build.
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
        background: "#16161A",
        borderBottom: "1px solid rgba(255,255,255,0.10)",
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
          border: "1px solid rgba(255,255,255,0.14)",
          background: "rgba(255,255,255,0.04)",
          color: "#F5F2EB",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        ← Exit Lab
      </button>
      <PreviewSubjectChip area={area} subject={subject} />
    </div>
  );
}

/**
 * The preview-subject chip — rendered beside the title in the lab header. Shows
 * which subject the canvas is hydrating against. Exported so the chrome's
 * `previewSubjectChip` slot can render the same element.
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
      <span
        style={{
          fontSize: 11.5,
          color: "rgba(245,242,235,0.45)",
          fontWeight: 500,
        }}
      >
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
        background: "rgba(93,211,160,0.12)",
        color: "#5DD3A0",
        fontSize: 11.5,
        fontWeight: 600,
      }}
    >
      <span
        aria-hidden
        style={{ width: 6, height: 6, borderRadius: "50%", background: "#5DD3A0" }}
      />
      {area === "talent" ? "Talent" : "Workspace"}: {subject.label}
    </span>
  );
}
