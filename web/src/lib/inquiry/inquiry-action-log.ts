import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The closed set of Phase 1 action types (spec §10.2). Engine call sites emit
 * exactly one of these. Adding a new type here requires a spec-table update
 * and grep/update of all log dashboards.
 */
export type InquiryActionType =
  | "coordinator_assigned"
  | "coordinator_promoted"
  | "coordinator_removed"
  | "participant_moved_group"
  | "booking_conversion_attempt"
  | "booking_conversion_override"
  | "message_sent";

export type InquiryActionResult = "success" | "failure";

/**
 * Small, ID-and-scalar-only context payload. **No PII** — no message bodies,
 * no full participant objects, no stack traces (spec §10.3.4). Kept under 2KB
 * by the DB CHECK constraint; any caller approaching that is doing something
 * wrong.
 */
export type InquiryActionMetadata = Record<string, unknown>;

export type LogInquiryActionInput = {
  inquiryId: string;
  actorUserId: string;
  actionType: InquiryActionType;
  result: InquiryActionResult;
  /** Failure reason code OR override justification. Short free text. */
  reason?: string | null;
  metadata?: InquiryActionMetadata | null;
};

/**
 * Record an action attempt against `inquiry_action_log` (spec §10).
 *
 * **Non-negotiable invariants:**
 *   1. Never throws. A failed log write is logged to the server console and
 *      swallowed — the caller's action must still complete.
 *   2. No retry — accepted Phase 1 trade-off.
 *   3. Returns `true` on success, `false` on any failure (including network,
 *      RLS denial, constraint violation). Callers generally ignore the return
 *      value but it's available for tests and diagnostics.
 *
 * Usage pattern (from engine actions):
 *
 *   const { success, reason } = await doTheThing(...);
 *   await logInquiryAction(supabase, {
 *     inquiryId, actorUserId, actionType: 'coordinator_promoted',
 *     result: success ? 'success' : 'failure',
 *     reason: success ? null : reason,
 *     metadata: { target_user_id: targetId },
 *   });
 *   return { success, reason };
 *
 * The call lives on the success AND failure branches; both paths land in the log.
 */
export async function logInquiryAction(
  supabase: SupabaseClient,
  input: LogInquiryActionInput,
): Promise<boolean> {
  try {
    const { error } = await supabase.from("inquiry_action_log").insert({
      inquiry_id: input.inquiryId,
      actor_user_id: input.actorUserId,
      action_type: input.actionType,
      result: input.result,
      reason: input.reason ?? null,
      metadata: input.metadata ?? null,
    });

    if (error) {
      // Server console only — we do not surface log failures to the caller.
      console.error("[inquiry_action_log] insert failed", {
        inquiryId: input.inquiryId,
        actionType: input.actionType,
        result: input.result,
        code: error.code,
        message: error.message,
      });
      return false;
    }

    return true;
  } catch (err) {
    // Absolute last-resort catch. If the Supabase client throws synchronously
    // (network failure pre-request, thrown interceptor, etc.), we still must
    // not propagate to the caller.
    console.error("[inquiry_action_log] threw unexpectedly", {
      inquiryId: input.inquiryId,
      actionType: input.actionType,
      err,
    });
    return false;
  }
}
