import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";

import { resolveInquiryCoordination, seedOwningAgencyCoordinators } from "./coordinator-assignment";
import { ensureClientRelationshipForInquiry } from "./ensure-client-relationship";
import { isHubSourcedChannel, resolveOwningPartiesForTalents } from "./owning-party-resolver";

/**
 * Who sits in an inquiry that was created WITHOUT participants (the guest early row, P0-1).
 * Two steps, so a caller can write the inquiry row in between: `resolveSeating` (reads only),
 * then `seatParticipants` (inserts). Mirrors submitInquiry's seating; shared by the early-row
 * promotion and the orphan backfill so both seat identically.
 */

export type Seating = {
  talentIds: string[];
  talentUserIdByProfile: Map<string, string | null>;
  owningParties: Awaited<ReturnType<typeof resolveOwningPartiesForTalents>>;
  /** First self-coordinating talent with a claimed account (hub self-coordination), else null. */
  selfCoordPrimaryUserId: string | null;
  coordinatorOfRecordId: string | null;
  oversightOfficerId: string | null;
  sourceType: "agency" | "hub";
};

export async function resolveSeating(
  admin: SupabaseClient,
  opts: { tenantId: string; talentIds: string[]; sourceChannel: string | null },
): Promise<Seating> {
  const { tenantId, talentIds } = opts;
  const talentUserIdByProfile = new Map<string, string | null>();
  if (talentIds.length > 0) {
    const { data, error } = await admin.from("talent_profiles").select("id, user_id").in("id", talentIds);
    if (error) logServerError("seatParticipants/resolve.talents", error);
    for (const r of (data ?? []) as Array<{ id: string; user_id: string | null }>) talentUserIdByProfile.set(r.id, r.user_id ?? null);
  }
  const owningParties =
    talentIds.length > 0
      ? await resolveOwningPartiesForTalents(admin, talentIds, tenantId, isHubSourcedChannel(opts.sourceChannel))
      : new Map();
  let selfCoordPrimaryUserId: string | null = null;
  for (const tid of talentIds) {
    if (owningParties.get(tid)?.type !== "talent") continue;
    const uid = talentUserIdByProfile.get(tid) ?? null;
    if (uid) {
      selfCoordPrimaryUserId = uid;
      break;
    }
  }
  const { coordinatorOfRecordId, oversightOfficerId, sourceType } = await resolveInquiryCoordination(admin, {
    tenantId,
    selfCoordPrimaryUserId,
  });
  return { talentIds, talentUserIdByProfile, owningParties, selfCoordPrimaryUserId, coordinatorOfRecordId, oversightOfficerId, sourceType };
}

/** Insert one participant row; a failure is logged, never thrown (the inquiry is already persisted). */
async function seat(write: SupabaseClient, label: string, row: Record<string, unknown>): Promise<void> {
  const { error } = await write.from("inquiry_participants").insert(row as never);
  if (error) logServerError(`seatParticipants/${label}`, error);
}

/**
 * Seat the client (when there is one), the coordinator of record, the oversight officer and
 * the talent. Returns the coordinator of record after cross-tenant owning-agency seeding.
 * Every inquiry needs a default `inquiry_requirement_groups` row BEFORE any participant insert:
 * the trg_inquiry_participants_default_group trigger fills requirement_group_id from it and
 * the column is NOT NULL, so without it every insert fails (silently, before this logged).
 */
export async function seatParticipants(
  write: SupabaseClient,
  opts: { inquiryId: string; tenantId: string; clientUserId: string | null; seating: Seating },
): Promise<string | null> {
  const { inquiryId, tenantId, clientUserId, seating } = opts;
  const { talentIds } = seating;

  const { data: existingGroup, error: groupReadErr } = await write
    .from("inquiry_requirement_groups")
    .select("id")
    .eq("inquiry_id", inquiryId)
    .limit(1)
    .maybeSingle();
  if (groupReadErr) logServerError("seatParticipants/groupRead", groupReadErr);
  let groupId = (existingGroup?.id as string | undefined) ?? null;
  if (!groupId) {
    const { data: group, error: groupErr } = await write
      .from("inquiry_requirement_groups")
      .insert({ inquiry_id: inquiryId, tenant_id: tenantId, role_key: "talent", quantity_required: Math.max(talentIds.length, 1), sort_order: 0 })
      .select("id")
      .single();
    if (groupErr) logServerError("seatParticipants/group", groupErr);
    groupId = (group?.id as string | undefined) ?? null;
  }

  if (clientUserId) {
    await seat(write, "client", { inquiry_id: inquiryId, tenant_id: tenantId, user_id: clientUserId, role: "client", status: "active" });
    try {
      await ensureClientRelationshipForInquiry(write, { tenantId, clientUserId, inquiryId, originDomain: null, sourceWorkspaceId: tenantId });
    } catch (err) {
      logServerError("seatParticipants/clientRelationship", err);
    }
  }
  const coordSeen = new Set<string>();
  if (seating.coordinatorOfRecordId) {
    coordSeen.add(seating.coordinatorOfRecordId);
    await seat(write, "coordinator", {
      inquiry_id: inquiryId,
      tenant_id: tenantId,
      user_id: seating.coordinatorOfRecordId,
      role: "coordinator",
      status: seating.selfCoordPrimaryUserId ? "active" : "invited",
    });
  }
  if (seating.oversightOfficerId && !coordSeen.has(seating.oversightOfficerId)) {
    await seat(write, "oversight", { inquiry_id: inquiryId, tenant_id: tenantId, user_id: seating.oversightOfficerId, role: "coordinator", status: "invited" });
  }
  let sort = 0;
  for (const tid of talentIds) {
    const owning = seating.owningParties.get(tid) ?? { type: "workspace" as const, id: tenantId };
    await seat(write, "talent", {
      inquiry_id: inquiryId,
      tenant_id: tenantId,
      user_id: seating.talentUserIdByProfile.get(tid) ?? null,
      talent_profile_id: tid,
      role: "talent",
      status: "invited",
      sort_order: sort++,
      added_by_user_id: null,
      requirement_group_id: groupId,
      owning_party_type: owning.type,
      owning_party_id: owning.id,
    });
  }
  return seedOwningAgencyCoordinators(write, {
    inquiryId,
    inquiryTenantId: tenantId,
    talentProfileIds: talentIds,
    owningParties: seating.owningParties,
    existingCoordinatorId: seating.coordinatorOfRecordId,
  });
}
