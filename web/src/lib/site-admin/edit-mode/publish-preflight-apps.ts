/**
 * Publish preflight for Apps (interactive mini-tools such as the Nail Designer).
 *
 * Config warnings: reserved for future apps that need setup (Nail Designer is
 * zero-config today).
 *
 * Plan backstop: when the talent lacks Web Office (`personalSiteSections`),
 * publishing a tree that still holds a premium app kind is refused. Draft save
 * already blocks new inserts via `refuseTalentPremiumAppTreeMutation`; this
 * covers downgrades / imported trees.
 *
 * Talent publish fails CLOSED: unknown / missing plan → refuse premium kinds.
 * Agency surfaces and staff (non-talent-owner) skip the plan gate.
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
   * `false` → refuse premium app kinds. `true` → allow. `null` / omitted →
   * skip the plan gate (agency / staff non-owner surfaces).
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

/** Talent publish: fail-closed premium-app plan gate for the owning talent. */
export async function collectTalentAppPreflightIssues(
  tree: unknown,
  options?: { locale?: string | null },
): Promise<AppPreflightIssue[]> {
  const {
    loadTalentPremiumAppSaveGate,
    talentProfileLookupFailedMessage,
  } = await import("@/lib/talent-site/server/premium-app-save-guard");
  // Null id: staff/agency (no talent profile) → gate.status "skip".
  // Talent own-profile miss still fails closed when a row id is supplied
  // (draft-save); publish uses null and only denies on auth/workspace miss.
  const gate = await loadTalentPremiumAppSaveGate(null);
  // Non-talent caller (staff / agency) → no talent plan gate.
  if (gate.status === "skip") return collectAppPreflightIssues(tree);
  // Auth / workspace miss → deny publish with retryable copy (PM #2778).
  if (gate.status === "lookup_failed") {
    return [
      {
        severity: "error",
        category: "builder_payload",
        message: talentProfileLookupFailedMessage(options?.locale),
      },
    ];
  }
  return collectAppPreflightIssues(tree, {
    canUsePremiumApps: gate.canUsePremiumApps,
    locale: options?.locale,
  });
}
