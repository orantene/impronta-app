import type { SupabaseClient } from "@supabase/supabase-js";
import { validateActorPermission } from "./inquiry-permissions";
import { engineRateKey, rateLimiter } from "./inquiry-rate-limiter";
import { improntaLog } from "@/lib/server/structured-log";
import { assertConsistencyAfterWrite, runWithEngineLog } from "./inquiry-engine.helpers";
import { ENGINE_EVENT_TYPES, emitStandardEngineEvent } from "./inquiry-events";
import type { EngineResult } from "./inquiry-engine.types";

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
  ctx: { inquiryId: string; actorUserId: string; expectedVersion: number },
): Promise<EngineResult<{ bookingId: string }>> {
  return runWithEngineLog("convertToBooking", ctx.inquiryId, ctx.actorUserId, async () => {
    const rl = await rateLimiter.check(engineRateKey("convertToBooking", ctx.actorUserId), 5, 60 * 60_000);
    if (!rl.ok) return { success: false, rateLimited: true, retryAfterMs: rl.retryAfterMs, reason: "rate_limited" };

    const perm = await validateActorPermission(supabase, ctx.inquiryId, ctx.actorUserId, "convert_to_booking");
    if (!perm.ok) return { success: false, forbidden: true, reason: "forbidden" };
    const { data, error } = await supabase.rpc("engine_convert_to_booking", {
      p_inquiry_id: ctx.inquiryId,
      p_actor_user_id: ctx.actorUserId,
      p_inquiry_expected_version: ctx.expectedVersion,
    });

    if (error) {
      const msg = String(error.message || "");
      if (msg.includes("version_conflict")) return { success: false, conflict: true, reason: "version_conflict" };
      if (msg.includes("inquiry_frozen")) return { success: false, reason: "inquiry_frozen" };
      if (msg.includes("approvals_incomplete")) return { success: false, reason: "approvals_incomplete" };
      if (msg.includes("no_active_offer")) return { success: false, reason: "no_active_offer" };
      if (msg.includes("legacy_use_convert_flow")) return { success: false, error: "legacy_use_convert_flow" };
      return { success: false, error: msg || "convert_failed" };
    }

    const bookingId = String(data ?? "").trim();
    if (!bookingId) return { success: false, error: "convert_failed" };

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
      data: { bookingId },
      systemMessage: {
        threadType: "group",
        body: "Inquiry converted to booking.",
        eventType: "inquiry_booked",
      },
    });

    return { success: true, data: { bookingId } };
  });
}
