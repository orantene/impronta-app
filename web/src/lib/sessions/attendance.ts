/**
 * P6-04 — arrival is not a payment event.
 *
 * `check_in` already stamps admitted_count. This command scopes the admission
 * to the workspace first (the RPC has no tenant predicate) and never opens a
 * booking_transaction. A complimentary place that is marked present is still
 * not money owed.
 */

import { drawdownLesson } from "@/lib/bookings/lesson-package";
import { logServerError } from "@/lib/server/safe-error";
import { isMoneyOwed } from "@/lib/orders/orders-list";

export { isMoneyOwed };

type Admin = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc: (...args: any[]) => any;
};

export async function markAttendance(
  admin: Admin,
  input: { tenantId: string; admissionId: string; actorUserId?: string | null; count?: number | null },
): Promise<
  | { ok: true; admittedCount: number }
  | {
      ok: false;
      /**
       * `already_marked` and `not_valid` are `check_in`'s own answers
       * (`already_admitted`, `not_valid`), carried through instead of folded
       * into `unavailable`: a roster that says "could not mark attendance"
       * for a person who was marked a minute ago sends the instructor to
       * retry a thing that already happened.
       */
      reason: "not_found" | "unavailable" | "invalid" | "already_marked" | "not_valid";
      error: string;
    }
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
    if (reply.reason === "unknown_admission") {
      return { ok: false, reason: "not_found", error: "That place is gone." };
    }
    if (reply.reason === "already_admitted") {
      return { ok: false, reason: "already_marked", error: "Attendance is already marked." };
    }
    if (reply.reason === "not_valid") {
      return { ok: false, reason: "not_valid", error: "That place is not valid any more." };
    }
    return { ok: false, reason: "unavailable", error: "Could not mark attendance." };
  }
  try {
    await maybeDrawdownLessonPackage(admin, input.tenantId, input.admissionId);
  } catch (err) {
    logServerError("sessions.markAttendance.drawdown", err);
  }
  return { ok: true, admittedCount: Number(reply.admitted_count) || 0 };
}

async function maybeDrawdownLessonPackage(admin: Admin, tenantId: string, admissionId: string): Promise<void> {
  const { data: admission, error: admErr } = await admin
    .from("admissions")
    .select("id, order_line_id")
    .eq("id", admissionId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (admErr) {
    logServerError("sessions.markAttendance.admission", admErr);
    return;
  }
  const lineId = (admission as { order_line_id?: string | null } | null)?.order_line_id;
  if (!lineId) return;

  const { data: line, error: lineErr } = await admin
    .from("order_lines")
    .select("id, order_id")
    .eq("id", lineId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (lineErr) {
    logServerError("sessions.markAttendance.line", lineErr);
    return;
  }
  const orderId = (line as { order_id?: string | null } | null)?.order_id;
  if (!orderId) return;

  const { data: booking, error: bookErr } = await admin
    .from("agency_bookings")
    .select("id")
    .eq("order_id", orderId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (bookErr) {
    logServerError("sessions.markAttendance.booking", bookErr);
    return;
  }
  const bookingId = (booking as { id?: string } | null)?.id;
  if (!bookingId) return;

  const { data: pack, error: packErr } = await admin
    .from("lesson_packages")
    .select("id")
    .eq("booking_id", bookingId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (packErr) {
    logServerError("sessions.markAttendance.package", packErr);
    return;
  }
  const packageId = (pack as { id?: string } | null)?.id;
  if (!packageId) return;

  const drawn = await drawdownLesson(admin, {
    tenantId,
    packageId,
    consumptionKey: admissionId,
  });
  if (!drawn.ok && drawn.reason !== "exhausted") {
    logServerError("sessions.markAttendance.drawdownResult", drawn);
  }
}
