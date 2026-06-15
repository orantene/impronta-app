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

const T = {
  card: "#16161A",
  borderSoft: "rgba(255,255,255,0.06)",
  inkMuted: "rgba(245,242,235,0.62)",
};

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
  // Which target the editor was launched against (null → not editing).
  const [launchTarget, setLaunchTarget] = useState<BuilderLabTarget | null>(null);
  // After the first editor exit, return to the Playground view (you launched
  // from there) rather than the default Catalog landing.
  const [hasLaunched, setHasLaunched] = useState(false);

  // When the editor is open, render the stage full-bleed (its own chrome).
  if (launchTarget) {
    return (
      <BuilderLabStage
        target={launchTarget}
        tenantId={tenantId}
        workspacePlan={workspacePlan}
        locale={locale}
        onExit={() => {
          setLaunchTarget(null);
          setHasLaunched(true);
        }}
      />
    );
  }

  return (
    <Panel>
      <ComponentCatalog
        onLaunchEditor={(target) => setLaunchTarget(target)}
        defaultView={hasLaunched ? "playground" : undefined}
      />
    </Panel>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <section
      style={{
        background: T.card,
        border: `1px solid ${T.borderSoft}`,
        borderRadius: 12,
        padding: 16,
        color: T.inkMuted,
      }}
    >
      {children}
    </section>
  );
}
