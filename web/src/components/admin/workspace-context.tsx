"use client";

import * as React from "react";

import type {
  AdminWorkspaceSummary,
  WorkspacePlan,
} from "@/lib/dashboard/admin-workspace-summary";

/**
 * AdminWorkspaceContext — single source of truth on the client for the
 * active workspace's plan, name, and seat usage.
 *
 * The admin layout server-loads {@link AdminWorkspaceSummary} once per
 * request and threads it through this provider so every consumer (top-bar
 * tier-chip, AccountBillingPanels, GlobalUpgradeModal) reads the same
 * row. No more `?plan=` URL flips, no more hardcoded "Nova Roster".
 *
 * Provider lives at the top of the admin shell. `null` means "no
 * workspace yet" — outside the layout the hook returns null too so
 * components can fall back gracefully (rare, but the shell is rendered
 * pre-redirect on /admin/login flows).
 */
const AdminWorkspaceContext =
  React.createContext<AdminWorkspaceSummary | null>(null);

export function AdminWorkspaceProvider({
  workspace,
  children,
}: {
  workspace: AdminWorkspaceSummary | null;
  children: React.ReactNode;
}) {
  return (
    <AdminWorkspaceContext.Provider value={workspace}>
      {children}
    </AdminWorkspaceContext.Provider>
  );
}

/** Returns the active workspace summary, or null if outside the provider. */
export function useAdminWorkspace(): AdminWorkspaceSummary | null {
  return React.useContext(AdminWorkspaceContext);
}

/** Convenience: just the plan key. Defaults to "free" when unknown. */
export function useWorkspacePlan(): WorkspacePlan {
  const ws = useAdminWorkspace();
  return ws?.plan ?? "free";
}

/**
 * Format the talent seat usage as the short label rendered in the
 * tier-chip ("8 / 10 talents", "Unlimited talents").
 */
export function formatTalentUsage(
  workspace: AdminWorkspaceSummary | null,
): string {
  if (!workspace) return "";
  if (workspace.talentLimit == null) return "Unlimited talents";
  return `${workspace.talentCount} / ${workspace.talentLimit} talents`;
}
