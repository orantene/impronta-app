/**
 * TUL-830 · server read behind the duplicate-subscription rule. Service role,
 * because checkout runs before the person has any billing rows they can read.
 * The subject id always comes from the session-scoped caller, never the browser.
 */
import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { checkoutGuardError, classifyExistingSubscription } from "./duplicate-subscription";

/** null = checkout may proceed; otherwise the refusal to return. */
export async function duplicateSubscriptionGuard(
  kind: "talent" | "workspace",
  subjectId: string,
): Promise<string | null> {
  const sb = createServiceRoleClient();
  if (!sb) return checkoutGuardError("unknown");
  const read =
    kind === "talent"
      ? await sb.from("talent_subscriptions").select("status").eq("talent_profile_id", subjectId).maybeSingle()
      : await sb.from("workspace_subscriptions").select("status").eq("tenant_id", subjectId).maybeSingle();
  if (read.error) logServerError("billing.duplicateSubscriptionGuard", read.error);
  return checkoutGuardError(
    classifyExistingSubscription({ data: read.data as { status?: string | null } | null, error: read.error }),
  );
}
