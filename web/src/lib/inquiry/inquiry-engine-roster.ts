import type { SupabaseClient } from "@supabase/supabase-js";
import { isMutablePhase } from "./inquiry-lifecycle";
import { validateActorPermission } from "./inquiry-permissions";
import { ENGINE_EVENT_TYPES, emitStandardEngineEvent } from "./inquiry-events";
import { logInquiryActivity } from "@/lib/server/commercial-audit";
import { assertConsistencyAfterWrite, runWithEngineLog } from "./inquiry-engine.helpers";
import { loadInquiryRoster } from "./inquiry-workspace-data";
import type { EngineResult } from "./inquiry-engine.types";

// SaaS P1.B STEP A: tenant-scoped by construction on every inquiry/participant
// read and write.

async function invalidateOfferIfRosterChanged(
  supabase: SupabaseClient,
  inquiryId: string,
  tenantId: string,
  actorUserId: string,
): Promise<void> {
  const { data: inq } = await supabase
    .from("inquiries")
    .select("current_offer_id, status, version")
    .eq("id", inquiryId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!inq?.current_offer_id) return;

  const { data: offer } = await supabase
    .from("inquiry_offers")
    .select("id, status")
    .eq("id", inq.current_offer_id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!offer || offer.status !== "sent") return;

  await supabase
    .from("inquiry_offers")
    .update({ status: "invalidated" as never, updated_at: new Date().toISOString() })
    .eq("id", offer.id as string)
    .eq("tenant_id", tenantId);

  await supabase
    .from("inquiries")
    .update({
      current_offer_id: null,
      status: "coordination" as never,
      next_action_by: "coordinator",
      version: (inq.version as number) + 1,
      last_edited_by: actorUserId,
      last_edited_at: new Date().toISOString(),
    })
    .eq("id", inquiryId)
    .eq("tenant_id", tenantId);

  await logInquiryActivity(supabase, {
    inquiryId,
    actorUserId,
    eventType: "offer_invalidated_roster_change",
    payload: { offer_id: offer.id },
  });

  await emitStandardEngineEvent(supabase, {
    type: ENGINE_EVENT_TYPES.OFFER_INVALIDATED_BY_ROSTER_CHANGE,
    inquiryId,
    actorUserId,
    data: { offerId: offer.id as string },
    systemMessage: {
      threadType: "private",
      body: "Roster changed after offer was sent. A new offer is required.",
      eventType: "roster_changed_offer_invalidated",
    },
  });
}

export async function addTalentToRoster(
  supabase: SupabaseClient,
  ctx: {
    inquiryId: string;
    tenantId: string;
    talentProfileId: string;
    actorUserId: string;
    expectedVersion: number;
    /**
     * Requirement group to assign this participant to (spec §3.5, §3.7).
     *
     * - A uuid **must** reference a requirement group on the same inquiry —
     *   cross-inquiry or unknown ids are rejected with `invalid_group`.
     * - `null` triggers the M2.2 transition fallback: the participant is
     *   assigned to the inquiry's default group (first by sort_order, then
     *   created_at). The M1.2 backfill guarantees every existing inquiry has
     *   at least one group, and M2.2's post-booking lock prevents deleting
     *   the last group during normal flow, so this lookup always resolves.
     *
     * M5.6 flips `requirement_group_id` to NOT NULL, removes the null branch
     * of this helper, and requires every caller to pass an explicit id. Until
     * then, existing callers (no-UI, legacy roster-actions.ts) can keep
     * passing `null` so Phase 1 UI work can land independently.
     */
    requirementGroupId: string | null;
  },
): Promise<EngineResult> {
  return runWithEngineLog("addTalentToRoster", ctx.inquiryId, ctx.actorUserId, async () => {
    const perm = await validateActorPermission(supabase, ctx.inquiryId, ctx.actorUserId, "add_talent");
    if (!perm.ok) return { success: false, forbidden: true, reason: "forbidden" };

    const { data: inq } = await supabase
      .from("inquiries")
      .select("uses_new_engine, status, is_frozen, version")
      .eq("id", ctx.inquiryId)
      .eq("tenant_id", ctx.tenantId)
      .maybeSingle();
    if (!inq) return { success: false, forbidden: true, reason: "forbidden" };
    if (!inq.uses_new_engine) return { success: false, error: "use_legacy_roster_actions" };
    if (!isMutablePhase(inq.status as string, !!inq.is_frozen)) return { success: false, reason: "post_booking_immutable" };

    // Resolve the requirement group. Explicit id → validate it's on this
    // inquiry. Null → fall back to the default group (M2.2 transition).
    let resolvedGroupId: string | null = null;
    if (ctx.requirementGroupId) {
      const { data: g } = await supabase
        .from("inquiry_requirement_groups")
        .select("id, inquiry_id")
        .eq("id", ctx.requirementGroupId)
        .eq("tenant_id", ctx.tenantId)
        .maybeSingle();
      if (!g || g.inquiry_id !== ctx.inquiryId) {
        return { success: false, error: "invalid_group" };
      }
      resolvedGroupId = g.id as string;
    } else {
      const { data: defaultGroup } = await supabase
        .from("inquiry_requirement_groups")
        .select("id")
        .eq("inquiry_id", ctx.inquiryId)
        .eq("tenant_id", ctx.tenantId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      resolvedGroupId = (defaultGroup?.id as string | undefined) ?? null;
    }

    const { data: tp } = await supabase
      .from("talent_profiles")
      .select("user_id")
      .eq("id", ctx.talentProfileId)
      .maybeSingle();

    const { data: maxSort } = await supabase
      .from("inquiry_participants")
      .select("sort_order")
      .eq("inquiry_id", ctx.inquiryId)
      .eq("tenant_id", ctx.tenantId)
      .eq("role", "talent")
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextSort = (maxSort?.sort_order ?? -1) + 1;

    const { error } = await supabase.from("inquiry_participants").insert({
      inquiry_id: ctx.inquiryId,
      tenant_id: ctx.tenantId,
      user_id: tp?.user_id ?? null,
      talent_profile_id: ctx.talentProfileId,
      role: "talent",
      status: "invited",
      sort_order: nextSort,
      added_by_user_id: ctx.actorUserId,
      requirement_group_id: resolvedGroupId,
    });

    if (error) return { success: false, error: error.message };

    const { error: verr } = await supabase
      .from("inquiries")
      .update({
        version: (inq.version as number) + 1,
        last_edited_by: ctx.actorUserId,
        last_edited_at: new Date().toISOString(),
      })
      .eq("id", ctx.inquiryId)
      .eq("tenant_id", ctx.tenantId)
      .eq("version", ctx.expectedVersion);
    if (verr) return { success: false, conflict: true, reason: "version_conflict" };

    await logInquiryActivity(supabase, {
      inquiryId: ctx.inquiryId,
      actorUserId: ctx.actorUserId,
      eventType: "talent_invited",
      payload: { talent_profile_id: ctx.talentProfileId },
    });

    await invalidateOfferIfRosterChanged(supabase, ctx.inquiryId, ctx.tenantId, ctx.actorUserId);
    await assertConsistencyAfterWrite(supabase, ctx.inquiryId);

    await emitStandardEngineEvent(supabase, {
      type: ENGINE_EVENT_TYPES.ROSTER_TALENT_INVITED,
      inquiryId: ctx.inquiryId,
      actorUserId: ctx.actorUserId,
      data: { talentProfileId: ctx.talentProfileId },
      notifications: tp?.user_id
        ? [{ userId: tp.user_id as string, title: "Inquiry invitation", body: "You were added to an inquiry." }]
        : [],
    });

    return { success: true };
  });
}

export async function removeTalentFromRoster(
  supabase: SupabaseClient,
  ctx: { inquiryId: string; tenantId: string; participantId: string; actorUserId: string; expectedVersion: number },
): Promise<EngineResult> {
  return runWithEngineLog("removeTalentFromRoster", ctx.inquiryId, ctx.actorUserId, async () => {
    const perm = await validateActorPermission(supabase, ctx.inquiryId, ctx.actorUserId, "remove_talent");
    if (!perm.ok) return { success: false, forbidden: true, reason: "forbidden" };

    const { data: inq } = await supabase
      .from("inquiries")
      .select("uses_new_engine, status, is_frozen, version")
      .eq("id", ctx.inquiryId)
      .eq("tenant_id", ctx.tenantId)
      .maybeSingle();
    if (!inq) return { success: false, forbidden: true, reason: "forbidden" };
    if (!inq.uses_new_engine) return { success: false, error: "use_legacy_roster_actions" };
    if (!isMutablePhase(inq.status as string, !!inq.is_frozen)) return { success: false, reason: "post_booking_immutable" };

    await supabase
      .from("inquiry_participants")
      .update({
        status: "removed",
        removed_at: new Date().toISOString(),
      })
      .eq("id", ctx.participantId)
      .eq("inquiry_id", ctx.inquiryId)
      .eq("tenant_id", ctx.tenantId)
      .eq("role", "talent");

    const { error: verr } = await supabase
      .from("inquiries")
      .update({
        version: (inq.version as number) + 1,
        last_edited_by: ctx.actorUserId,
        last_edited_at: new Date().toISOString(),
      })
      .eq("id", ctx.inquiryId)
      .eq("tenant_id", ctx.tenantId)
      .eq("version", ctx.expectedVersion);
    if (verr) return { success: false, conflict: true, reason: "version_conflict" };

    await logInquiryActivity(supabase, {
      inquiryId: ctx.inquiryId,
      actorUserId: ctx.actorUserId,
      eventType: "talent_removed",
      payload: { participant_id: ctx.participantId },
    });

    await invalidateOfferIfRosterChanged(supabase, ctx.inquiryId, ctx.tenantId, ctx.actorUserId);
    await assertConsistencyAfterWrite(supabase, ctx.inquiryId);

    await emitStandardEngineEvent(supabase, {
      type: ENGINE_EVENT_TYPES.ROSTER_TALENT_REMOVED,
      inquiryId: ctx.inquiryId,
      actorUserId: ctx.actorUserId,
      data: { participantId: ctx.participantId },
    });

    return { success: true };
  });
}

export async function reorderRoster(
  supabase: SupabaseClient,
  ctx: { inquiryId: string; tenantId: string; orderedParticipantIds: string[]; actorUserId: string; expectedVersion: number },
): Promise<EngineResult> {
  return runWithEngineLog("reorderRoster", ctx.inquiryId, ctx.actorUserId, async () => {
    const perm = await validateActorPermission(supabase, ctx.inquiryId, ctx.actorUserId, "reorder_roster");
    if (!perm.ok) return { success: false, forbidden: true, reason: "forbidden" };

    const { data: inq } = await supabase
      .from("inquiries")
      .select("uses_new_engine, status, is_frozen, version")
      .eq("id", ctx.inquiryId)
      .eq("tenant_id", ctx.tenantId)
      .maybeSingle();
    if (!inq) return { success: false, forbidden: true, reason: "forbidden" };
    if (!inq.uses_new_engine) return { success: false, error: "use_legacy_roster_actions" };
    if (!isMutablePhase(inq.status as string, !!inq.is_frozen)) return { success: false, reason: "post_booking_immutable" };

    let order = 0;
    for (const id of ctx.orderedParticipantIds) {
      await supabase
        .from("inquiry_participants")
        .update({ sort_order: order++ })
        .eq("id", id)
        .eq("inquiry_id", ctx.inquiryId)
        .eq("tenant_id", ctx.tenantId);
    }

    const { error: verr } = await supabase
      .from("inquiries")
      .update({
        version: (inq.version as number) + 1,
        last_edited_by: ctx.actorUserId,
        last_edited_at: new Date().toISOString(),
      })
      .eq("id", ctx.inquiryId)
      .eq("tenant_id", ctx.tenantId)
      .eq("version", ctx.expectedVersion);
    if (verr) return { success: false, conflict: true, reason: "version_conflict" };

    await invalidateOfferIfRosterChanged(supabase, ctx.inquiryId, ctx.tenantId, ctx.actorUserId);

    await emitStandardEngineEvent(supabase, {
      type: ENGINE_EVENT_TYPES.ROSTER_REORDERED,
      inquiryId: ctx.inquiryId,
      actorUserId: ctx.actorUserId,
      data: { orderedParticipantIds: ctx.orderedParticipantIds },
    });

    return { success: true };
  });
}

export async function acceptTalentInvitation(
  supabase: SupabaseClient,
  ctx: { inquiryId: string; tenantId: string; actorUserId: string; expectedVersion: number },
): Promise<EngineResult> {
  return runWithEngineLog("acceptTalentInvitation", ctx.inquiryId, ctx.actorUserId, async () => {
    const perm = await validateActorPermission(supabase, ctx.inquiryId, ctx.actorUserId, "accept_talent_invite");
    if (!perm.ok) return { success: false, forbidden: true, reason: "forbidden" };

    const { data: tp } = await supabase
      .from("talent_profiles")
      .select("id")
      .eq("user_id", ctx.actorUserId)
      .maybeSingle();
    if (!tp) return { success: false, error: "not_talent" };

    const { data: row } = await supabase
      .from("inquiry_participants")
      .select("id, status")
      .eq("inquiry_id", ctx.inquiryId)
      .eq("tenant_id", ctx.tenantId)
      .eq("talent_profile_id", tp.id)
      .eq("role", "talent")
      .maybeSingle();

    if (!row) return { success: false, error: "not_invited" };
    if (row.status === "active") return { success: true, already: true };

    await supabase
      .from("inquiry_participants")
      .update({
        status: "active",
        accepted_at: new Date().toISOString(),
      })
      .eq("id", row.id as string)
      .eq("tenant_id", ctx.tenantId);

    const { data: inq } = await supabase
      .from("inquiries")
      .select("version")
      .eq("id", ctx.inquiryId)
      .eq("tenant_id", ctx.tenantId)
      .maybeSingle();

    await supabase
      .from("inquiries")
      .update({
        version: (inq?.version as number) ?? 1,
        last_edited_by: ctx.actorUserId,
        last_edited_at: new Date().toISOString(),
      })
      .eq("id", ctx.inquiryId)
      .eq("tenant_id", ctx.tenantId)
      .eq("version", ctx.expectedVersion);

    await logInquiryActivity(supabase, {
      inquiryId: ctx.inquiryId,
      actorUserId: ctx.actorUserId,
      eventType: "talent_accepted",
      payload: {},
    });

    await emitStandardEngineEvent(supabase, {
      type: ENGINE_EVENT_TYPES.ROSTER_TALENT_ACCEPTED,
      inquiryId: ctx.inquiryId,
      actorUserId: ctx.actorUserId,
      data: {},
      systemMessage: {
        threadType: "group",
        body: "A talent accepted the invitation.",
        eventType: "talent_accepted",
      },
    });

    return { success: true };
  });
}

export async function declineTalentInvitation(
  supabase: SupabaseClient,
  ctx: {
    inquiryId: string;
    tenantId: string;
    actorUserId: string;
    expectedVersion: number;
    declineReason?: string | null;
  },
): Promise<EngineResult> {
  return runWithEngineLog("declineTalentInvitation", ctx.inquiryId, ctx.actorUserId, async () => {
    const perm = await validateActorPermission(supabase, ctx.inquiryId, ctx.actorUserId, "decline_talent_invite");
    if (!perm.ok) return { success: false, forbidden: true, reason: "forbidden" };

    const { data: tp } = await supabase
      .from("talent_profiles")
      .select("id")
      .eq("user_id", ctx.actorUserId)
      .maybeSingle();
    if (!tp) return { success: false, error: "not_talent" };

    await supabase
      .from("inquiry_participants")
      .update({
        status: "declined",
        decline_reason: (ctx.declineReason as never) ?? "other",
      })
      .eq("inquiry_id", ctx.inquiryId)
      .eq("tenant_id", ctx.tenantId)
      .eq("talent_profile_id", tp.id)
      .eq("role", "talent");

    await logInquiryActivity(supabase, {
      inquiryId: ctx.inquiryId,
      actorUserId: ctx.actorUserId,
      eventType: "talent_declined_invitation",
      payload: {},
    });

    await invalidateOfferIfRosterChanged(supabase, ctx.inquiryId, ctx.tenantId, ctx.actorUserId);

    await emitStandardEngineEvent(supabase, {
      type: ENGINE_EVENT_TYPES.ROSTER_TALENT_DECLINED,
      inquiryId: ctx.inquiryId,
      actorUserId: ctx.actorUserId,
      data: { declineReason: ctx.declineReason ?? "other" },
    });

    return { success: true };
  });
}

/** Validates roster matches offer line items for conversion (Section 2.8). */
export async function rosterMatchesOffer(
  supabase: SupabaseClient,
  inquiryId: string,
  offerId: string,
): Promise<boolean> {
  const roster = await loadInquiryRoster(supabase, inquiryId);
  const activeTalentIds = new Set(
    roster.filter((r) => r.status === "active").map((r) => r.talentProfileId),
  );

  const { data: lines } = await supabase
    .from("inquiry_offer_line_items")
    .select("talent_profile_id")
    .eq("offer_id", offerId);

  const offerIds = new Set(
    (lines ?? []).map((l) => l.talent_profile_id).filter(Boolean) as string[],
  );

  if (activeTalentIds.size !== offerIds.size) return false;
  for (const id of offerIds) {
    if (!activeTalentIds.has(id)) return false;
  }
  return true;
}
