import type { DashboardIdentity } from "@/lib/impersonation/dashboard-identity";

/**
 * v1: talent/client server actions are blocked while impersonating (read-only QA).
 * See plan: admin destructive routes are unreachable while impersonating (/admin redirects).
 */
export const IMPERSONATION_READ_ONLY_ERROR =
  "Exit 'viewing as' to make changes";

export function assertMutationsAllowedWhileImpersonating(
  identity: DashboardIdentity,
): { ok: true } | { ok: false; error: string } {
  if (identity.isImpersonating) {
    return { ok: false, error: IMPERSONATION_READ_ONLY_ERROR };
  }
  return { ok: true };
}
