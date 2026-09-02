import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";
import { supportFrom } from "./support-from";

/**
 * Who owns a case once it has been escalated.
 *
 * Escalation used to set `handled_by: "human"` and notify the platform-admin
 * AUDIENCE without ever writing `assignee_user_id`. A case could therefore be
 * escalated to everyone and owned by nobody — the ownerless-case failure the
 * support policy exists to prevent, and an invisible one, because the ticket
 * looks correctly escalated in every view.
 *
 * Extracted from support-engine.ts rather than left inline: the engine hit its
 * 800-line cap, and "who owns an escalated case" is a genuinely separate
 * concern from "what an escalation does to a ticket".
 */

/**
 * The account a newly escalated ticket is assigned to when it has no owner.
 *
 * Deterministic by `created_at` so repeated escalations land on the same person
 * rather than rotating. Returns null when no platform admin exists.
 */
async function resolveDefaultSupportOwner(admin: SupabaseClient): Promise<string | null> {
  const { data, error } = await admin
    .from("profiles")
    .select("id")
    .eq("app_role", "super_admin")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) {
    logServerError("support.escalate.resolveOwner", error);
    return null;
  }
  return (data as { id?: string } | null)?.id ?? null;
}

/**
 * Give an escalated ticket a named owner, if it does not already have one.
 *
 * Returns the assigned user id, or null when nothing was assigned.
 *
 * Two rules that matter:
 *  - It NEVER reassigns. The `.is("assignee_user_id", null)` guard means a
 *    ticket somebody already took is left alone, even under a race.
 *  - It never throws. A failure here leaves the escalation intact rather than
 *    turning a customer's support request into an error — an unowned escalated
 *    ticket is bad, a request that fails outright is worse.
 */
export async function assignEscalationOwner(
  admin: SupabaseClient,
  ticketId: string,
  currentAssigneeUserId: string | null,
): Promise<string | null> {
  if (currentAssigneeUserId) return null;

  const owner = await resolveDefaultSupportOwner(admin);
  if (!owner) return null;

  const { error } = await supportFrom(admin, "support_tickets")
    .update({ assignee_user_id: owner })
    .eq("id", ticketId)
    .is("assignee_user_id", null);

  if (error) {
    logServerError("support.escalate.assign", error);
    return null;
  }
  return owner;
}
