"use server";

/**
 * TUL-1469 · the talent leaves one workspace. Runs as the signed-in talent (the database
 * function checks that they own the profile); never a service-role write. Jobs already
 * booked are not touched.
 */
import { revalidatePath } from "next/cache";

import { requireNotImpersonating } from "@/lib/impersonation/readonly-guard";
import { logServerError } from "@/lib/server/safe-error";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { createClient } from "@/lib/supabase/server";
import { loadOwnTalentProfileId } from "@/lib/talent/talent-languages-store";
import { leaveOutcomeFromRpc, type LeaveOutcome } from "./leave-workspace";

export async function leaveWorkspaceAction(input: unknown): Promise<{ outcome: LeaveOutcome }> {
  await requireNotImpersonating();
  const tenantId = (input as { tenantId?: unknown } | null)?.tenantId;
  if (typeof tenantId !== "string" || !/^[0-9a-f-]{36}$/i.test(tenantId)) return { outcome: "failed" };
  const session = await getCachedActorSession();
  if (!session.user) return { outcome: "forbidden" };
  const talentProfileId = await loadOwnTalentProfileId(session.user.id);
  if (!talentProfileId) return { outcome: "forbidden" };
  const supabase = await createClient();
  if (!supabase) return { outcome: "unavailable" };
  try {
    const res = await supabase.rpc("leave_workspace_as_talent", { p_tenant_id: tenantId, p_talent_profile_id: talentProfileId });
    const outcome = leaveOutcomeFromRpc(res as never);
    if (outcome === "failed") logServerError("talent.leaveWorkspace", res.error ?? "unexpected rpc answer");
    if (outcome === "left") revalidatePath("/talent", "layout");
    return { outcome };
  } catch (err) {
    logServerError("talent.leaveWorkspace", err);
    return { outcome: "failed" };
  }
}
