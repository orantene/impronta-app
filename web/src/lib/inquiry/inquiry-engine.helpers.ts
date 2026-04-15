import type { SupabaseClient } from "@supabase/supabase-js";
import { improntaLog } from "@/lib/server/structured-log";
import { validateInquiryConsistency } from "./inquiry-lifecycle";
import type { EngineResult } from "./inquiry-engine.types";

export async function runWithEngineLog<T>(
  action: string,
  inquiryId: string | undefined,
  actorUserId: string | undefined,
  fn: () => Promise<EngineResult<T>>,
): Promise<EngineResult<T>> {
  const started = Date.now();
  try {
    const result = await fn();
    await improntaLog("inquiry_engine", {
      action,
      inquiryId: inquiryId ?? "",
      actorUserId: actorUserId ?? "",
      result: result.success ? (result.already ? "already" : "success") : "error",
      durationMs: Date.now() - started,
      errorReason: result.success ? "" : (result.reason ?? result.error ?? ""),
    });
    return result;
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    await improntaLog("inquiry_engine", {
      action,
      inquiryId: inquiryId ?? "",
      actorUserId: actorUserId ?? "",
      result: "error",
      durationMs: Date.now() - started,
      errorReason: err,
    });
    return { success: false, error: err };
  }
}

export async function assertConsistencyAfterWrite(
  supabase: SupabaseClient,
  inquiryId: string,
): Promise<void> {
  const { data } = await supabase
    .from("inquiries")
    .select(
      "status, next_action_by, coordinator_id, current_offer_id, booked_at, is_frozen, frozen_at, frozen_by_user_id",
    )
    .eq("id", inquiryId)
    .maybeSingle();
  if (!data) return;
  const c = validateInquiryConsistency({
    status: data.status as string,
    next_action_by: data.next_action_by as string | null,
    coordinator_id: data.coordinator_id as string | null,
    current_offer_id: data.current_offer_id as string | null,
    booked_at: data.booked_at as string | null,
    is_frozen: data.is_frozen as boolean,
    frozen_at: data.frozen_at as string | null,
    frozen_by_user_id: data.frozen_by_user_id as string | null,
  });
  if (!c.ok) {
    await improntaLog("inquiry_engine.consistency_alert", { inquiryId, message: c.message });
  }
}
