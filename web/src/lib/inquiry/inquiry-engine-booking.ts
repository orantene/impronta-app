import type { SupabaseClient } from "@supabase/supabase-js";
import { validateActorPermission } from "./inquiry-permissions";
import { engineRateKey, rateLimiter } from "./inquiry-rate-limiter";
import { improntaLog } from "@/lib/server/structured-log";
import { assertConsistencyAfterWrite, runWithEngineLog } from "./inquiry-engine.helpers";
import { ENGINE_EVENT_TYPES, emitStandardEngineEvent } from "./inquiry-events";
import type { EngineResult } from "./inquiry-engine.types";
import { logInquiryAction } from "./inquiry-action-log";
import { getInquiryGroupShortfall } from "./inquiry-fulfillment";

async function onBookingCreated(
  bookingId: string,
  ctx: {
    inquiryId: string;
    totalClientPrice: number;
    currencyCode: string;
    clientAccountId: string | null;
  },
): Promise<void> {
  await improntaLog("onBookingCreated", {
    bookingId,
    inquiryId: ctx.inquiryId,
    totalClientPrice: ctx.totalClientPrice,
    currencyCode: ctx.currencyCode,
    clientAccountId: ctx.clientAccountId ?? "",
  });
}

export async function convertToBooking(
  supabase: SupabaseClient,
  ctx: {
    inquiryId: string;
    actorUserId: string;
    expectedVersion: number;
    /**
     * M2.3: admin override reason. When provided AND the actor is super_admin
     * AND there is a shortfall, conversion proceeds with override metadata
     * persisted on `agency_bookings`. Min 10 chars (trimmed). The RPC enforces
     * both the role and length constraints. The failure return may include a
     * structured `shortfall` field (see `EngineErr.shortfall`) when
     * `reason === "requirement_groups_unfulfilled"`.
     */
    overrideReason?: string | null;
  },
): Promise<EngineResult<{ bookingId: string; createdWithOverride: boolean }>> {
  return runWithEngineLog("convertToBooking", ctx.inquiryId, ctx.actorUserId, async () => {
    const rl = await rateLimiter.check(engineRateKey("convertToBooking", ctx.actorUserId), 5, 60 * 60_000);
    if (!rl.ok) {
      await logInquiryAction(supabase, {
        inquiryId: ctx.inquiryId,
        actorUserId: ctx.actorUserId,
        actionType: "booking_conversion_attempt",
        result: "failure",
        reason: "rate_limited",
      });
      return { success: false, rateLimited: true, retryAfterMs: rl.retryAfterMs, reason: "rate_limited" };
    }

    const perm = await validateActorPermission(supabase, ctx.inquiryId, ctx.actorUserId, "convert_to_booking");
    if (!perm.ok) {
      await logInquiryAction(supabase, {
        inquiryId: ctx.inquiryId,
        actorUserId: ctx.actorUserId,
        actionType: "booking_conversion_attempt",
        result: "failure",
        reason: "forbidden",
      });
      return { success: false, forbidden: true, reason: "forbidden" };
    }

    const overrideReasonTrimmed =
      typeof ctx.overrideReason === "string" ? ctx.overrideReason.trim() : null;
    const overrideReasonForRpc =
      overrideReasonTrimmed && overrideReasonTrimmed.length > 0 ? overrideReasonTrimmed : null;

    const { data, error } = await supabase.rpc("engine_convert_to_booking", {
      p_inquiry_id: ctx.inquiryId,
      p_actor_user_id: ctx.actorUserId,
      p_inquiry_expected_version: ctx.expectedVersion,
      p_override_reason: overrideReasonForRpc,
    });

    if (error) {
      const msg = String(error.message || "");
      let result: EngineResult<{ bookingId: string; createdWithOverride: boolean }>;
      if (msg.includes("version_conflict")) {
        result = { success: false, conflict: true, reason: "version_conflict" };
      } else if (msg.includes("inquiry_frozen")) {
        result = { success: false, reason: "inquiry_frozen" };
      } else if (msg.includes("approvals_incomplete")) {
        result = { success: false, reason: "approvals_incomplete" };
      } else if (msg.includes("no_active_offer")) {
        result = { success: false, reason: "no_active_offer" };
      } else if (msg.includes("requirement_groups_unfulfilled")) {
        // Fetch structured shortfall for UI — fails closed on error.
        const readiness = await getInquiryGroupShortfall(supabase, ctx.inquiryId);
        result = {
          success: false,
          reason: "requirement_groups_unfulfilled",
          shortfall: readiness.shortfall,
        };
      } else if (msg.includes("override_not_allowed")) {
        result = { success: false, reason: "override_not_allowed", forbidden: true };
      } else if (msg.includes("override_reason_too_short")) {
        result = { success: false, reason: "override_reason_too_short" };
      } else if (msg.includes("forbidden")) {
        result = { success: false, reason: "forbidden", forbidden: true };
      } else {
        result = { success: false, error: msg || "convert_failed" };
      }

      const err = result as Exclude<typeof result, { success: true }>;
      await logInquiryAction(supabase, {
        inquiryId: ctx.inquiryId,
        actorUserId: ctx.actorUserId,
        actionType: "booking_conversion_attempt",
        result: "failure",
        reason: err.reason ?? err.error ?? "convert_failed",
        metadata:
          err.reason === "requirement_groups_unfulfilled"
            ? { shortfall: err.shortfall, override_attempted: overrideReasonForRpc !== null }
            : { override_attempted: overrideReasonForRpc !== null },
      });

      return result;
    }

    const bookingId = String(data ?? "").trim();
    if (!bookingId) {
      await logInquiryAction(supabase, {
        inquiryId: ctx.inquiryId,
        actorUserId: ctx.actorUserId,
        actionType: "booking_conversion_attempt",
        result: "failure",
        reason: "convert_failed",
      });
      return { success: false, error: "convert_failed" };
    }

    const createdWithOverride = overrideReasonForRpc !== null;

    // Always log the conversion attempt outcome...
    await logInquiryAction(supabase, {
      inquiryId: ctx.inquiryId,
      actorUserId: ctx.actorUserId,
      actionType: "booking_conversion_attempt",
      result: "success",
      reason: null,
      metadata: { booking_id: bookingId, created_with_override: createdWithOverride },
    });

    // ...and, separately, log the override action when one was used. This gives
    // dashboards a clean filter for override events without needing to parse
    // metadata flags on every attempt row.
    if (createdWithOverride) {
      await logInquiryAction(supabase, {
        inquiryId: ctx.inquiryId,
        actorUserId: ctx.actorUserId,
        actionType: "booking_conversion_override",
        result: "success",
        reason: overrideReasonForRpc,
        metadata: { booking_id: bookingId },
      });
    }

    // Best-effort post-commit effects (kept outside transaction wrapper).
    await onBookingCreated(bookingId, {
      inquiryId: ctx.inquiryId,
      totalClientPrice: 0,
      currencyCode: "",
      clientAccountId: null,
    });

    await assertConsistencyAfterWrite(supabase, ctx.inquiryId);

    await emitStandardEngineEvent(supabase, {
      type: ENGINE_EVENT_TYPES.BOOKING_CREATED,
      inquiryId: ctx.inquiryId,
      actorUserId: ctx.actorUserId,
      data: { bookingId, createdWithOverride },
      systemMessage: {
        threadType: "group",
        body: "Inquiry converted to booking.",
        eventType: "inquiry_booked",
      },
    });

    return { success: true, data: { bookingId, createdWithOverride } };
  });
}
