"use server";

/**
 * Talent product-order fulfillment actions (owner-or-staff).
 *
 * A talent marks their OWN product order shipped/completed; tenant-scoped staff
 * may act on their behalf (mirrors offerings-actions authorization, but keyed on
 * the BOOKING's talent instead of a profile). Marking a product handed off
 * stamps booking_fulfillment.shipped_at and re-invokes executeBookingTransfers
 * for the booking's settled transaction(s) — the deferred product payout is
 * released only now, on hand-off.
 */

import { revalidatePath } from "next/cache";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { requireStaffTenantAction } from "@/lib/saas/admin-scope";
import { logServerError } from "@/lib/server/safe-error";
import {
  upsertBookingFulfillment,
  HANDED_OFF_STATES,
  FULFILLMENT_STATUSES,
  type FulfillmentStatus,
  type MarkFulfillmentResult,
  type TalentOrderRow,
} from "@/lib/bookings/fulfillment";
import { executeBookingTransfers } from "@/lib/payments/transfers";

type BookingAuth =
  | { ok: true; tenantId: string | null; talentProfileId: string | null }
  | { ok: false; error: string };

async function authorizeForBooking(bookingId: string): Promise<BookingAuth> {
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false, error: "Not authenticated." };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  const { data: booking, error: bErr } = await admin
    .from("agency_bookings")
    .select("id, tenant_id")
    .eq("id", bookingId)
    .maybeSingle();
  if (bErr || !booking) return { ok: false, error: "Order not found." };

  // The product booking's talent (products are single-talent).
  const { data: bt } = await admin
    .from("booking_talent")
    .select("talent_profile_id")
    .eq("booking_id", bookingId)
    .not("talent_profile_id", "is", null)
    .limit(1)
    .maybeSingle();
  const talentProfileId = (bt?.talent_profile_id as string | null) ?? null;

  // Owner path: the booking's talent marking their own order.
  if (talentProfileId) {
    const { data: tp } = await admin
      .from("talent_profiles")
      .select("user_id")
      .eq("id", talentProfileId)
      .maybeSingle();
    if (tp?.user_id && tp.user_id === session.user.id) {
      return { ok: true, tenantId: booking.tenant_id ?? null, talentProfileId };
    }
  }

  // Staff path: tenant-scoped staff of the booking's tenant.
  const staff = await requireStaffTenantAction();
  if (!staff.ok || staff.tenantId !== booking.tenant_id) return { ok: false, error: "Forbidden." };
  return { ok: true, tenantId: booking.tenant_id ?? null, talentProfileId };
}

/**
 * Set a product order's fulfillment status (+ optional carrier/tracking). When
 * the status reaches a handed-off state, releases the deferred product payout.
 */
export async function markBookingFulfillment(
  bookingId: string,
  input: { status: FulfillmentStatus; carrier?: string | null; trackingNumber?: string | null; notes?: string | null },
): Promise<MarkFulfillmentResult> {
  try {
    if (!FULFILLMENT_STATUSES.includes(input.status)) return { ok: false, error: "Unknown status." };
    const auth = await authorizeForBooking(bookingId);
    if (!auth.ok) return { ok: false, error: auth.error };

    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, error: "Server configuration error." };

    const res = await upsertBookingFulfillment(admin, bookingId, auth.tenantId, {
      status: input.status,
      carrier: input.carrier ?? null,
      trackingNumber: input.trackingNumber ?? null,
      notes: input.notes ?? null,
    });
    if (!res.ok) return { ok: false, error: res.error ?? "Could not save." };

    const handedOff = HANDED_OFF_STATES.includes(input.status);
    // Release the deferred payout: re-run transfers for every settled txn on
    // this booking now that shipped_at is set. Best-effort (idempotent).
    if (handedOff && res.shippedAt) {
      const { data: txns } = await admin
        .from("booking_transactions")
        .select("id, status")
        .eq("booking_id", bookingId)
        .in("status", ["paid", "payout_pending", "payout_sent"]);
      for (const t of txns ?? []) {
        try {
          await executeBookingTransfers((t as { id: string }).id);
        } catch (err) {
          logServerError("fulfillment.markShipped.transfers", err);
        }
      }
    }

    if (auth.tenantId) revalidatePath(`/${auth.tenantId}`, "layout");
    return { ok: true, shipped: handedOff };
  } catch (err) {
    logServerError("markBookingFulfillment", err);
    return { ok: false, error: "Unexpected error." };
  }
}

/** Product bookings for a talent's Orders queue (owner-or-staff). */
export async function loadTalentOrders(talentProfileId: string): Promise<TalentOrderRow[]> {
  try {
    const session = await getCachedActorSession();
    if (!session.user) return [];
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];

    // Authorize: owner of this profile OR tenant-scoped staff.
    const { data: tp } = await supabase
      .from("talent_profiles")
      .select("user_id")
      .eq("id", talentProfileId)
      .maybeSingle();
    const isOwner = tp?.user_id === session.user.id;
    if (!isOwner) {
      const staff = await requireStaffTenantAction();
      if (!staff.ok) return [];
    }

    const admin = createServiceRoleClient();
    if (!admin) return [];
    const { data: links } = await admin
      .from("booking_talent")
      .select("booking_id")
      .eq("talent_profile_id", talentProfileId);
    const bookingIds = [...new Set((links ?? []).map((l) => (l as { booking_id: string }).booking_id))];
    if (bookingIds.length === 0) return [];

    const { data: bookings } = await admin
      .from("agency_bookings")
      .select("id, title, status, payment_status, created_at, booking_sub_type, source_inquiry_id")
      .in("id", bookingIds)
      .eq("booking_sub_type", "product")
      .order("created_at", { ascending: false });
    const rows = (bookings ?? []) as {
      id: string; title: string; status: string; payment_status: string; created_at: string;
      source_inquiry_id: string | null;
    }[];
    if (rows.length === 0) return [];

    // Prefer WHAT was ordered (the offering title on the source inquiry) over
    // the generic booking title ("<client> — booking") — the talent needs to
    // know what to ship, not who booked.
    const inquiryIdsForTitle = [...new Set(rows.map((r) => r.source_inquiry_id).filter(Boolean) as string[])];
    const offeringTitleByInquiry = new Map<string, string>();
    if (inquiryIdsForTitle.length) {
      const { data: inqs } = await admin
        .from("inquiries")
        .select("id, source_context")
        .in("id", inquiryIdsForTitle);
      for (const r of inqs ?? []) {
        const off = (r as { source_context?: { offering?: { title?: unknown; quantity?: unknown } } }).source_context?.offering;
        if (off && typeof off.title === "string" && off.title.trim()) {
          const qty = typeof off.quantity === "number" && off.quantity > 1 ? ` × ${off.quantity}` : "";
          offeringTitleByInquiry.set((r as { id: string }).id, `${off.title.trim()}${qty}`);
        }
      }
    }

    const { data: fuls } = await admin
      .from("booking_fulfillment")
      .select("booking_id, status, shipped_at, tracking_number")
      .in("booking_id", rows.map((r) => r.id));
    const fulByBooking = new Map<string, { status: string; shipped_at: string | null; tracking_number: string | null }>();
    for (const f of fuls ?? []) {
      const row = f as { booking_id: string; status: string; shipped_at: string | null; tracking_number: string | null };
      fulByBooking.set(row.booking_id, row);
    }

    return rows.map((r) => {
      const f = fulByBooking.get(r.id);
      return {
        bookingId: r.id,
        title: (r.source_inquiry_id && offeringTitleByInquiry.get(r.source_inquiry_id)) || r.title,
        status: r.status,
        paymentStatus: r.payment_status,
        fulfillmentStatus: f?.status ?? "pending",
        shippedAt: f?.shipped_at ?? null,
        trackingNumber: f?.tracking_number ?? null,
        createdAt: r.created_at,
      };
    });
  } catch (err) {
    logServerError("loadTalentOrders", err);
    return [];
  }
}
