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

import { workspaceNavContext } from "@/lib/workspace/nav-context";
import type { WorkspaceNavContext } from "@/lib/workspace/destinations";
import { useAdminShell } from "../state";
import { useWebsiteSubnav } from "./website-nav";
import {
  workspaceNavGroups,
  type WorkspaceNavResult,
  type WorkspaceNavSubItem,
} from "./workspace-nav-groups";

/**
 * The live counts the rail shows. Kept here rather than in the pure builder so
 * the builder stays a function of the registry and the shell's state, with no
 * opinion about which row gets a badge.
 *
 * TWO NUMBERS, NOT ONE. The People ROW counts everything awaiting a human:
 * pending roster approvals plus open verification requests. The Applications
 * CHILD counts only the approvals, because that is the queue the link opens —
 * a child badge that included verifications would send the operator to a page
 * whose list is shorter than the number that sent them there.
 */
function usePeopleCounts(): { readonly row: number; readonly applications: number } {
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
    return { row: approvals + pendingVerifications, applications: approvals };
  }, [effectiveRoster, verificationRequests, overviewMetrics]);
}

export function useWorkspaceNav(): WorkspaceNavResult {
  const {
    state,
    totalUnread,
    adminBasePath,
    effectiveTeamMembers,
    bridgeSessionIdentity,
    bridgeTenantIdentity,
  } = useAdminShell();
  const peopleCounts = usePeopleCounts();
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
  const alsoTalent = state.alsoTalent;
  const fallbackRole = state.role;
  const teamSize = effectiveTeamMembers.length;

  // Every input is a bridge object or shell state, handed over whole. The
  // derivation itself lives in `lib/workspace/nav-context.ts` and is tested
  // from a bridge-shaped row — see `workspaceNavContext`'s header for the
  // regression that shape closes (a caller holding the tenant row and passing
  // `industryPreset: undefined`, which made every workspace `hybrid`).
  const context = useMemo<WorkspaceNavContext>(
    () =>
      workspaceNavContext({
        tenantIdentity: bridgeTenantIdentity,
        sessionIdentity: bridgeSessionIdentity,
        workspaceType,
        plan,
        visiblePages,
        teamMemberCount: teamSize,
        hasTalentProfile: alsoTalent,
        fallbackRole,
      }),
    [
      bridgeTenantIdentity,
      bridgeSessionIdentity,
      workspaceType,
      plan,
      visiblePages,
      teamSize,
      alsoTalent,
      fallbackRole,
    ],
  );

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
          people: { count: peopleCounts.row, tone: "amber" },
        },
        // The pending count the parent badge advertises, on the child that
        // opens the queue — one click from "12 awaiting review" to the twelve.
        subBadges: { "people-applications": peopleCounts.applications },
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
      peopleCounts,
      websiteSubItems,
    ],
  );
}
