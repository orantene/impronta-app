import "server-only";

import { logServerError } from "@/lib/server/safe-error";
import type { Admin } from "./sale-rows";

export type LinkedBookingKind = "talent_booking" | "agency_booking" | "admission";

export type LinkBookingResult =
  | { ok: true; orderId: string; already?: boolean }
  | {
      ok: false;
      reason: "already_linked" | "wrong_tenant" | "nothing_owed" | "conflict" | "not_found" | "unavailable" | "invalid";
    };

export async function linkBooking(
  admin: Admin,
  input: {
    tenantId: string;
    orderId: string;
    bookingKind: LinkedBookingKind;
    bookingId: string;
    operationKey: string;
  },
): Promise<LinkBookingResult> {
  if (input.operationKey.trim().length < 8) return { ok: false, reason: "invalid" };
  if (typeof admin.rpc !== "function") return { ok: false, reason: "unavailable" };
  const { data, error } = await admin.rpc("pos_link_booking", {
    p_tenant_id: input.tenantId,
    p_order_id: input.orderId,
    p_booking_kind: input.bookingKind,
    p_booking_id: input.bookingId,
    p_operation_key: input.operationKey.trim(),
  });
  if (error) {
    logServerError("pos.linkBooking", error);
    return { ok: false, reason: "unavailable" };
  }
  const reply = (data ?? {}) as { ok?: boolean; reason?: string; already?: boolean; order_id?: string };
  if (reply.ok === true) return { ok: true, orderId: reply.order_id ?? input.orderId, already: reply.already === true };
  const reason = reply.reason;
  if (
    reason === "already_linked" ||
    reason === "wrong_tenant" ||
    reason === "nothing_owed" ||
    reason === "conflict" ||
    reason === "not_found"
  ) {
    return { ok: false, reason };
  }
  return { ok: false, reason: "unavailable" };
}

/** The agency_bookings id a collection should pay, when the sale is linked. */
export async function linkedAgencyBookingId(
  admin: Admin,
  input: { tenantId: string; orderId: string },
): Promise<string | null> {
  const { data, error } = await admin
    .from("order_lines")
    .select("booking_id, booking_kind")
    .eq("order_id", input.orderId)
    .eq("tenant_id", input.tenantId)
    .not("booking_id", "is", null)
    .limit(1)
    .maybeSingle();
  if (error) {
    logServerError("pos.linkedAgencyBookingId", error);
    return null;
  }
  const row = data as { booking_id: string; booking_kind: string | null } | null;
  if (!row?.booking_id) return null;
  if (row.booking_kind !== "agency_booking") return null;
  return row.booking_id;
}
