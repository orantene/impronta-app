"use client";

/**
 * BuilderLabShell (WS5) — the Platform Builder Lab dashboard.
 *
 * One umbrella: the **Catalog** (`ComponentCatalog`) with its inner tabs
 * (Layout · Elements · Sections · Connected · Site Starter Kit · Site Defaults ·
 * Playground). The old top-level Talent Lab / Workspace Lab / Templates tabs are
 * gone — their roles are absorbed:
 *   - Talent/Workspace Lab → Playground's "+ New" (pick a target, then choose +
 *     switch the preview subject INSIDE the editor).
 *   - Templates lifecycle   → folds into Playground (Phase 3).
 *
 * Launching the editor: Playground's "+ New" calls `onLaunchEditor(target)`; the
 * shell holds that target and mounts `BuilderLabStage` full-bleed (its own
 * chrome). `BuilderLabStage` always opens SUBJECT-LESS. Persistence is EPHEMERAL —
 * the only durable output is a `builder_templates` row written through the WS2
 * registry actions, never a homepage / page.
 *
 * X2 — Catalog version drift banner: `useCatalogVersionDrift` polls
 * `getCatalogVersion` every 25 s while this tab is visible. When the version
 * advances past the mount-time baseline, a dismissible inline banner prompts the
 * admin to reload so their view stays current.
 */

import { useState } from "react";

import { BuilderLabStage, type BuilderLabTarget } from "./builder-lab-stage";
import {
  BuilderLabComponentPreview,
  type CatalogItemPreview,
} from "./component-preview-stage";
import { ComponentCatalog } from "./component-catalog";
import { LAB, panelStyle, RADII } from "./ui";
import { useCatalogVersionDrift } from "./use-catalog-version-drift";

export function BuilderLabShell({
  tenantId,
  workspacePlan,
  locale,
}: {
  /** Active platform tenant id (builder credentials/scope for the mount). */
  tenantId: string;
  workspacePlan?: string | null;
  locale?: string;
}) {
  // The open editor session — target + (for a persisted Playground draft) its
  // builder_templates id. Null → not editing.
  const [launch, setLaunch] = useState<{
    target: BuilderLabTarget;
    draftId?: string;
  } | null>(null);
  // The open component PREVIEW (Catalog row "Preview" → full-screen page-builder
  // preview of one component). Null → not previewing.
  const [preview, setPreview] = useState<CatalogItemPreview | null>(null);
  // After the first editor exit, return to the Playground view (you launched
  // from there) rather than the default Catalog landing.
  const [hasLaunched, setHasLaunched] = useState(false);

  // X2 — poll getCatalogVersion; show banner when another session advanced it.
  const { drifted, reset } = useCatalogVersionDrift();

  // A component preview takes over full-bleed (its own read-only chrome).
  if (preview) {
    return (
      <BuilderLabComponentPreview
        preview={preview}
        tenantId={tenantId}
        workspacePlan={workspacePlan}
        locale={locale}
        onExit={() => setPreview(null)}
      />
    );
  }

  // When the editor is open, render the stage full-bleed (its own chrome).
  if (launch) {
    return (
      <BuilderLabStage
        target={launch.target}
        draftId={launch.draftId}
        tenantId={tenantId}
        workspacePlan={workspacePlan}
        locale={locale}
        onExit={() => {
          setLaunch(null);
          setHasLaunched(true);
        }}
      />
    );
  }

  return (
    <Panel>
      {drifted ? <CatalogDriftBanner onDismiss={reset} /> : null}
      <ComponentCatalog
        onLaunchEditor={(target, draftId) => setLaunch({ target, draftId })}
        onPreviewComponent={setPreview}
        defaultView={hasLaunched ? "playground" : undefined}
      />
    </Panel>
  );
}

// ── Drift banner ───────────────────────────────────────────────────────────────

/**
 * Inline dismissible bar shown when `useCatalogVersionDrift` detects that
 * another session has mutated the catalog since this tab mounted.
 *
 * Reloading re-fetches everything; dismissing simply hides the bar so the
 * admin can finish what they're doing before reloading manually.
 */
function CatalogDriftBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div
      role="alert"
      aria-live="polite"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        background: "rgba(155,168,183,0.10)",
        border: `1px solid rgba(155,168,183,0.28)`,
        borderRadius: RADII.control,
        padding: "9px 14px",
        marginBottom: 12,
        flexWrap: "wrap",
      }}
    >
      <span style={{ fontSize: 12.5, color: LAB.inkMuted, lineHeight: 1.4 }}>
        <span style={{ color: LAB.ink, fontWeight: 600 }}>Catalog changed elsewhere</span>
        {" — another session updated the catalog. Reload to see the latest."}
      </span>
      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            background: LAB.accent,
            color: LAB.accentInk,
            border: "none",
            borderRadius: RADII.control,
            fontSize: 12,
            fontWeight: 700,
            padding: "5px 12px",
            cursor: "pointer",
          }}
        >
          Reload
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss catalog drift notice"
          style={{
            background: "transparent",
            color: LAB.inkMuted,
            border: `1px solid ${LAB.border}`,
            borderRadius: RADII.control,
            fontSize: 12,
            fontWeight: 600,
            padding: "5px 12px",
            cursor: "pointer",
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

// ── Panel wrapper ──────────────────────────────────────────────────────────────

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <section style={{ ...panelStyle, padding: 16, color: LAB.inkMuted }}>
      {children}
    </section>
  );
}
