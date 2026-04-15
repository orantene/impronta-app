import type { SupabaseClient } from "@supabase/supabase-js";
import { canTransition, resolveNextActionBy } from "./inquiry-lifecycle";
import { validateActorPermission } from "./inquiry-permissions";
import { engineRateKey, rateLimiter } from "./inquiry-rate-limiter";
import { ENGINE_EVENT_TYPES, emitStandardEngineEvent } from "./inquiry-events";
import { assertConsistencyAfterWrite, runWithEngineLog } from "./inquiry-engine.helpers";
import type { EngineResult } from "./inquiry-engine.types";

export async function submitApproval(
  supabase: SupabaseClient,
  ctx: {
    inquiryId: string;
    offerId: string;
    participantId: string;
    actorUserId: string;
    expectedVersion: number;
    decision: "accepted" | "rejected";
    notes?: string | null;
  },
): Promise<EngineResult> {
  return runWithEngineLog("submitApproval", ctx.inquiryId, ctx.actorUserId, async () => {
    const rl = await rateLimiter.check(engineRateKey("submitApproval", ctx.actorUserId), 10, 60_000);
    if (!rl.ok) return { success: false, rateLimited: true, retryAfterMs: rl.retryAfterMs, reason: "rate_limited" };

    const perm = await validateActorPermission(supabase, ctx.inquiryId, ctx.actorUserId, "submit_approval");
    if (!perm.ok) return { success: false, forbidden: true, reason: "forbidden" };

    const { data, error } = await supabase.rpc("engine_submit_approval", {
      p_inquiry_id: ctx.inquiryId,
      p_offer_id: ctx.offerId,
      p_participant_id: ctx.participantId,
      p_actor_user_id: ctx.actorUserId,
      p_inquiry_expected_version: ctx.expectedVersion,
      p_decision: ctx.decision,
      p_notes: ctx.notes ?? null,
    });

    if (error) {
      const msg = String(error.message || "");
      if (msg.includes("version_conflict")) return { success: false, conflict: true, reason: "version_conflict" };
      if (msg.includes("inquiry_frozen")) return { success: false, reason: "inquiry_frozen" };
      return { success: false, error: msg || "submit_approval_failed" };
    }

    const transition = (data as { transition?: string; already?: boolean } | null)?.transition ?? "none";
    const already = Boolean((data as { already?: boolean } | null)?.already);

    if (already) return { success: true, already: true };

    await emitStandardEngineEvent(supabase, {
      type: ENGINE_EVENT_TYPES.APPROVAL_SUBMITTED,
      inquiryId: ctx.inquiryId,
      actorUserId: ctx.actorUserId,
      data: { offerId: ctx.offerId, participantId: ctx.participantId, decision: ctx.decision },
    });

    if (transition === "rejected_to_coordination") {
      await emitStandardEngineEvent(supabase, {
        type: ENGINE_EVENT_TYPES.APPROVAL_REJECTED,
        inquiryId: ctx.inquiryId,
        actorUserId: ctx.actorUserId,
        data: { offerId: ctx.offerId, participantId: ctx.participantId },
      });
      return { success: true };
    }

    if (transition === "approved") {
      const t = canTransition("offer_pending", "approved");
      if (!t.ok) return { success: false, reason: t.reason };
      await emitStandardEngineEvent(supabase, {
        type: ENGINE_EVENT_TYPES.APPROVALS_COMPLETED,
        inquiryId: ctx.inquiryId,
        actorUserId: ctx.actorUserId,
        data: { offerId: ctx.offerId },
        systemMessage: {
          threadType: "private",
          body: "All approvals are complete.",
          eventType: "all_approvals_complete",
        },
      });
    }

    await assertConsistencyAfterWrite(supabase, ctx.inquiryId);
    return { success: true };
  });
}

export async function rejectApproval(
  supabase: SupabaseClient,
  ctx: Omit<Parameters<typeof submitApproval>[1], "decision">,
): Promise<EngineResult> {
  return submitApproval(supabase, { ...ctx, decision: "rejected" });
}

/** Client shortcut — resolves client participant row and records approval. */
export async function clientAcceptOffer(
  supabase: SupabaseClient,
  ctx: { inquiryId: string; offerId: string; actorUserId: string; expectedVersion: number },
): Promise<EngineResult> {
  const { data: part } = await supabase
    .from("inquiry_participants")
    .select("id")
    .eq("inquiry_id", ctx.inquiryId)
    .eq("user_id", ctx.actorUserId)
    .eq("role", "client")
    .maybeSingle();
  if (!part) return { success: false, error: "no_client_participant" };
  return submitApproval(supabase, {
    inquiryId: ctx.inquiryId,
    offerId: ctx.offerId,
    participantId: part.id as string,
    actorUserId: ctx.actorUserId,
    expectedVersion: ctx.expectedVersion,
    decision: "accepted",
  });
}
