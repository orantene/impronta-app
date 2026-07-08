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
import {
  requireClient,
  requireSession,
  requireTalent,
} from "@/lib/server/action-guards";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { emitNotificationToUsers } from "@/lib/notifications/emit";
import type {
  ReviewableBooking,
  ReviewableCounterparty,
  ReviewSubjectKind,
} from "./review-types";
import {
  canReportReview,
  isBookingReviewable,
  isValidRating,
} from "./review-eligibility";

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

// ===========================================================================
// Two-sided reviews (W8): talent → client direction + report + admin hide.
// ===========================================================================

type ClientReviewExistingRow = {
  booking_id: string | null;
  client_user_id: string;
  rating: number;
  body: string | null;
};

/**
 * The caller-talent's talent_profile ids. talent_profiles are tenant-agnostic
 * (a profile joins a tenant via the roster), so we resolve by user_id only;
 * tenant scoping happens via the booking (booking.tenant_id + booking_talent).
 */
async function callerTalentProfileIds(
  supabase: SupabaseClient,
  userId: string,
): Promise<string[]> {
  const { data } = await supabase
    .from("talent_profiles")
    .select("id")
    .eq("user_id", userId)
    .returns<{ id: string }[]>();
  return (data ?? []).map((r) => r.id);
}

/**
 * Submit (or edit) a TALENT's review of the CLIENT on a completed booking.
 * Caller must be a talent on the booking (booking_talent.talent_profile_id ∈ the
 * caller's talent_profiles) + the booking must be reviewable.
 */
export async function submitClientReviewAction(
  tenantSlug: string,
  bookingId: string,
  clientUserId: string,
  rating: number,
  body: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireTalent();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, user } = auth;

  const cleanBookingId = (bookingId ?? "").trim();
  const cleanClientId = (clientUserId ?? "").trim();
  if (!cleanBookingId || !cleanClientId) {
    return { ok: false, error: "Missing booking or client." };
  }

  const r = Math.round(Number(rating));
  if (!isValidRating(r)) {
    return { ok: false, error: "Rating must be between 1 and 5." };
  }
  const cleanBody = (body ?? "").trim().slice(0, 4000);

  const tenantId = await resolveTenantId(supabase, tenantSlug);
  if (!tenantId) return { ok: false, error: "Unknown workspace." };

  // Load the booking. (RLS may not scope agency_bookings to a talent, so we
  // verify everything explicitly below: talent-on-booking + reviewable.)
  const { data: bookingData, error: bookingErr } = await supabase
    .from("agency_bookings")
    .select(
      "id, tenant_id, client_user_id, source_inquiry_id, status, payment_status, event_date, starts_at, ends_at, title",
    )
    .eq("id", cleanBookingId)
    .maybeSingle()
    .returns<BookingRow>();

  if (bookingErr) {
    logServerError("reviews/client/submit/booking", bookingErr);
    return { ok: false, error: CLIENT_ERROR.update };
  }
  const booking = bookingData as BookingRow | null;
  if (!booking || booking.tenant_id !== tenantId) {
    return { ok: false, error: "Booking not found." };
  }

  if (!bookingReviewable(booking)) {
    return {
      ok: false,
      error: "You can review once the booking is completed.",
    };
  }

  // The caller must be a talent on this booking.
  const myProfileIds = await callerTalentProfileIds(supabase, user.id);
  if (myProfileIds.length === 0) {
    return { ok: false, error: "No talent profile in this workspace." };
  }
  const { data: bt } = await supabase
    .from("booking_talent")
    .select("booking_id, talent_profile_id, talent_name_snapshot")
    .eq("booking_id", cleanBookingId)
    .in("talent_profile_id", myProfileIds)
    .returns<BookingTalentRow[]>();
  const myBookingProfile = (bt ?? []).find((row) => row.talent_profile_id);
  if (!myBookingProfile?.talent_profile_id) {
    return { ok: false, error: "You weren't on this booking." };
  }

  // The client must actually be the booking's client (direct, or via inquiry).
  let clientMatches = booking.client_user_id === cleanClientId;
  if (!clientMatches && booking.source_inquiry_id) {
    const { data: inq } = await supabase
      .from("inquiries")
      .select("client_user_id")
      .eq("id", booking.source_inquiry_id)
      .maybeSingle();
    clientMatches =
      (inq as { client_user_id: string | null } | null)?.client_user_id ===
      cleanClientId;
  }
  if (!clientMatches) {
    return { ok: false, error: "That client isn't on this booking." };
  }

  const { error: upsertErr } = await supabase
    .from("client_reviews")
    .upsert(
      {
        tenant_id: tenantId,
        booking_id: cleanBookingId,
        author_user_id: user.id,
        author_talent_profile_id: myBookingProfile.talent_profile_id,
        client_user_id: cleanClientId,
        rating: r,
        body: cleanBody || null,
        status: "published",
      },
      { onConflict: "booking_id,author_user_id,client_user_id" },
    );

  if (upsertErr) {
    logServerError("reviews/client/submit/upsert", upsertErr);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  return { ok: true };
}

/**
 * The caller-talent's reviewable bookings in this tenant, each with the
 * counterparty client + any existing client review by this talent.
 */
export async function loadClientReviewablesAction(
  tenantSlug: string,
): Promise<ReviewableCounterparty[]> {
  const auth = await requireTalent();
  if (!auth.ok) return [];
  const { supabase, user } = auth;

  const tenantId = await resolveTenantId(supabase, tenantSlug);
  if (!tenantId) return [];

  const myProfileIds = await callerTalentProfileIds(supabase, user.id);
  if (myProfileIds.length === 0) return [];

  // Bookings this talent is on.
  const { data: myBookingTalent } = await supabase
    .from("booking_talent")
    .select("booking_id, talent_profile_id, talent_name_snapshot")
    .in("talent_profile_id", myProfileIds)
    .returns<BookingTalentRow[]>();
  const bookingIds = Array.from(
    new Set((myBookingTalent ?? []).map((r) => r.booking_id).filter(Boolean)),
  );
  if (bookingIds.length === 0) return [];

  const { data: bookingData } = await supabase
    .from("agency_bookings")
    .select(
      "id, tenant_id, client_user_id, source_inquiry_id, status, payment_status, event_date, starts_at, ends_at, title",
    )
    .in("id", bookingIds)
    .eq("tenant_id", tenantId)
    .order("event_date", { ascending: false })
    .returns<BookingRow[]>();

  const reviewable = (bookingData ?? []).filter(bookingReviewable);
  if (reviewable.length === 0) return [];

  // Resolve each booking's client id (direct, or via source inquiry).
  const inquiryIds = Array.from(
    new Set(
      reviewable
        .filter((b) => !b.client_user_id && b.source_inquiry_id)
        .map((b) => b.source_inquiry_id as string),
    ),
  );
  const inquiryClientById = new Map<string, string | null>();
  if (inquiryIds.length > 0) {
    const { data: inqs } = await supabase
      .from("inquiries")
      .select("id, client_user_id")
      .in("id", inquiryIds)
      .returns<{ id: string; client_user_id: string | null }[]>();
    for (const i of inqs ?? []) inquiryClientById.set(i.id, i.client_user_id);
  }

  // Existing client reviews this talent already wrote.
  const reviewableIds = reviewable.map((b) => b.id);
  const { data: existing } = await supabase
    .from("client_reviews")
    .select("booking_id, client_user_id, rating, body")
    .in("booking_id", reviewableIds)
    .eq("author_user_id", user.id)
    .returns<ClientReviewExistingRow[]>();
  const existingByBooking = new Map<
    string,
    { rating: number; body: string | null }
  >();
  for (const e of existing ?? []) {
    if (e.booking_id) {
      existingByBooking.set(e.booking_id, { rating: e.rating, body: e.body });
    }
  }

  // Resolve client first-names via the read helpers' service path is in
  // load-reviews; here keep it simple — names null (UI can fetch separately).
  const clientNames = await resolveClientNames(
    reviewable.map((b) =>
      b.client_user_id ??
      (b.source_inquiry_id
        ? inquiryClientById.get(b.source_inquiry_id) ?? null
        : null),
    ),
  );

  const out: ReviewableCounterparty[] = [];
  for (const b of reviewable) {
    const clientId =
      b.client_user_id ??
      (b.source_inquiry_id
        ? inquiryClientById.get(b.source_inquiry_id) ?? null
        : null);
    if (!clientId) continue;
    out.push({
      bookingId: b.id,
      clientUserId: clientId,
      clientName: clientNames.get(clientId) ?? null,
      eventTitle: b.title,
      eventDate: b.event_date,
      existingReview: existingByBooking.get(b.id) ?? null,
    });
  }
  return out;
}

/** Resolve public-safe first names for client user ids via service role. */
async function resolveClientNames(
  ids: Array<string | null>,
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const clean = Array.from(new Set(ids.filter((x): x is string => !!x)));
  if (clean.length === 0) return out;
  const svc = createServiceRoleClient();
  if (!svc) return out;
  try {
    const { data } = await svc
      .from("profiles")
      .select("id, display_name")
      .in("id", clean)
      .returns<{ id: string; display_name: string | null }[]>();
    for (const row of data ?? []) {
      const first = (row.display_name ?? "").trim().split(/\s+/)[0] || null;
      out.set(row.id, first);
    }
  } catch {
    // degrade to null names
  }
  return out;
}

/**
 * The SUBJECT of a review flags it for staff moderation (sets reported_at) and
 * notifies tenant staff.
 *   kind='talent' → a client→talent review; the reviewed talent reports it.
 *   kind='client' → a talent→client review; the reviewed client reports it.
 */
export async function reportReviewAction(
  kind: ReviewSubjectKind,
  reviewId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireSession();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, user } = auth;

  const cleanId = (reviewId ?? "").trim();
  if (!cleanId) return { ok: false, error: "Missing review." };

  const nowIso = new Date().toISOString();

  if (kind === "talent") {
    // Confirm the caller owns the reviewed talent profile.
    const { data: review } = await supabase
      .from("talent_reviews")
      .select("id, tenant_id, talent_profile_id")
      .eq("id", cleanId)
      .maybeSingle()
      .returns<{ id: string; tenant_id: string; talent_profile_id: string }>();
    const row = review as
      | { id: string; tenant_id: string; talent_profile_id: string }
      | null;
    if (!row) return { ok: false, error: "Review not found." };

    const { data: prof } = await supabase
      .from("talent_profiles")
      .select("user_id")
      .eq("id", row.talent_profile_id)
      .maybeSingle()
      .returns<{ user_id: string | null }>();
    const subjectUserId = (prof as { user_id: string | null } | null)?.user_id ?? null;

    if (
      !canReportReview({
        kind: "talent",
        callerUserId: user.id,
        subjectTalentUserId: subjectUserId,
      })
    ) {
      return { ok: false, error: "You can only report reviews about you." };
    }

    const { error } = await supabase
      .from("talent_reviews")
      .update({ reported_at: nowIso })
      .eq("id", cleanId);
    if (error) {
      logServerError("reviews/report/talent", error);
      return { ok: false, error: CLIENT_ERROR.update };
    }
    await notifyStaffOfReport(row.tenant_id, "talent", cleanId, user.id);
    return { ok: true };
  }

  // kind === 'client'
  const { data: review } = await supabase
    .from("client_reviews")
    .select("id, tenant_id, client_user_id")
    .eq("id", cleanId)
    .maybeSingle()
    .returns<{ id: string; tenant_id: string; client_user_id: string }>();
  const row = review as
    | { id: string; tenant_id: string; client_user_id: string }
    | null;
  if (!row) return { ok: false, error: "Review not found." };

  if (
    !canReportReview({
      kind: "client",
      callerUserId: user.id,
      subjectClientUserId: row.client_user_id,
    })
  ) {
    return { ok: false, error: "You can only report reviews about you." };
  }

  const { error } = await supabase
    .from("client_reviews")
    .update({ reported_at: nowIso })
    .eq("id", cleanId);
  if (error) {
    logServerError("reviews/report/client", error);
    return { ok: false, error: CLIENT_ERROR.update };
  }
  await notifyStaffOfReport(row.tenant_id, "client", cleanId, user.id);
  return { ok: true };
}

/** Best-effort: notify tenant staff that a review was reported. */
async function notifyStaffOfReport(
  tenantId: string,
  kind: ReviewSubjectKind,
  reviewId: string,
  reporterUserId: string,
): Promise<void> {
  try {
    const svc = createServiceRoleClient();
    if (!svc) return;
    const { data: staff } = await svc
      .from("agency_memberships")
      .select("profile_id")
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .in("role", ["owner", "admin"])
      .returns<{ profile_id: string | null }[]>();
    const staffIds = (staff ?? [])
      .map((s) => s.profile_id)
      .filter((x): x is string => !!x && x !== reporterUserId);
    if (staffIds.length === 0) return;
    await emitNotificationToUsers(staffIds, {
      tenantId,
      kind: "system",
      surface: "workspace",
      title: "A review was reported",
      body:
        kind === "talent"
          ? "A talent flagged a client review about them for moderation."
          : "A client flagged a talent review about them for moderation.",
      actorUserId: reporterUserId,
      targetDrawer: "reviews-moderation",
      targetPayload: { kind, reviewId },
      originKind: "review_reported",
    });
  } catch (err) {
    logServerError("reviews/report/notify", err);
  }
}

/**
 * Staff / platform admin hide or unhide a review (status='hidden'|'published').
 * Works for either direction.
 *
 * `reasonCode` is an optional moderation reason recorded on the audit trail; it
 * is additive and backward-compatible (existing callers that omit it still
 * work — it defaults to null).
 */
export async function adminHideReviewAction(
  kind: ReviewSubjectKind,
  reviewId: string,
  hidden: boolean,
  reasonCode?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireSession();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, user } = auth;

  const cleanId = (reviewId ?? "").trim();
  if (!cleanId) return { ok: false, error: "Missing review." };

  const table = kind === "talent" ? "talent_reviews" : "client_reviews";
  const nextStatus = hidden ? "hidden" : "published";

  // RLS gates the UPDATE to staff/platform for the row's tenant — a non-staff
  // caller updates 0 rows. We select tenant_id back so the moderation event is
  // filed against the row's tenant.
  const { data, error } = await supabase
    .from(table)
    .update({ status: nextStatus })
    .eq("id", cleanId)
    .select("id, tenant_id")
    .returns<{ id: string; tenant_id: string }[]>();

  if (error) {
    logServerError("reviews/admin-hide", error);
    return { ok: false, error: CLIENT_ERROR.update };
  }
  if (!data || data.length === 0) {
    return { ok: false, error: "Not authorized." };
  }

  // Record the moderation event for the audit trail. Best-effort and additive —
  // the hide/unhide already succeeded, so a failure here must not fail the
  // action. RLS on review_moderation_events allows the insert for staff of the
  // row's tenant (is_staff_of_tenant).
  const cleanReason = (reasonCode ?? "").trim() || null;
  const { error: auditErr } = await supabase
    .from("review_moderation_events")
    .insert({
      review_kind: kind,
      review_id: cleanId,
      tenant_id: data[0].tenant_id,
      actor_user_id: user.id,
      action: hidden ? "hide" : "unhide",
      reason_code: cleanReason,
    });
  if (auditErr) {
    logServerError("reviews/admin-hide/audit", auditErr);
  }

  return { ok: true };
}
