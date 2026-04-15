import type { SupabaseClient } from "@supabase/supabase-js";

export type EngineAction =
  | "submit_inquiry"
  | "move_to_coordination"
  | "set_priority"
  | "reassign_coordinator"
  | "assign_coordinator"
  | "accept_coordinator"
  | "decline_coordinator"
  | "send_message"
  | "edit_message"
  | "delete_message"
  | "mark_thread_read"
  | "add_talent"
  | "remove_talent"
  | "reorder_roster"
  | "accept_talent_invite"
  | "decline_talent_invite"
  | "create_offer"
  | "update_offer"
  | "send_offer"
  | "client_accept_offer"
  | "client_reject_offer"
  | "submit_approval"
  | "reject_approval"
  | "convert_to_booking"
  | "freeze_inquiry"
  | "unfreeze_inquiry"
  | "archive_inquiry"
  | "client_cancel";

export type PermissionResult =
  | { ok: true; isStaff: boolean; talentProfileId: string | null }
  | { ok: false; reason: "forbidden" };

async function loadActorProfile(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ app_role: string | null } | null> {
  const { data } = await supabase
    .from("profiles")
    .select("app_role")
    .eq("id", userId)
    .maybeSingle();
  return data ?? null;
}

function isStaffRole(role: string | null): boolean {
  return role === "agency_staff" || role === "super_admin";
}

/** Participant row for permission checks (minimal). */
async function loadParticipant(
  supabase: SupabaseClient,
  inquiryId: string,
  userId: string,
): Promise<{ role: string; status: string; talent_profile_id: string | null } | null> {
  const { data } = await supabase
    .from("inquiry_participants")
    .select("role, status, talent_profile_id")
    .eq("inquiry_id", inquiryId)
    .eq("user_id", userId)
    .maybeSingle();
  return data ?? null;
}

async function loadTalentProfileIdForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("talent_profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.id ?? null;
}

/**
 * App-layer permission gate (RLS is secondary). Staff can do all staff actions.
 */
export async function validateActorPermission(
  supabase: SupabaseClient,
  inquiryId: string,
  actorUserId: string,
  action: EngineAction,
): Promise<PermissionResult> {
  const profile = await loadActorProfile(supabase, actorUserId);
  const staff = isStaffRole(profile?.app_role ?? null);
  if (staff) {
    return { ok: true, isStaff: true, talentProfileId: null };
  }

  /** Creating a new inquiry — no inquiry row yet. */
  if (action === "submit_inquiry" && !inquiryId) {
    if (profile?.app_role === "client") {
      return { ok: true, isStaff: false, talentProfileId: null };
    }
    return { ok: false, reason: "forbidden" };
  }

  const talentProfileId = await loadTalentProfileIdForUser(supabase, actorUserId);
  const participant = await loadParticipant(supabase, inquiryId, actorUserId);

  const clientActions: EngineAction[] = [
    "submit_inquiry",
    "send_message",
    "mark_thread_read",
    "client_accept_offer",
    "client_reject_offer",
    "submit_approval",
    "client_cancel",
  ];
  const talentActions: EngineAction[] = [
    "send_message",
    "mark_thread_read",
    "accept_talent_invite",
    "decline_talent_invite",
    "submit_approval",
  ];
  const coordinatorActions: EngineAction[] = [
    "set_priority",
    "move_to_coordination",
    "assign_coordinator",
    "accept_coordinator",
    "decline_coordinator",
    "send_message",
    "edit_message",
    "delete_message",
    "mark_thread_read",
    "add_talent",
    "remove_talent",
    "reorder_roster",
    "create_offer",
    "update_offer",
    "send_offer",
    "submit_approval",
    "reject_approval",
    "convert_to_booking",
  ];

  if (participant?.role === "coordinator" && participant.status === "active") {
    if (coordinatorActions.includes(action) || action === "archive_inquiry") {
      return { ok: true, isStaff: false, talentProfileId };
    }
  }

  if (participant?.role === "client" && participant.status === "active") {
    if (clientActions.includes(action)) {
      return { ok: true, isStaff: false, talentProfileId };
    }
  }

  if (participant?.role === "talent" && ["invited", "active"].includes(participant.status)) {
    if (talentActions.includes(action)) {
      return { ok: true, isStaff: false, talentProfileId: participant.talent_profile_id };
    }
  }

  // Talent without participant row yet — invite flow may create row later
  if (talentProfileId && talentActions.includes(action)) {
    const { data: tp } = await supabase
      .from("inquiry_participants")
      .select("id, role, status")
      .eq("inquiry_id", inquiryId)
      .eq("talent_profile_id", talentProfileId)
      .maybeSingle();
    if (tp && tp.role === "talent" && ["invited", "active"].includes(tp.status)) {
      return { ok: true, isStaff: false, talentProfileId };
    }
  }

  return { ok: false, reason: "forbidden" };
}
