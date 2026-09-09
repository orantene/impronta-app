/**
 * Context authority — who is looking, and what that clears.
 *
 * Switching context clears stale sensitive views and reauthorizes. Roster
 * membership alone grants no Team access (N08).
 */

export const WORKSPACE_CONTEXTS = [
  "platform_admin",
  "workspace_owner",
  "operator",
  "assigned_talent",
  "independent_seller",
  "public_profile",
  "customer",
] as const;

export type WorkspaceContext = (typeof WORKSPACE_CONTEXTS)[number];

export type ContextSwitch = {
  from: WorkspaceContext | null;
  to: WorkspaceContext;
  /** Views that must be dropped on switch so a prior role cannot leak. */
  clearViews: readonly string[];
  /** Queries that must be re-run under the new authority. */
  reauthorize: readonly string[];
};

const SENSITIVE_STAFF_VIEWS = ["team", "payments", "exceptions", "audit"] as const;
const TALENT_VIEWS = ["assignments", "earnings", "my_services"] as const;

export function contextSwitchPlan(
  from: WorkspaceContext | null,
  to: WorkspaceContext,
): ContextSwitch {
  if (from === to) {
    return { from, to, clearViews: [], reauthorize: [] };
  }
  const clearViews = new Set<string>();
  const reauthorize = new Set<string>(["capabilities", "destinations"]);

  if (from && isStaffContext(from) && !isStaffContext(to)) {
    for (const v of SENSITIVE_STAFF_VIEWS) clearViews.add(v);
  }
  if (from === "assigned_talent" || from === "independent_seller") {
    for (const v of TALENT_VIEWS) clearViews.add(v);
  }
  if (to === "customer" || to === "public_profile") {
    for (const v of SENSITIVE_STAFF_VIEWS) clearViews.add(v);
    for (const v of TALENT_VIEWS) clearViews.add(v);
  }
  reauthorize.add("record_queries");
  return { from, to, clearViews: [...clearViews], reauthorize: [...reauthorize] };
}

export function isStaffContext(ctx: WorkspaceContext): boolean {
  return ctx === "platform_admin" || ctx === "workspace_owner" || ctx === "operator";
}

/**
 * Roster membership is not Team. A talent listed on the roster gets staff
 * destinations only when they also hold a staff role in that context.
 */
export function teamAccess(input: {
  context: WorkspaceContext;
  onRoster: boolean;
  hasStaffRole: boolean;
}): boolean {
  if (input.context === "platform_admin" || input.context === "workspace_owner") return true;
  if (input.context === "operator" && input.hasStaffRole) return true;
  // onRoster alone is never enough.
  void input.onRoster;
  return false;
}
