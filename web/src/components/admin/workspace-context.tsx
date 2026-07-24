"use client";

import * as React from "react";

import { withPluralization, type Translator } from "@/i18n/interpolate";
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
 *
 * i18n: the WHOLE label is translated here rather than returning an English
 * noun that callers splice into an already-translated sentence (that is how
 * Spanish users ended up seeing "3 / 10 talents en uso."). `t` is required so
 * the compiler catches any new caller that would reintroduce the leak; pass
 * the `useT()` translator from the calling client component.
 */
export function formatTalentUsage(
  workspace: AdminWorkspaceSummary | null,
  t: Translator,
): string {
  if (!workspace) return "";
  if (workspace.talentLimit == null) {
    return t("dashboard.adminShared.talentUsage.unlimited");
  }
  // Plural agreement follows the cap ("1 / 1 talento", "3 / 10 talentos").
  return withPluralization(t)(
    "dashboard.adminShared.talentUsage.counted",
    workspace.talentLimit,
    { used: workspace.talentCount, limit: workspace.talentLimit },
  );
}
