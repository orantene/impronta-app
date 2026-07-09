/**
 * booking_fulfillment — product-order shipment lifecycle.
 *
 * A product booking (`agency_bookings.booking_sub_type='product'`) carries a
 * one-to-one fulfillment row tracking how the physical/digital item reaches the
 * client. The money rule: a product payout NEVER releases before the item is
 * handed off (`shipped_at` set) — enforced by `isProductPayoutDeferred`, which
 * `executeBookingTransfers` consults before fanning out any transfer.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

export type FulfillmentStatus =
  | "pending"
  | "preparing"
  | "ready_for_pickup"
  | "shipped"
  | "delivered"
  | "picked_up"
  | "downloaded"
  | "returned"
  | "completed";

export const FULFILLMENT_STATUSES: readonly FulfillmentStatus[] = [
  "pending",
  "preparing",
  "ready_for_pickup",
  "shipped",
  "delivered",
  "picked_up",
  "downloaded",
  "returned",
  "completed",
];

/**
 * States that count as "handed off to the client" — reaching any of these
 * stamps `shipped_at` (the payout-release signal). `returned` is NOT here: a
 * returned item must not release the payout.
 */
export const HANDED_OFF_STATES: readonly FulfillmentStatus[] = [
  "shipped",
  "delivered",
  "picked_up",
  "downloaded",
  "completed",
];

type Sb = SupabaseClient<Database>;

/**
 * True when a booking is a product that has NOT yet shipped — i.e. its payout
 * must be deferred. Service/package bookings are never deferred. A product
 * whose fulfillment row has a `shipped_at` releases normally.
 */
export async function isProductPayoutDeferred(sb: Sb, bookingId: string): Promise<boolean> {
  const { data: bk, error } = await sb
    .from("agency_bookings")
    .select("booking_sub_type")
    .eq("id", bookingId)
    .maybeSingle();
  if (error) {
    // Fail CLOSED on a lookup error for money safety: defer rather than risk
    // paying out a product that may not have shipped.
    logServerError("fulfillment.isDeferred/booking", error);
    return true;
  }
  if (!bk || bk.booking_sub_type !== "product") return false;

  const { data: ful, error: fErr } = await sb
    .from("booking_fulfillment")
    .select("shipped_at")
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (fErr) {
    logServerError("fulfillment.isDeferred/fulfillment", fErr);
    return true;
  }
  return !ful?.shipped_at;
}

/** Ensure a fulfillment row exists for a product booking; returns nothing. */
export async function ensureFulfillmentRow(
  sb: Sb,
  bookingId: string,
  tenantId: string | null,
  fulfillmentType: "shipment" | "pickup" | "digital" | "service" = "shipment",
): Promise<void> {
  const { error } = await sb
    .from("booking_fulfillment")
    .upsert(
      { booking_id: bookingId, tenant_id: tenantId, fulfillment_type: fulfillmentType },
      { onConflict: "booking_id", ignoreDuplicates: true },
    );
  if (error) logServerError("fulfillment.ensureRow", error);
}

export type FulfillmentPatch = {
  status?: FulfillmentStatus;
  carrier?: string | null;
  trackingNumber?: string | null;
  notes?: string | null;
};

/**
 * Upsert a booking's fulfillment row with a status/tracking patch. When the
 * status reaches a handed-off state, stamps `shipped_at` (once) — the payout
 * gate reads that. `delivered` also stamps `delivered_at`. Returns the row's
 * resulting `shipped_at` (or null) so callers can decide whether to re-run
 * transfers.
 */
export async function upsertBookingFulfillment(
  sb: Sb,
  bookingId: string,
  tenantId: string | null,
  patch: FulfillmentPatch,
): Promise<{ ok: boolean; shippedAt: string | null; error?: string }> {
  const nowIso = new Date().toISOString();
  const { data: existing } = await sb
    .from("booking_fulfillment")
    .select("shipped_at, delivered_at")
    .eq("booking_id", bookingId)
    .maybeSingle();

  const handedOff = patch.status ? HANDED_OFF_STATES.includes(patch.status) : false;
  const row: Record<string, unknown> = {
    booking_id: bookingId,
    tenant_id: tenantId,
    updated_at: nowIso,
  };
  if (patch.status) row.status = patch.status;
  if (patch.carrier !== undefined) row.carrier = patch.carrier;
  if (patch.trackingNumber !== undefined) row.tracking_number = patch.trackingNumber;
  if (patch.notes !== undefined) row.notes = patch.notes;
  // Stamp shipped_at once, when first handed off.
  const shippedAt = existing?.shipped_at ?? (handedOff ? nowIso : null);
  row.shipped_at = shippedAt;
  if (patch.status === "delivered" && !existing?.delivered_at) row.delivered_at = nowIso;

  const { error } = await sb
    .from("booking_fulfillment")
    .upsert(row as never, { onConflict: "booking_id" });
  if (error) {
    logServerError("fulfillment.upsert", error);
    return { ok: false, shippedAt: existing?.shipped_at ?? null, error: error.message };
  }
  return { ok: true, shippedAt };
}

/** Service-role convenience wrapper (used by tests + the fulfillment action). */
export function serviceClient(): Sb | null {
  return createServiceRoleClient();
}

// ── Action result / row shapes (kept here, NOT in the "use server" file) ──────

export type MarkFulfillmentResult = { ok: true; shipped: boolean } | { ok: false; error: string };

export type TalentOrderRow = {
  bookingId: string;
  title: string;
  status: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  shippedAt: string | null;
  trackingNumber: string | null;
  createdAt: string;
};
