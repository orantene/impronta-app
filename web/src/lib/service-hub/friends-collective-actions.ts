"use server";

/**
 * TUL-1374: apply the Friends collective preset to the signed-in owner's
 * workspace. It records the model (`agencies.work_model`) and points the
 * workspace's default coordinator at the owner, so every new request lands in
 * the owner's inbox; members already see only the job card and their own talent
 * thread (messaging/thread-rule.ts). Owner only, seat-checked, idempotent,
 * audited. The onboarding model picker (TUL-1370) and the owner screen
 * (TUL-1369) call this; nothing else writes `work_model`.
 */
import { revalidatePath } from "next/cache";
import { logWorkspaceAudit } from "@/lib/audit/workspace-audit";
import { requireNotImpersonating } from "@/lib/impersonation/readonly-guard";
import { checkRosterSeatAvailability } from "@/lib/saas/roster-seat-limit";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import { decideFriendsCollectivePreset, decideMemberShareUpdate, decideShareResponse, type OwnerShare } from "./friends-collective";
import { parseOwnerShareRow } from "./collective-split";
import { requireTalentSelf } from "@/lib/server/talent-self-guard";

export type ApplyPresetResult =
  | { ok: true; changed: boolean }
  | { ok: false; reason: "unauthenticated" | "owner_only" | "over_seat_cap" | "model_already_set" | "coordinator_already_set" | "unavailable"; message?: string };

export async function applyFriendsCollectivePreset(): Promise<ApplyPresetResult> {
  await requireNotImpersonating();
  try {
    const auth = await requireWorkspaceStaffAction();
    if (!auth.ok) return { ok: false, reason: "unauthenticated" };
    const { tenantId, user, supabase } = auth;
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, reason: "unavailable" };

    const { data: membership } = await tenantScopedQuery(supabase, "agency_memberships", tenantId)
      .select("role")
      .eq("profile_id", user.id)
      .eq("status", "active")
      .maybeSingle();
    const role = (membership as { role?: string } | null)?.role ?? null;

    // Before the held migration the column does not exist: say so, change nothing.
    const { data: agency, error: agencyErr } = await admin
      .from("agencies")
      .select("work_model, default_coordinator_user_id")
      .eq("id", tenantId)
      .maybeSingle();
    if (agencyErr || !agency) return { ok: false, reason: "unavailable" };
    const row = agency as { work_model: string | null; default_coordinator_user_id: string | null };

    // additionalSeats = 0: ok only when the roster already fits the plan's cap.
    const seats = await checkRosterSeatAvailability(admin, tenantId, 0);

    const decision = decideFriendsCollectivePreset({
      role,
      ownerUserId: user.id,
      currentModel: row.work_model,
      defaultCoordinatorUserId: row.default_coordinator_user_id,
      seatOk: seats.ok,
    });
    if (!decision.ok) {
      return { ok: false, reason: decision.reason, ...(decision.reason === "over_seat_cap" ? { message: seats.message } : {}) };
    }
    if (decision.changed) {
      const { error } = await admin.from("agencies").update(decision.set).eq("id", tenantId);
      if (error) {
        logServerError("friends-collective.apply", error);
        return { ok: false, reason: "unavailable" };
      }
      // Written synchronously, with what it replaced (the previous coordinator can be restored from here).
      await logWorkspaceAudit({
        tenantId,
        category: "settings",
        action: "workspace.work_model.set",
        summary: "Set the workspace model to Friends collective",
        targetType: "agency",
        targetId: tenantId,
        metadata: {
          work_model: decision.set.work_model,
          previous_work_model: row.work_model,
          coordinator: "owner",
          previous_coordinator: row.default_coordinator_user_id,
        },
      });
      revalidatePath("/", "layout");
    }
    return { ok: true, changed: decision.changed };
  } catch (err) {
    logServerError("friends-collective.apply", err);
    return { ok: false, reason: "unavailable" };
  }
}

export type SetMemberShareResult =
  | { ok: true }
  | { ok: false; reason: "unauthenticated" | "owner_only" | "not_a_collective" | "not_a_member" | "invalid_share" | "unavailable" };

/**
 * Owner only: set (or clear) what the owner takes from one member's sales. A %
 * (max 90%) or a fixed amount in one currency. Applies to orders priced from
 * now on; an order already priced keeps its split (the lines carry it).
 */
export async function setMemberOwnerShare(input: {
  talentProfileId: string;
  share: OwnerShare | null;
}): Promise<SetMemberShareResult> {
  await requireNotImpersonating();
  try {
    const auth = await requireWorkspaceStaffAction();
    if (!auth.ok) return { ok: false, reason: "unauthenticated" };
    const { tenantId, user, supabase } = auth;
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, reason: "unavailable" };

    const { data: membership } = await tenantScopedQuery(supabase, "agency_memberships", tenantId)
      .select("role")
      .eq("profile_id", user.id)
      .eq("status", "active")
      .maybeSingle();
    const { data: agency, error: agencyErr } = await admin.from("agencies").select("work_model").eq("id", tenantId).maybeSingle();
    if (agencyErr) return { ok: false, reason: "unavailable" };
    const { data: member } = await tenantScopedQuery(admin, "agency_talent_roster", tenantId)
      .select("id")
      .eq("talent_profile_id", input.talentProfileId)
      .neq("status", "removed")
      .maybeSingle();

    const decision = decideMemberShareUpdate({
      role: (membership as { role?: string } | null)?.role ?? null,
      workModel: (agency as { work_model?: string | null } | null)?.work_model ?? null,
      memberOnRoster: Boolean(member),
      share: input.share,
    });
    if (!decision.ok) return decision;

    const { error } = await tenantScopedQuery(admin, "agency_talent_roster", tenantId)
      .update(decision.mode === "propose" ? { ...decision.patch, pending_share_proposed_at: new Date().toISOString() } : decision.patch)
      .eq("talent_profile_id", input.talentProfileId);
    if (error) {
      logServerError("friends-collective.setMemberShare", error);
      return { ok: false, reason: "unavailable" };
    }
    await logWorkspaceAudit({
      tenantId,
      category: "roster",
      action: "workspace.owner_share.set",
      summary: input.share ? "Proposed the owner's share of a member's sales (pending the member's acceptance)" : "Cleared the owner's share of a member's sales",
      targetType: "talent_profile",
      targetId: input.talentProfileId,
      metadata: { share: input.share, mode: decision.mode },
    });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    logServerError("friends-collective.setMemberShare", err);
    return { ok: false, reason: "unavailable" };
  }
}


export type RespondShareResult =
  | { ok: true; outcome: "accepted" | "declined" }
  | { ok: false; reason: "unauthenticated" | "not_the_member" | "nothing_pending" | "proposal_changed" | "unavailable" };

/**
 * The MEMBER answers the owner's proposal for ONE workspace. Accepting makes the
 * pending share the effective one (version + 1, who and when recorded); orders
 * priced from then on use it and snapshot it on their lines. Declining drops it.
 * Only the member herself (never an owner or admin acting for her), and never
 * while impersonating.
 */
export async function respondToOwnerShare(input: { tenantId: string; accept: boolean; proposedAt: string }): Promise<RespondShareResult> {
  await requireNotImpersonating();
  try {
    const me = await requireTalentSelf();
    if (!me.ok) return { ok: false, reason: "unauthenticated" };
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, reason: "unavailable" };

    const { data: row, error } = await tenantScopedQuery(admin, "agency_talent_roster", input.tenantId)
      .select("talent_profile_id, pending_share_kind, pending_share_bps, pending_share_cents, pending_share_currency, pending_share_proposed_at, owner_share_version")
      .eq("talent_profile_id", me.talentProfile.id)
      .neq("status", "removed")
      .maybeSingle();
    if (error) return { ok: false, reason: "unavailable" };
    const r = row as { pending_share_kind: string | null; pending_share_bps: number | null; pending_share_cents: number | null; pending_share_currency: string | null; pending_share_proposed_at: string | null; owner_share_version: number | null } | null;
    const pending = r
      ? parseOwnerShareRow({ owner_share_kind: r.pending_share_kind, owner_share_bps: r.pending_share_bps, owner_share_cents: r.pending_share_cents, owner_share_currency: r.pending_share_currency })
      : null;

    // The accept must carry the exact proposal she saw (its timestamp) and match the stored pending row.
    const proposalMatches = Boolean(r?.pending_share_proposed_at) && r?.pending_share_proposed_at != null && Date.parse(r.pending_share_proposed_at) === Date.parse(input.proposedAt);
    const decision = decideShareResponse({ isTheMember: Boolean(r), hasPending: Boolean(pending), proposalMatches, accept: input.accept });
    if (!decision.ok) return decision;

    const clearPending = { pending_share_kind: null, pending_share_bps: null, pending_share_cents: null, pending_share_currency: null, pending_share_proposed_at: null };
    const patch =
      decision.outcome === "accepted" && pending
        ? {
            ...clearPending,
            owner_share_kind: pending.kind,
            owner_share_bps: pending.kind === "percent" ? pending.bps : null,
            owner_share_cents: pending.kind === "fixed" ? pending.amountCents : null,
            owner_share_currency: pending.kind === "fixed" ? pending.currency : null,
            owner_share_version: (r?.owner_share_version ?? 0) + 1,
            owner_share_accepted_at: new Date().toISOString(),
            owner_share_accepted_by: me.session.user.id,
          }
        : clearPending;
    // Compare-and-swap: the write only lands while the pending row is still the one she answered, so an
    // owner who swaps the proposal between the read and this write changes nothing (0 rows -> refused).
    const { data: written, error: wErr } = await tenantScopedQuery(admin, "agency_talent_roster", input.tenantId)
      .update(patch)
      .eq("talent_profile_id", me.talentProfile.id)
      .eq("pending_share_proposed_at", r?.pending_share_proposed_at ?? "")
      .select("talent_profile_id");
    if (wErr) {
      logServerError("friends-collective.respondShare", wErr);
      return { ok: false, reason: "unavailable" };
    }
    if (!Array.isArray(written) || written.length !== 1) return { ok: false, reason: "proposal_changed" };
    await logWorkspaceAudit({
      tenantId: input.tenantId,
      category: "roster",
      action: decision.outcome === "accepted" ? "workspace.owner_share.accepted" : "workspace.owner_share.declined",
      summary: decision.outcome === "accepted" ? "A member accepted the owner's share" : "A member declined the owner's share",
      targetType: "talent_profile",
      targetId: me.talentProfile.id,
      metadata: { share: pending, version: decision.outcome === "accepted" ? (r?.owner_share_version ?? 0) + 1 : null },
    });
    revalidatePath("/", "layout");
    return { ok: true, outcome: decision.outcome };
  } catch (err) {
    logServerError("friends-collective.respondShare", err);
    return { ok: false, reason: "unavailable" };
  }
}
