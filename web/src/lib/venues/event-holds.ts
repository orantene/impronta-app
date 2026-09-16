import "server-only";

import { logServerError } from "@/lib/server/safe-error";
import { deliverTicketForAdmission } from "@/lib/events/ticket-delivery";
import type { VenueAdmin } from "./locations";

export type EventHoldReason =
  | "seat_taken"
  | "hold_expired"
  | "same_session"
  | "price_up_needs_payment"
  | "needs_approval"
  | "channel_unavailable"
  | "conflict"
  | "not_found"
  | "wrong_tenant"
  | "not_open"
  | "invalid"
  | "unavailable";

const REASONS = new Set<EventHoldReason>([
  "seat_taken",
  "hold_expired",
  "same_session",
  "price_up_needs_payment",
  "needs_approval",
  "channel_unavailable",
  "conflict",
  "not_found",
  "wrong_tenant",
  "not_open",
  "invalid",
]);

function mapReason(reason: string | undefined): EventHoldReason {
  if (reason && REASONS.has(reason as EventHoldReason)) return reason as EventHoldReason;
  return "unavailable";
}

async function call(
  admin: VenueAdmin,
  fn: string,
  args: Record<string, unknown>,
): Promise<{ ok: true; payload: Record<string, unknown> } | { ok: false; reason: EventHoldReason }> {
  if (typeof admin.rpc !== "function") return { ok: false, reason: "unavailable" };
  const { data, error } = await admin.rpc(fn, args);
  if (error) {
    logServerError(`venues.${fn}`, error);
    return { ok: false, reason: "unavailable" };
  }
  const reply = (data ?? {}) as Record<string, unknown>;
  if (reply.ok === true) return { ok: true, payload: reply };
  return { ok: false, reason: mapReason(typeof reply.reason === "string" ? reply.reason : undefined) };
}

export async function admissionHoldSeats(
  admin: VenueAdmin,
  input: {
    tenantId: string;
    sessionId: string;
    seatIds: string[];
    guestSessionId?: string | null;
    ttlSeconds?: number;
    operationKey: string;
  },
) {
  if (input.operationKey.trim().length < 8 || input.seatIds.length < 1) {
    return { ok: false as const, reason: "invalid" as const };
  }
  const r = await call(admin, "admission_hold_seats", {
    p_tenant_id: input.tenantId,
    p_session_id: input.sessionId,
    p_seat_ids: input.seatIds,
    p_guest_session_id: input.guestSessionId ?? null,
    p_ttl_s: input.ttlSeconds ?? 180,
    p_operation_key: input.operationKey.trim(),
  });
  if (!r.ok) return r;
  const ids = Array.isArray(r.payload.ids) ? (r.payload.ids as unknown[]).map(String) : [];
  return {
    ok: true as const,
    id: String(r.payload.id ?? ids[0] ?? ""),
    /** Every hold row this call owns, one per seat. The purchase consumes them all. */
    ids: ids.length > 0 ? ids : [String(r.payload.id ?? "")].filter(Boolean),
    expiresAt: String(r.payload.expires_at ?? ""),
    already: r.payload.already === true,
  };
}

/**
 * Bind live seat holds to the purchase that pays for them (migration
 * 20261231238000). Refuses `hold_expired` when any hold lapsed, `seat_taken`
 * when another order already owns one, `not_open` when the order is closed.
 * All or nothing: a refusal binds no seat.
 */
export async function admissionHoldConsume(
  admin: VenueAdmin,
  input: { tenantId: string; holdIds: string[]; orderId: string },
) {
  if (input.holdIds.length < 1 || input.holdIds.length > 40) {
    return { ok: false as const, reason: "invalid" as const };
  }
  const r = await call(admin, "admission_hold_consume", {
    p_tenant_id: input.tenantId,
    p_hold_ids: input.holdIds,
    p_order_id: input.orderId,
  });
  if (!r.ok) return r;
  return {
    ok: true as const,
    converted: Array.isArray(r.payload.converted) ? (r.payload.converted as unknown[]).map(String) : [],
    already: r.payload.already === true,
    expiresAt: typeof r.payload.expires_at === "string" ? r.payload.expires_at : null,
  };
}

export async function admissionExchange(
  admin: VenueAdmin,
  input: {
    tenantId: string;
    admissionId: string;
    toSessionId: string;
    operationKey: string;
    expectedVersion?: number;
  },
) {
  if (input.operationKey.trim().length < 8) return { ok: false as const, reason: "invalid" as const };
  const r = await call(admin, "admission_exchange", {
    p_tenant_id: input.tenantId,
    p_admission_id: input.admissionId,
    p_to_session_id: input.toSessionId,
    p_operation_key: input.operationKey.trim(),
    p_expected_version: input.expectedVersion ?? null,
  });
  if (!r.ok) {
    if (r.reason === "price_up_needs_payment") return r;
    return r;
  }
  return {
    ok: true as const,
    id: String(r.payload.id ?? input.admissionId),
    version: Number(r.payload.version) || undefined,
    deltaCents: Number(r.payload.delta_cents) || 0,
  };
}

export async function admissionComp(
  admin: VenueAdmin,
  input: {
    tenantId: string;
    sessionId: string;
    tierVariantId: string;
    holderName: string;
    holderEmail?: string | null;
    reason: string;
    approver?: string | null;
    actorRole?: string | null;
    operationKey: string;
    /**
     * The holder as a customer of this workspace, when the door resolved one
     * from the email (D-142). The comp's paid order carries it; without one
     * the order is a guest sale with its receipt code.
     */
    customerId?: string | null;
  },
) {
  if (input.operationKey.trim().length < 8 || input.holderName.trim().length < 1) {
    return { ok: false as const, reason: "invalid" as const };
  }
  const r = await call(admin, "admission_comp", {
    p_tenant_id: input.tenantId,
    p_session_id: input.sessionId,
    p_tier_variant_id: input.tierVariantId,
    p_holder_name: input.holderName.trim(),
    p_holder_email: input.holderEmail ?? null,
    p_reason: input.reason,
    p_approver: input.approver ?? null,
    p_actor_role: input.actorRole ?? "editor",
    p_operation_key: input.operationKey.trim(),
    p_customer_id: input.customerId ?? null,
  });
  if (!r.ok) return r;
  return {
    ok: true as const,
    id: String(r.payload.id ?? ""),
    orderId: String(r.payload.order_id ?? ""),
    receiptCode: typeof r.payload.receipt_code === "string" ? r.payload.receipt_code : null,
  };
}

export async function admissionDeliver(
  admin: VenueAdmin,
  input: { tenantId: string; admissionId: string; method: "email" | "sms" | "print" | "wallet" },
) {
  if (input.method === "sms" || input.method === "wallet") {
    return { ok: false as const, reason: "channel_unavailable" as const };
  }
  if (typeof admin.from !== "function") return { ok: false as const, reason: "unavailable" as const };
  const { data, error } = await admin
    .from("admissions")
    .select("id, holder_email, holder_name, tenant_id")
    .eq("id", input.admissionId)
    .eq("tenant_id", input.tenantId)
    .maybeSingle();
  if (error) {
    logServerError("venues.admissionDeliver", error);
    return { ok: false as const, reason: "unavailable" as const };
  }
  const row = data as { id: string; holder_email: string | null } | null;
  if (!row) return { ok: false as const, reason: "not_found" as const };
  let sentAt: string | null = null;
  let providerRef: string | null = null;
  if (input.method === "email") {
    const email = row.holder_email?.trim();
    if (!email) return { ok: false as const, reason: "channel_unavailable" as const };
    // The real ticket mail (QR, code, /ticket link), forced: the desk is
    // re-sending on purpose. It stamps `delivery` itself.
    const delivered = await deliverTicketForAdmission(admin, {
      tenantId: input.tenantId,
      admissionId: input.admissionId,
      force: true,
    });
    if (!delivered.ok) return { ok: false as const, reason: "channel_unavailable" as const };
    sentAt = new Date().toISOString();
    providerRef = "email";
  } else {
    sentAt = new Date().toISOString();
  }
  const { error: upErr } = await admin
    .from("admissions")
    .update({ delivery: { method: input.method, sent_at: sentAt, provider_ref: providerRef } })
    .eq("id", row.id);
  if (upErr) return { ok: false as const, reason: "unavailable" as const };
  return { ok: true as const, id: row.id, method: input.method };
}

export async function reapAdmissionHolds(
  admin: VenueAdmin,
  limit = 50,
): Promise<{ ok: true; released: number } | { ok: false }> {
  if (typeof admin.rpc !== "function") return { ok: false };
  const { data, error } = await admin.rpc("admission_hold_reap", { p_limit: limit });
  if (error) {
    logServerError("venues.reapAdmissionHolds", error);
    return { ok: false };
  }
  const reply = (data ?? {}) as { ok?: boolean; released?: number };
  if (reply.ok !== true) return { ok: false };
  return { ok: true, released: Number(reply.released) || 0 };
}

export async function eventSeatMapUpsert(
  admin: VenueAdmin,
  input: { tenantId: string; sessionId: string; layoutId: string },
) {
  const r = await call(admin, "event_seat_map_upsert", {
    p_tenant_id: input.tenantId,
    p_session_id: input.sessionId,
    p_layout_id: input.layoutId,
  });
  if (!r.ok) return r;
  return { ok: true as const, id: String(r.payload.id ?? "") };
}

export async function eventSeriesUpsert(
  admin: VenueAdmin,
  input: { tenantId: string; id?: string; name: string },
) {
  if (input.name.trim().length < 1) return { ok: false as const, reason: "invalid" as const };
  const r = await call(admin, "event_series_upsert", {
    p_tenant_id: input.tenantId,
    p_id: input.id ?? null,
    p_name: input.name.trim(),
  });
  if (!r.ok) return r;
  return { ok: true as const, id: String(r.payload.id ?? "") };
}
