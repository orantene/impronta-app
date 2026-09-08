/**
 * P6-04 — arrival is not a payment event.
 *
 * `check_in` already stamps admitted_count. This command scopes the admission
 * to the workspace first (the RPC has no tenant predicate) and never opens a
 * booking_transaction. A complimentary place that is marked present is still
 * not money owed.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import { isMoneyOwed } from "@/lib/orders/orders-list";

export { isMoneyOwed };

type Admin = Pick<SupabaseClient, "from" | "rpc">;

export async function markAttendance(
  admin: Admin,
  input: { tenantId: string; admissionId: string; actorUserId?: string | null; count?: number | null },
): Promise<
  | { ok: true; admittedCount: number }
  | { ok: false; reason: "not_found" | "unavailable" | "invalid"; error: string }
> {
  if (!input.tenantId || !input.admissionId) {
    return { ok: false, reason: "invalid", error: "Missing admission." };
  }
  const { data: owned, error: ownErr } = await admin
    .from("admissions")
    .select("id")
    .eq("id", input.admissionId)
    .eq("tenant_id", input.tenantId)
    .maybeSingle();
  if (ownErr) {
    logServerError("sessions.markAttendance.scope", ownErr);
    return { ok: false, reason: "unavailable", error: "Could not mark attendance." };
  }
  if (!owned) return { ok: false, reason: "not_found", error: "That place is gone." };

  const { data, error } = await admin.rpc("check_in", {
    p_admission_id: input.admissionId,
    p_mode: "actor",
    p_count: input.count ?? null,
    p_actor: input.actorUserId ?? null,
    p_token_version: null,
  });
  if (error) {
    logServerError("sessions.markAttendance.check_in", error);
    return { ok: false, reason: "unavailable", error: "Could not mark attendance." };
  }
  const reply = (data ?? {}) as { ok?: boolean; admitted_count?: number; reason?: string };
  if (reply.ok !== true) {
    return {
      ok: false,
      reason: reply.reason === "unknown_admission" ? "not_found" : "unavailable",
      error: "Could not mark attendance.",
    };
  }
  return { ok: true, admittedCount: Number(reply.admitted_count) || 0 };
}
