import type { SupabaseClient } from "@supabase/supabase-js";
import { isMutablePhase } from "./inquiry-lifecycle";
import { validateActorPermission } from "./inquiry-permissions";
import { ENGINE_EVENT_TYPES, emitStandardEngineEvent } from "./inquiry-events";
import { inquiryWriteClient, runWithEngineLog } from "./inquiry-engine.helpers";
import type { EngineResult } from "./inquiry-engine.types";
import type { InquiryAlternate } from "./alternates-types";
import {
  computeRankAssignments,
  evaluatePromoteGuard,
  nextAppendRank,
} from "./alternates-logic";

// Deep-plan W9 — inquiry waitlist / alternates engine. Plain functions taking
// the supabase client + a ctx object, returning the EngineResult shape. The
// "use server" wrappers live in admin/_alternates-actions.ts.
//
// SaaS tenant-scoped by construction: every read and write filters on
// tenant_id. The roster stays canonical on inquiry_participants — this engine
// manages the alternate queue and promotes a queued talent into the roster by
// reusing the exact add-to-roster insert shape (mirrors
// inquiry-engine-roster.ts addTalentToRoster / swapTalent).

// inquiry_alternates is not in the generated database.types.ts yet — read NEW
// columns via .returns<T>() with a local row shape.
type AlternateDbRow = {
  id: string;
  inquiry_id: string;
  tenant_id: string;
  requirement_group_id: string | null;
  talent_profile_id: string;
  rank: number;
  note: string | null;
  created_at: string;
};

/**
 * Add a talent to an inquiry's waitlist. Idempotency is handled by the
 * UNIQUE(inquiry_id, talent_profile_id) constraint — a duplicate add returns a
 * friendly error rather than a raw Postgres message.
 */
export async function addAlternate(
  supabase: SupabaseClient,
  ctx: {
    inquiryId: string;
    tenantId: string;
    talentProfileId: string;
    requirementGroupId?: string | null;
    rank?: number | null;
    note?: string | null;
    actorUserId: string;
  },
): Promise<EngineResult<{ alternateId: string }>> {
  return runWithEngineLog("addAlternate", ctx.inquiryId, ctx.actorUserId, async () => {
    const perm = await validateActorPermission(supabase, ctx.inquiryId, ctx.actorUserId, "add_talent");
    if (!perm.ok) return { success: false, forbidden: true, reason: "forbidden" };

    // Validate the inquiry belongs to the tenant.
    const { data: inq } = await supabase
      .from("inquiries")
      .select("id, tenant_id")
      .eq("id", ctx.inquiryId)
      .eq("tenant_id", ctx.tenantId)
      .maybeSingle();
    if (!inq) return { success: false, forbidden: true, reason: "forbidden" };

    // If a requirement group is provided, it must belong to this inquiry.
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
    }

    // Resolve the append rank when the caller did not pin one.
    let rank = ctx.rank ?? null;
    if (rank == null) {
      const { data: ranks } = await supabase
        .from("inquiry_alternates")
        .select("rank")
        .eq("inquiry_id", ctx.inquiryId)
        .eq("tenant_id", ctx.tenantId)
        .returns<Array<{ rank: number }>>();
      rank = nextAppendRank((ranks ?? []).map((r) => r.rank));
    }

    const write = await inquiryWriteClient(supabase);
    const { data: inserted, error } = await write
      .from("inquiry_alternates")
      .insert({
        inquiry_id: ctx.inquiryId,
        tenant_id: ctx.tenantId,
        requirement_group_id: resolvedGroupId,
        talent_profile_id: ctx.talentProfileId,
        rank,
        note: ctx.note ?? null,
        added_by_user_id: ctx.actorUserId,
      })
      .select("id")
      .returns<Array<{ id: string }>>();

    if (error) {
      // 23505 = unique_violation (talent already on this inquiry's waitlist).
      if ((error as { code?: string }).code === "23505") {
        return { success: false, error: "already_on_waitlist" };
      }
      return { success: false, error: error.message };
    }
    const alternateId = inserted?.[0]?.id;
    if (!alternateId) return { success: false, error: "insert_failed" };

    return { success: true, data: { alternateId } };
  });
}

/** Remove a single alternate from the waitlist. */
export async function removeAlternate(
  supabase: SupabaseClient,
  ctx: { alternateId: string; tenantId: string; actorUserId?: string },
): Promise<EngineResult> {
  return runWithEngineLog("removeAlternate", undefined, ctx.actorUserId, async () => {
    // Resolve the inquiry for the permission gate + scope.
    const { data: row } = await supabase
      .from("inquiry_alternates")
      .select("id, inquiry_id, tenant_id")
      .eq("id", ctx.alternateId)
      .eq("tenant_id", ctx.tenantId)
      .returns<Array<{ id: string; inquiry_id: string; tenant_id: string }>>()
      .maybeSingle();
    if (!row) return { success: false, error: "not_found" };

    if (ctx.actorUserId) {
      const perm = await validateActorPermission(supabase, row.inquiry_id, ctx.actorUserId, "remove_talent");
      if (!perm.ok) return { success: false, forbidden: true, reason: "forbidden" };
    }

    const write = await inquiryWriteClient(supabase);
    const { error } = await write
      .from("inquiry_alternates")
      .delete()
      .eq("id", ctx.alternateId)
      .eq("tenant_id", ctx.tenantId);
    if (error) return { success: false, error: error.message };

    return { success: true };
  });
}

/**
 * Persist a new rank ordering for an inquiry's waitlist. Ranks are dense and
 * 0-based after this call. Ids not on the inquiry are ignored (computeRank-
 * Assignments drops them) so a stale client cannot reorder foreign rows.
 */
export async function reorderAlternates(
  supabase: SupabaseClient,
  ctx: {
    inquiryId: string;
    tenantId: string;
    orderedAlternateIds: string[];
    actorUserId?: string;
  },
): Promise<EngineResult> {
  return runWithEngineLog("reorderAlternates", ctx.inquiryId, ctx.actorUserId, async () => {
    if (ctx.actorUserId) {
      const perm = await validateActorPermission(supabase, ctx.inquiryId, ctx.actorUserId, "reorder_roster");
      if (!perm.ok) return { success: false, forbidden: true, reason: "forbidden" };
    }

    const { data: rows } = await supabase
      .from("inquiry_alternates")
      .select("id")
      .eq("inquiry_id", ctx.inquiryId)
      .eq("tenant_id", ctx.tenantId)
      .returns<Array<{ id: string }>>();
    const knownIds = new Set((rows ?? []).map((r) => r.id));

    const assignments = computeRankAssignments(ctx.orderedAlternateIds, knownIds);

    const write = await inquiryWriteClient(supabase);
    for (const { id, rank } of assignments) {
      await write
        .from("inquiry_alternates")
        .update({ rank })
        .eq("id", id)
        .eq("inquiry_id", ctx.inquiryId)
        .eq("tenant_id", ctx.tenantId);
    }

    return { success: true };
  });
}

/**
 * Promote an alternate onto the roster: add the alternate's talent as an
 * `invited` inquiry_participant in the SAME requirement group, delete the
 * alternate row, bump the inquiry version (optimistic lock), and emit a
 * ROSTER_TALENT_INVITED event. Mirrors addTalentToRoster's insert shape so the
 * promoted participant is indistinguishable from a directly-added one.
 *
 * Safe if the talent already has a live (invited/active) participant row: the
 * promote-guard returns a friendly error and nothing is written.
 */
export async function promoteAlternate(
  supabase: SupabaseClient,
  ctx: {
    inquiryId: string;
    tenantId: string;
    alternateId: string;
    actorUserId: string;
    expectedVersion: number;
  },
): Promise<EngineResult> {
  return runWithEngineLog("promoteAlternate", ctx.inquiryId, ctx.actorUserId, async () => {
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
    if (!isMutablePhase(inq.status as string, !!inq.is_frozen)) {
      return { success: false, reason: "post_booking_immutable" };
    }

    // Load the alternate row (scoped to this inquiry + tenant).
    const { data: alt } = await supabase
      .from("inquiry_alternates")
      .select("id, talent_profile_id, requirement_group_id")
      .eq("id", ctx.alternateId)
      .eq("inquiry_id", ctx.inquiryId)
      .eq("tenant_id", ctx.tenantId)
      .returns<Array<{ id: string; talent_profile_id: string; requirement_group_id: string | null }>>()
      .maybeSingle();
    if (!alt) return { success: false, error: "alternate_not_found" };

    // Guard: do not duplicate a live participant for the same talent.
    const { data: existing } = await supabase
      .from("inquiry_participants")
      .select("status")
      .eq("inquiry_id", ctx.inquiryId)
      .eq("tenant_id", ctx.tenantId)
      .eq("talent_profile_id", alt.talent_profile_id)
      .eq("role", "talent");
    const statuses = (existing ?? []).map((r) => String(r.status));
    const guard = evaluatePromoteGuard(statuses);
    if (!guard.ok) {
      return {
        success: false,
        error:
          guard.reason === "already_active"
            ? "talent_already_active"
            : "talent_already_invited",
      };
    }

    // Resolve the requirement group: prefer the alternate's pinned group when it
    // still belongs to the inquiry, else fall back to the default group (first
    // by sort_order, then created_at) — mirrors addTalentToRoster's fallback.
    let resolvedGroupId: string | null = null;
    if (alt.requirement_group_id) {
      const { data: g } = await supabase
        .from("inquiry_requirement_groups")
        .select("id, inquiry_id")
        .eq("id", alt.requirement_group_id)
        .eq("tenant_id", ctx.tenantId)
        .maybeSingle();
      if (g && g.inquiry_id === ctx.inquiryId) {
        resolvedGroupId = g.id as string;
      }
    }
    if (!resolvedGroupId) {
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
      .eq("id", alt.talent_profile_id)
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

    const write = await inquiryWriteClient(supabase);

    // 1) Insert the promoted talent into the roster (mirror addTalentToRoster).
    const { error: insErr } = await write.from("inquiry_participants").insert({
      inquiry_id: ctx.inquiryId,
      tenant_id: ctx.tenantId,
      user_id: tp?.user_id ?? null,
      talent_profile_id: alt.talent_profile_id,
      role: "talent",
      status: "invited",
      sort_order: nextSort,
      added_by_user_id: ctx.actorUserId,
      requirement_group_id: resolvedGroupId,
    });
    if (insErr) return { success: false, error: insErr.message };

    // 2) Optimistic version bump for the roster change.
    const { error: verr } = await write
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

    // 3) Remove the now-promoted alternate from the waitlist.
    await write
      .from("inquiry_alternates")
      .delete()
      .eq("id", ctx.alternateId)
      .eq("tenant_id", ctx.tenantId);

    // 4) Emit the standard roster-invited event (system msg + talent bell),
    //    matching addTalentToRoster so downstream listeners behave identically.
    await emitStandardEngineEvent(supabase, {
      type: ENGINE_EVENT_TYPES.ROSTER_TALENT_INVITED,
      inquiryId: ctx.inquiryId,
      actorUserId: ctx.actorUserId,
      data: { talentProfileId: alt.talent_profile_id, promotedFromWaitlist: true },
      notifications: tp?.user_id
        ? [{ userId: tp.user_id as string, title: "Inquiry invitation", body: "You were added to an inquiry." }]
        : [],
    });

    return { success: true };
  });
}

/**
 * Internal mapper from a DB row + talent name to the public InquiryAlternate
 * shape. Exported for the loader (load-alternates.ts), which performs the
 * talent-name join.
 */
export function mapAlternateRow(
  row: AlternateDbRow,
  talentName: string | null,
): InquiryAlternate {
  return {
    id: row.id,
    inquiryId: row.inquiry_id,
    tenantId: row.tenant_id,
    requirementGroupId: row.requirement_group_id,
    talentProfileId: row.talent_profile_id,
    talentName,
    rank: row.rank,
    note: row.note,
    createdAt: row.created_at,
  };
}

export type { AlternateDbRow };
