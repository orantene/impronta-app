"use server";

/**
 * roster-actions.ts — who holds a place on ONE session, for the Sessions
 * page's right panel (board W39: "Participants · 9").
 *
 * The read is the Front desk's own (`readAdmissionsRoster`): the ticket rows
 * on the session, named through the order's customer when the ticket itself
 * carries no name. One reader, two screens, so the back office and the till
 * can never disagree about who is on a class.
 *
 * Tenant-scoped in the QUERY and by the caller's membership, as every action
 * in this area is: the service role ignores RLS, so the staff check is the
 * only wall between workspaces.
 */

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { logServerError } from "@/lib/server/safe-error";
import { readAdmissionsRoster, type AdmissionRosterEntry } from "@/lib/pos/classes/day";

export type SessionParticipantsResult =
  | { ok: true; participants: AdmissionRosterEntry[] }
  | { ok: false; error: string };

export async function loadSessionParticipants(
  tenantId: string,
  sessionId: string,
): Promise<SessionParticipantsResult> {
  try {
    const staff = await requireWorkspaceStaffAction();
    if (!staff.ok) return { ok: false, error: staff.error };
    if (staff.tenantId !== tenantId) {
      return { ok: false, error: "Not authorized for this workspace." };
    }
    if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return { ok: false, error: "That is not a session." };

    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, error: "Service unavailable." };

    // The session must be this workspace's before its tickets are read.
    const { data: session, error: sessionError } = await admin
      .from("sessions")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("id", sessionId)
      .maybeSingle();
    if (sessionError) {
      logServerError("sessions.loadSessionParticipants.session", sessionError);
      return { ok: false, error: "Could not read the participants." };
    }
    if (!session) return { ok: false, error: "That session is not in this workspace." };

    const roster = await readAdmissionsRoster(admin, tenantId, [sessionId]);
    if (!roster.ok) return { ok: false, error: "Could not read the participants." };
    return { ok: true, participants: roster.bySession.get(sessionId) ?? [] };
  } catch (error) {
    logServerError("sessions.loadSessionParticipants", error);
    return { ok: false, error: "Could not read the participants." };
  }
}
