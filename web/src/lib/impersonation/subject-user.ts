import type { DashboardIdentity } from "@/lib/impersonation/dashboard-identity";

/**
 * User id that owns talent_profiles / client rows for dashboard queries.
 * Do not use auth.getUser().id for talent/client dashboard data when impersonation exists.
 */
export function subjectUserId(identity: DashboardIdentity): string {
  return identity.effectiveUserId;
}
