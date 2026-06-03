"use server";

/**
 * Client → talent review server actions.
 *
 * Policy (default, locked for this wave):
 *   - client → talent only; the caller must be the booking's client.
 *   - allowed when booking.status='completed' OR (payment_status='paid' AND the
 *     event end has passed).
 *   - one review per (booking, talent, client) — upsert/edit allowed.
 *   - published immediately.
 *
 * Per the "use server" rule this module exports ONLY async functions. Shared
 * types come from the plain ./review-types module. NEW tables/columns are read
 * with .returns<T>() (database.types.ts not regenerated this wave).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { requireClient } from "@/lib/server/action-guards";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import type { ReviewableBooking } from "./review-types";
import { isBookingReviewable, isValidRating } from "./review-eligibility";

type BookingRow = {
  id: string;
  tenant_id: string;
  client_user_id: string | null;
  source_inquiry_id: string | null;
  status: string;
  payment_status: string;
  event_date: string | null;
  starts_at: string | null;
  ends_at: string | null;
  title: string | null;
};

type BookingTalentRow = {
  booking_id: string;
  talent_profile_id: string | null;
  talent_name_snapshot: string | null;
};

type ExistingReviewRow = {
  booking_id: string | null;
  talent_profile_id: string;
  rating: number;
  body: string | null;
};

/** Adapts a DB booking row to the pure eligibility predicate. */
function bookingReviewable(b: BookingRow): boolean {
  return isBookingReviewable({
    status: b.status,
    paymentStatus: b.payment_status,
    endsAt: b.ends_at,
    eventDate: b.event_date,
  });
}

async function resolveTenantId(
  supabase: SupabaseClient,
  tenantSlug: string,
): Promise<string | null> {
  const slug = (tenantSlug ?? "").trim();
  if (!slug) return null;
  // agencies SELECT is staff-only under RLS; use the SECURITY DEFINER resolver
  // RPC (granted to authenticated) so a client session can map slug → tenant id.
  const { data } = await supabase.rpc("resolve_public_tenant_by_slug", {
    p_slug: slug,
  });
  const rows = (data ?? []) as Array<{ tenant_id: string; tenant_slug: string }>;
  return rows[0]?.tenant_id ?? null;
}

/**
 * Submit (or edit) a client's review of a talent on a completed booking.
 */
export async function submitTalentReviewAction(
  tenantSlug: string,
  bookingId: string,
  talentProfileId: string,
  rating: number,
  body: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireClient();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, user } = auth;

  const cleanBookingId = (bookingId ?? "").trim();
  const cleanTalentId = (talentProfileId ?? "").trim();
  if (!cleanBookingId || !cleanTalentId) {
    return { ok: false, error: "Missing booking or talent." };
  }

  const r = Math.round(Number(rating));
  if (!isValidRating(r)) {
    return { ok: false, error: "Rating must be between 1 and 5." };
  }

  const cleanBody = (body ?? "").trim().slice(0, 4000);

  const tenantId = await resolveTenantId(supabase, tenantSlug);
  if (!tenantId) return { ok: false, error: "Unknown workspace." };

  // Load the booking. RLS already restricts the client to their own bookings,
  // but we re-verify ownership + tenant explicitly for defence in depth.
  const { data: bookingData, error: bookingErr } = await supabase
    .from("agency_bookings")
    .select(
      "id, tenant_id, client_user_id, source_inquiry_id, status, payment_status, event_date, starts_at, ends_at, title",
    )
    .eq("id", cleanBookingId)
    .maybeSingle()
    .returns<BookingRow>();

  if (bookingErr) {
    logServerError("reviews/submit/booking", bookingErr);
    return { ok: false, error: CLIENT_ERROR.update };
  }
  const booking = bookingData as BookingRow | null;
  if (!booking || booking.tenant_id !== tenantId) {
    return { ok: false, error: "Booking not found." };
  }

  // Caller must be the booking's client (direct, or via the source inquiry).
  let isClient = booking.client_user_id === user.id;
  if (!isClient && booking.source_inquiry_id) {
    const { data: inq } = await supabase
      .from("inquiries")
      .select("client_user_id")
      .eq("id", booking.source_inquiry_id)
      .maybeSingle();
    isClient = (inq as { client_user_id: string | null } | null)?.client_user_id === user.id;
  }
  if (!isClient) {
    return { ok: false, error: "You can only review your own bookings." };
  }

  if (!bookingReviewable(booking)) {
    return {
      ok: false,
      error: "You can review once the booking is completed.",
    };
  }

  // The talent must actually be on this booking.
  const { data: bt } = await supabase
    .from("booking_talent")
    .select("booking_id, talent_profile_id, talent_name_snapshot")
    .eq("booking_id", cleanBookingId)
    .eq("talent_profile_id", cleanTalentId)
    .maybeSingle()
    .returns<BookingTalentRow>();
  if (!bt) {
    return { ok: false, error: "That talent isn't on this booking." };
  }

  // Upsert — one review per (booking, talent, client). RLS guarantees the row
  // is attributed to the caller (client_user_id = auth.uid()).
  const { error: upsertErr } = await supabase
    .from("talent_reviews")
    .upsert(
      {
        tenant_id: tenantId,
        talent_profile_id: cleanTalentId,
        booking_id: cleanBookingId,
        client_user_id: user.id,
        rating: r,
        body: cleanBody || null,
        status: "published",
      },
      { onConflict: "booking_id,talent_profile_id,client_user_id" },
    );

  if (upsertErr) {
    logServerError("reviews/submit/upsert", upsertErr);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  return { ok: true };
}

/**
 * The caller-client's reviewable bookings in this tenant, each with per-talent
 * review status (existing review surfaced for edit).
 */
export async function loadReviewableBookingsAction(
  tenantSlug: string,
): Promise<ReviewableBooking[]> {
  const auth = await requireClient();
  if (!auth.ok) return [];
  const { supabase, user } = auth;

  const tenantId = await resolveTenantId(supabase, tenantSlug);
  if (!tenantId) return [];

  // RLS scopes agency_bookings to the caller-client. Pull this tenant's rows.
  const { data: bookingData, error: bookingErr } = await supabase
    .from("agency_bookings")
    .select(
      "id, tenant_id, client_user_id, source_inquiry_id, status, payment_status, event_date, starts_at, ends_at, title",
    )
    .eq("tenant_id", tenantId)
    .order("event_date", { ascending: false })
    .returns<BookingRow[]>();

  if (bookingErr || !bookingData || bookingData.length === 0) return [];

  const reviewable = bookingData.filter(bookingReviewable);
  if (reviewable.length === 0) return [];

  const bookingIds = reviewable.map((b) => b.id);

  const { data: talents } = await supabase
    .from("booking_talent")
    .select("booking_id, talent_profile_id, talent_name_snapshot")
    .in("booking_id", bookingIds)
    .returns<BookingTalentRow[]>();

  const { data: existing } = await supabase
    .from("talent_reviews")
    .select("booking_id, talent_profile_id, rating, body")
    .in("booking_id", bookingIds)
    .eq("client_user_id", user.id)
    .returns<ExistingReviewRow[]>();

  const existingByKey = new Map<string, { rating: number; body: string | null }>();
  for (const e of existing ?? []) {
    existingByKey.set(`${e.booking_id}:${e.talent_profile_id}`, {
      rating: e.rating,
      body: e.body,
    });
  }

  const byId = new Map(reviewable.map((b) => [b.id, b] as const));
  const out: ReviewableBooking[] = [];
  for (const t of talents ?? []) {
    if (!t.talent_profile_id) continue;
    const b = byId.get(t.booking_id);
    if (!b) continue;
    out.push({
      bookingId: b.id,
      talentProfileId: t.talent_profile_id,
      talentName: t.talent_name_snapshot,
      eventTitle: b.title,
      eventDate: b.event_date,
      existingReview:
        existingByKey.get(`${b.id}:${t.talent_profile_id}`) ?? null,
    });
  }
  return out;
}
