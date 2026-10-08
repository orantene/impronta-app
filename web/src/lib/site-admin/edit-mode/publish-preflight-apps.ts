/**
 * Publish preflight for Apps (interactive mini-tools such as the Nail Designer).
 *
 * Config warnings: reserved for future apps that need setup (Nail Designer is
 * zero-config today).
 *
 * Plan backstop: when the talent lacks Web Office (`personalSiteSections`),
 * publishing a tree that still holds a premium app kind is refused. The
 * gallery + draft save already block new inserts; this covers downgrades /
 * imported trees. Pass `canUsePremiumApps: null` (or omit) to skip the gate
 * (agency surfaces, staff saves where free-site rules do not apply).
 */

import {
  premiumAppByNativeKind,
  premiumAppNativeKinds,
} from "@/lib/site-admin/add-gallery/app-plan-gate";
import { freeSiteSectionsLockedMessage } from "@/lib/talent-site/free-site-tree-guard";

export interface AppPreflightIssue {
  severity: "warn" | "error";
  category: "app_config" | "builder_payload";
  nodeId?: string;
  message: string;
}

export type CollectAppPreflightOptions = {
  /**
   * `false` → refuse premium app kinds. `true` / `null` / omitted → no plan gate.
   */
  canUsePremiumApps?: boolean | null;
  locale?: string | null;
};

function walkKinds(
  nodes: unknown,
  visit: (kind: string, nodeId: string | undefined) => void,
): void {
  if (!Array.isArray(nodes)) return;
  for (const raw of nodes) {
    if (!raw || typeof raw !== "object") continue;
    const n = raw as { kind?: unknown; id?: unknown; children?: unknown };
    if (typeof n.kind === "string") {
      visit(n.kind, typeof n.id === "string" ? n.id : undefined);
    }
    if (Array.isArray(n.children)) walkKinds(n.children, visit);
  }
}

export function collectAppPreflightIssues(
  nodes: unknown,
  options?: CollectAppPreflightOptions,
): AppPreflightIssue[] {
  const issues: AppPreflightIssue[] = [];

  if (options?.canUsePremiumApps === false) {
    const premiumKinds = premiumAppNativeKinds();
    const found: { kind: string; nodeId?: string; label: string }[] = [];
    walkKinds(nodes, (kind, nodeId) => {
      if (!premiumKinds.has(kind as never)) return;
      if (found.some((f) => f.kind === kind)) return;
      const entry = premiumAppByNativeKind(kind);
      found.push({
        kind,
        nodeId,
        label: entry?.name.en ?? kind,
      });
    });
    for (const hit of found) {
      issues.push({
        severity: "error",
        category: "builder_payload",
        nodeId: hit.nodeId,
        message: `${hit.label}: ${freeSiteSectionsLockedMessage(options.locale)}`,
      });
    }
  }

  return issues;
}

/** Talent publish: load free-site caps, then gate leftover premium apps. */
export async function collectTalentAppPreflightIssues(
  tree: unknown,
): Promise<AppPreflightIssue[]> {
  const { loadTalentSiteSaveCapabilities } = await import(
    "@/lib/talent-site/server/free-site-save-guard"
  );
  const siteCaps = await loadTalentSiteSaveCapabilities(null);
  return collectAppPreflightIssues(tree, {
    canUsePremiumApps: siteCaps == null ? null : siteCaps.personalSiteSections,
  });
}
