import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

/**
 * Resolve the set of user_ids that should receive a notification when
 * something happens on an inquiry, grouped by their surface.
 *
 * - workspace:   every tenant staff member with an active agency_memberships row.
 * - client:      inquiries.client_user_id (when set).
 * - talent:      talent_profiles.user_id for every active participant
 *                (excluding 'removed' status).
 * - coordinator: user_id for every active/invited coordinator participant row.
 *                The private (client) thread fans out to the coordinator(s) —
 *                a self-coordinating talent on a direct guest inquiry is NOT in
 *                agency_memberships (so not in workspaceUserIds) but holds a
 *                coordinator row and must be notified of the client's messages.
 *
 * Always read via service role so the lookup isn't filtered by the caller's
 * RLS — emitters need the full recipient set.
 */
export type InquiryNotificationRecipients = {
  workspaceUserIds: string[];
  clientUserId: string | null;
  talentUserIds: string[];
  coordinatorUserIds: string[];
};

export async function resolveInquiryRecipients(
  _supabase: SupabaseClient,
  inquiryId: string,
  tenantId: string,
): Promise<InquiryNotificationRecipients> {
  const empty: InquiryNotificationRecipients = {
    workspaceUserIds: [],
    clientUserId: null,
    talentUserIds: [],
    coordinatorUserIds: [],
  };
  try {
    const admin = createServiceRoleClient();
    if (!admin) return empty;

    const [inquiryRes, participantsRes, coordinatorRes, staffRes] = await Promise.all([
      admin
        .from("inquiries")
        .select("client_user_id")
        .eq("id", inquiryId)
        .eq("tenant_id", tenantId)
        .maybeSingle(),
      admin
        .from("inquiry_participants")
        .select("user_id, talent_profile_id, role, status, talent_profiles!talent_profile_id(user_id)")
        .eq("inquiry_id", inquiryId)
        .eq("tenant_id", tenantId)
        .eq("role", "talent")
        .neq("status", "removed"),
      admin
        // Coordinator rows are keyed on user_id (the self/agency coordinator row
        // carries user_id, talent_profile_id NULL). Invited + active only.
        .from("inquiry_participants")
        .select("user_id")
        .eq("inquiry_id", inquiryId)
        .eq("tenant_id", tenantId)
        .eq("role", "coordinator")
        .in("status", ["invited", "active"]),
      admin
        .from("agency_memberships")
        // agency_memberships keys on profile_id (→ profiles.id, which is the
        // auth user id — see the table's RLS `profile_id = auth.uid()`). There
        // is NO `user_id` column; selecting it errored and silently returned
        // zero workspace recipients, so workspace staff never got in-app bells.
        .select("profile_id")
        .eq("tenant_id", tenantId)
        .eq("status", "active"),
    ]);

    const clientUserId = (inquiryRes.data as { client_user_id?: string | null } | null)?.client_user_id ?? null;

    type ParticipantRow = {
      user_id: string | null;
      talent_profiles:
        | { user_id: string | null }
        | { user_id: string | null }[]
        | null;
    };

    const talentSet = new Set<string>();
    for (const p of ((participantsRes.data ?? []) as unknown as ParticipantRow[])) {
      const direct = p.user_id;
      const joined = Array.isArray(p.talent_profiles)
        ? p.talent_profiles[0]?.user_id ?? null
        : p.talent_profiles?.user_id ?? null;
      const resolved = direct ?? joined;
      if (resolved) talentSet.add(resolved);
    }

    const workspaceSet = new Set<string>();
    for (const m of ((staffRes.data ?? []) as Array<{ profile_id: string | null }>)) {
      if (m.profile_id) workspaceSet.add(m.profile_id);
    }

    const coordinatorSet = new Set<string>();
    for (const c of ((coordinatorRes.data ?? []) as Array<{ user_id: string | null }>)) {
      if (c.user_id) coordinatorSet.add(c.user_id);
    }

    return {
      workspaceUserIds: Array.from(workspaceSet),
      clientUserId,
      talentUserIds: Array.from(talentSet),
      coordinatorUserIds: Array.from(coordinatorSet),
    };
  } catch (err) {
    logServerError("notifications.resolveRecipients", err);
    return empty;
  }
}
