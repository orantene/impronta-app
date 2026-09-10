"use client";

// ════════════════════════════════════════════════════════════════════
// Workspace rail navigation — the shell's side of the destination registry.
//
// `useWebsiteSubnav()` is the single source of truth for the Website section's
// children; this is the same idea one level up, for the rail itself. It reads
// what the shell already has — visible pages, plan, role, admin base path,
// unread and pending counts, the current path — turns it into the registry's
// `WorkspaceNavContext`, and hands the pure builder next door the job of
// producing groups. WorkspaceShell maps over the result and owns no list.
//
// HYDRATION. Every input is on the client at first paint: `state.*` is seeded
// from the server bridge, `adminBasePath` is resolved once in the provider, and
// `usePathname`/`useSearchParams` are the same on both passes. Nothing is read
// in an effect, and active state for a ROW is keyed on `state.page` (server-
// derived) rather than the path.
// ════════════════════════════════════════════════════════════════════

import { useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import {
  canManageBilling as roleManagesBilling,
  deriveHats,
  derivePreset,
} from "@/lib/workspace/nav-context";
import type { WorkspaceNavContext } from "@/lib/workspace/destinations";
import { useAdminShell } from "../state";
import { useWebsiteSubnav } from "./website-nav";
import {
  workspaceNavGroups,
  type WorkspaceNavResult,
  type WorkspaceNavSubItem,
} from "./workspace-nav-groups";

/**
 * The two live counts the rail shows. Kept here rather than in the pure builder
 * so the builder stays a function of the registry and the shell's state, with
 * no opinion about which row gets a badge.
 */
function usePendingPeople(): number {
  const { effectiveRoster, verificationRequests, overviewMetrics } = useAdminShell();
  return useMemo(() => {
    const pendingVerifications = verificationRequests.filter(
      (r) =>
        r.status === "submitted" ||
        r.status === "in_review" ||
        r.status === "pending_user_action",
    ).length;
    const livePending = effectiveRoster.filter((p) => p.state === "awaiting-approval").length;
    const approvals =
      overviewMetrics !== null ? (overviewMetrics.pendingApprovals ?? 0) : livePending;
    return approvals + pendingVerifications;
  }, [effectiveRoster, verificationRequests, overviewMetrics]);
}

export function useWorkspaceNav(): WorkspaceNavResult {
  const { state, totalUnread, adminBasePath, effectiveTeamMembers, bridgeSessionIdentity } =
    useAdminShell();
  const pendingPeople = usePendingPeople();
  const websiteSubnav = useWebsiteSubnav();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();

  const websiteSubItems = useMemo<Array<Omit<WorkspaceNavSubItem, "active">>>(
    () =>
      websiteSubnav.map((item) => ({
        id: item.id,
        label: item.label,
        href: item.href,
        exact: item.id === "overview",
        external: item.external,
        count: item.count,
      })),
    [websiteSubnav],
  );

  const visiblePages = state.visiblePages;
  const plan = state.plan;
  const workspaceType = state.workspaceType;
  const membershipRole = bridgeSessionIdentity?.role ?? state.role;
  const alsoTalent = state.alsoTalent;
  const canBill = bridgeSessionIdentity?.canManageBilling;
  const teamSize = effectiveTeamMembers.length;

  const context = useMemo<WorkspaceNavContext>(() => {
    const hats = deriveHats({ membershipRole, hasTalentProfile: alsoTalent });
    return {
      workspaceType,
      plan,
      // THE ONE INPUT THE CLIENT DOES NOT HAVE. The preset lives in
      // `agencies.settings.industry_preset`; the server layout reads that row
      // (`_layout-identity.ts`) but does not put the field on the identity
      // bridge, and reading it in an effect would make it null on the first
      // render — exactly what a layout decision may not be keyed on.
      // `derivePreset` fails OPEN to `hybrid`, the shape that relabels nothing,
      // so the rail is correct today and the cafe/solo labels ("Menu and
      // catalog", "Team", "Services") light up the moment the bridge carries
      // the field. Team size is already here and is passed for that day.
      preset: derivePreset({ industryPreset: undefined, teamMemberCount: teamSize }),
      role: hats.role,
      professional: hats.professional,
      // The tenant flags are already folded into `visiblePages` by the provider
      // (`takes_reservations` / `runs_events` off the same bridge object), so
      // reading them back from it costs nothing and cannot disagree with it.
      takesReservations: visiblePages.includes("reservations"),
      runsEvents: visiblePages.includes("events"),
      posEnabled: visiblePages.includes("pos"),
      // The server-resolved capability when we have it; the role ladder's own
      // answer otherwise. Never a guess from the plan tier.
      canManageBilling: canBill ?? roleManagesBilling(hats.role),
    };
  }, [workspaceType, plan, teamSize, membershipRole, alsoTalent, visiblePages, canBill]);

  return useMemo(
    () =>
      workspaceNavGroups({
        context,
        adminBase: adminBasePath,
        visiblePages,
        activePage: state.page,
        pathname,
        search,
        badges: {
          messages: { count: totalUnread, tone: "brand" },
          people: { count: pendingPeople, tone: "amber" },
        },
        websiteSubItems,
      }),
    [
      context,
      adminBasePath,
      visiblePages,
      state.page,
      pathname,
      search,
      totalUnread,
      pendingPeople,
      websiteSubItems,
    ],
  );
}
