import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import type { ReservationStamp } from "./reservation-intent";

export type ReservationCardStatus = "requested" | "proposed" | "confirmed" | "declined";

export type ReservationCardPayload = {
  status: ReservationCardStatus;
  starts_at: string;
  ends_at: string;
  timezone: string;
  offering_id?: string | null;
  hold_id?: string | null;
  proposed_by?: "client" | "staff";
};

export function reservationCardPayload(
  stamp: ReservationStamp,
  status: ReservationCardStatus,
  proposedBy: "client" | "staff",
): ReservationCardPayload {
  return {
    status,
    starts_at: stamp.starts_at,
    ends_at: stamp.ends_at,
    timezone: stamp.timezone,
    offering_id: stamp.offering_id,
    hold_id: stamp.hold_id ?? null,
    proposed_by: proposedBy,
  };
}

export async function insertReservationCards(
  admin: SupabaseClient,
  args: {
    inquiryId: string;
    tenantId: string;
    actorUserId: string | null;
    payload: ReservationCardPayload;
    body: string;
  },
): Promise<void> {
  const row = {
    inquiry_id: args.inquiryId,
    tenant_id: args.tenantId,
    sender_user_id: args.actorUserId,
    body: args.body,
    message_kind: "reservation",
    card_payload: args.payload,
  };
  try {
    await admin.from("inquiry_messages").insert({ ...row, thread_type: "private" });
    await admin.from("inquiry_messages").insert({ ...row, thread_type: "group" });
  } catch (err) {
    logServerError("reservation-card.insert", err);
  }
}
