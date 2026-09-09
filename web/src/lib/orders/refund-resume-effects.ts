import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import { admissionIsRefundable, classifyAdmissionEffect } from "@/lib/orders/refund-admissions";

/**
 * Finish the TICKET EFFECTS of a refund whose money already moved.
 *
 * WHY THIS EXISTS AS A SEPARATE PATH. `refundOrderLines` can return `ok` with
 * `admissionsIncomplete: true` — the money landed, the line is stamped, and one
 * `refund_admission` call did not take. The effect is genuinely retryable,
 * because that RPC is idempotent by identity. Re-running the whole executor is
 * NOT the way to retry it: `planRefund` derives each transaction's headroom
 * from its sibling `refunded` rows, so on a second pass there is no money left
 * to move, the plan refuses, and the function returns before it ever reaches
 * the admissions loop. The effect would stay unresolved for ever precisely
 * because the money half succeeded.
 *
 * So this touches NO money by construction. It reads admissions and calls the
 * one atomic RPC. There is no path from here to Stripe, which is what makes it
 * safe to expose to an operator with a Retry button.
 *
 * It is deliberately idempotent and safe to call when nothing is wrong: a row
 * already `refunded` answers `ok, already` and is counted under `alreadyDone`.
 */

export type ResumeRefundEffectsResult =
  | {
      ok: true;
      /** Stamped by THIS call. */
      stamped: number;
      /** Already stamped by an earlier attempt. Success, not work. */
      alreadyDone: number;
      /** Still refusing. Above zero means a human is still needed. */
      stillIncomplete: number;
      /** Scanned in, so never refundable by line. Not an error. */
      skippedAdmitted: number;
    }
  | { ok: false; reason: "unavailable" | "no_admissions"; error: string };

export async function resumeRefundEffects(
  admin: Pick<SupabaseClient, "from" | "rpc">,
  input: { orderId: string; lineIds: readonly string[] },
): Promise<ResumeRefundEffectsResult> {
  if (input.lineIds.length === 0) {
    return { ok: false, reason: "no_admissions", error: "No lines to resume." };
  }

  const { data: admRows, error: admErr } = await admin
    .from("admissions")
    .select("id, order_line_id, admitted_count, status")
    .in("order_line_id", [...input.lineIds]);
  if (admErr) {
    logServerError("orders.resumeRefundEffects/read", admErr);
    return { ok: false, reason: "unavailable", error: "Could not read the tickets." };
  }

  const rows = (admRows ?? []) as Array<{ id: string; admitted_count: number; status: string }>;
  if (rows.length === 0) {
    return { ok: false, reason: "no_admissions", error: "Those lines have no tickets." };
  }

  let stamped = 0;
  let alreadyDone = 0;
  let stillIncomplete = 0;
  let skippedAdmitted = 0;

  for (const a of rows) {
    if (a.status === "refunded") {
      alreadyDone += 1;
      continue;
    }
    if (!admissionIsRefundable({ admittedCount: a.admitted_count, status: a.status })) {
      skippedAdmitted += 1;
      continue;
    }
    const { data: res, error } = await admin.rpc("refund_admission", { p_admission_id: a.id });
    const effect = classifyAdmissionEffect(res as { ok?: boolean; reason?: string } | null, error);
    if (effect.effect === "stamped") {
      if (effect.already) alreadyDone += 1;
      else stamped += 1;
    } else if (effect.effect === "incomplete") {
      stillIncomplete += 1;
      logServerError(
        "orders.resumeRefundEffects/STILL_NOT_VOIDED",
        `order ${input.orderId}: retry of admission ${a.id} failed again `
          + `(${effect.why}: ${effect.reason ?? "no reason given"}).`,
      );
    } else {
      skippedAdmitted += 1;
    }
  }

  return { ok: true, stamped, alreadyDone, stillIncomplete, skippedAdmitted };
}
