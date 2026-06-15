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
 */

import { useState } from "react";

import { BuilderLabStage, type BuilderLabTarget } from "./builder-lab-stage";
import { ComponentCatalog } from "./component-catalog";
import { LAB, panelStyle } from "./ui";

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
  // After the first editor exit, return to the Playground view (you launched
  // from there) rather than the default Catalog landing.
  const [hasLaunched, setHasLaunched] = useState(false);

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
      <ComponentCatalog
        onLaunchEditor={(target, draftId) => setLaunch({ target, draftId })}
        defaultView={hasLaunched ? "playground" : undefined}
      />
    </Panel>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <section style={{ ...panelStyle, padding: 16, color: LAB.inkMuted }}>
      {children}
    </section>
  );
}
