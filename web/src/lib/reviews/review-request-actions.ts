"use server";

/**
 * Review-REQUEST server actions — a talent (or tenant staff acting as the
 * talent) asks a past client to leave a review.
 *
 * Policy (default, locked for this wave):
 *   - a talent invites a past client to review a completed booking. No
 *     pre-filled rating, no incentive (FTC — never offer cash/coupons for a
 *     review). The request is a nudge, not a review.
 *   - one request per (booking, client) — the DB enforces UNIQUE(booking_id,
 *     client_user_id); a duplicate returns a friendly message.
 *   - requested_by_user_id = the caller; status starts 'pending'.
 *
 * Auth/tenant-scope patterns mirror ./review-actions.ts exactly: requireTalent()
 * for the session, the resolve_public_tenant_by_slug SECURITY DEFINER RPC to map
 * a tenantSlug → tenant id, `.returns<T>()` reads (database.types.ts not
 * regenerated this wave), and the `{ ok: true } | { ok: false; error }` shape.
 * RLS on public.review_requests is authoritative — it lets tenant staff OR the
 * talent (talent_profiles.user_id = auth.uid()) insert/select their own rows.
 *
 * Per the "use server" rule this module exports ONLY async functions.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { requireTalent } from "@/lib/server/action-guards";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import { tenantReviewsEnabled } from "@/lib/reviews/reviews-entitlement";
import { getAppUrl } from "@/lib/auth-flow";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { dispatchEventNotifications } from "@/lib/notifications/dispatcher";

/** Postgres unique-violation SQLSTATE. */
const PG_UNIQUE_VIOLATION = "23505";

async function resolveTenantId(
  supabase: SupabaseClient,
  tenantSlug: string,
): Promise<string | null> {
  const slug = (tenantSlug ?? "").trim();
  if (!slug) return null;
  // agencies SELECT is staff-only under RLS; use the SECURITY DEFINER resolver
  // RPC (granted to authenticated) so a talent session can map slug → tenant id.
  const { data } = await supabase.rpc("resolve_public_tenant_by_slug", {
    p_slug: slug,
  });
  const rows = (data ?? []) as Array<{ tenant_id: string; tenant_slug: string }>;
  return rows[0]?.tenant_id ?? null;
}

/**
 * Fire the review-invite notification through the EXISTING engine.
 *
 * Not exported (the "use server" rule bars a non-async export, but a local
 * helper is fine). Resolves the talent display name + booking event context and
 * the single-use `/review/{token}` CTA, then dispatches `review.request_created`
 * — the `review.request_invite.client` catalog entry fans it out to the past
 * client (email + in-app when they have an account, email-only for a guest).
 *
 * Best-effort and fully swallowed: this runs after the request row is already
 * stored, so a notify failure must never surface to the caller.
 */
async function notifyReviewRequestCreated(params: {
  requestId: string;
  tenantId: string;
  talentProfileId: string;
  bookingId: string | null;
  clientUserId: string | null;
  invitedEmail: string | null;
  inviteToken: string | null;
}): Promise<void> {
  try {
    const admin = createServiceRoleClient();
    if (!admin) return;

    let talentName: string | null = null;
    const { data: talent } = await admin
      .from("talent_profiles")
      .select("display_name")
      .eq("id", params.talentProfileId)
      .maybeSingle();
    talentName = (talent as { display_name: string | null } | null)?.display_name ?? null;

    let eventTitle: string | null = null;
    let eventDate: string | null = null;
    if (params.bookingId) {
      const { data: booking } = await admin
        .from("agency_bookings")
        .select("title, event_date")
        .eq("id", params.bookingId)
        .maybeSingle();
      const b = booking as { title: string | null; event_date: string | null } | null;
      eventTitle = b?.title ?? null;
      eventDate = b?.event_date ?? null;
    }

    // The single-use token landing page (owned by the review-token route). No
    // token (unexpected) degrades to the branded home so the email still sends.
    const reviewUrl = params.inviteToken
      ? `${getAppUrl()}/review/${encodeURIComponent(params.inviteToken)}`
      : `${getAppUrl()}/`;

    await dispatchEventNotifications({
      type: "review.request_created",
      tenantId: params.tenantId,
      eventId: `review-invite:${params.requestId}`,
      payload: {
        clientUserId: params.clientUserId,
        invitedEmail: params.invitedEmail,
        talentName,
        eventTitle,
        eventDate,
        reviewUrl,
      },
    });
  } catch (err) {
    logServerError("reviews/request/notify", err);
  }
}

export type CreateReviewRequestInput = {
  tenantSlug: string;
  talentProfileId: string;
  bookingId: string;
  clientUserId?: string | null;
  invitedEmail?: string | null;
  message?: string | null;
};

/**
 * Create a pending review request. The caller (a talent, or staff acting for the
 * talent) asks a past client to review a completed booking. Either an in-app
 * clientUserId or an invitedEmail identifies who to ask. No rating, no incentive.
 */
export async function createReviewRequestAction(
  input: CreateReviewRequestInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireTalent();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, user } = auth;

  const cleanTalentId = (input.talentProfileId ?? "").trim();
  if (!cleanTalentId) {
    return { ok: false, error: "Missing talent." };
  }

  // booking_id is nullable (email-only invite has no booking attached yet); an
  // empty string would fail the UUID/FK cast, so normalize it to null.
  const cleanBookingId = (input.bookingId ?? "").trim() || null;
  const cleanClientId = (input.clientUserId ?? "").trim() || null;
  const cleanEmail = (input.invitedEmail ?? "").trim().toLowerCase() || null;
  if (!cleanClientId && !cleanEmail) {
    return { ok: false, error: "Add the client's email so we know who to ask." };
  }

  const cleanMessage = (input.message ?? "").trim().slice(0, 2000) || null;

  const tenantId = await resolveTenantId(supabase, input.tenantSlug);
  if (!tenantId) return { ok: false, error: "Unknown workspace." };

  // Reviews are a PREMIUM capability, gated on the surface tenant's entitlement.
  // A non-entitled workspace cannot file review requests. Fails closed.
  if (!(await tenantReviewsEnabled(tenantId))) {
    return { ok: false, error: "Reviews are not enabled on this workspace." };
  }

  // Insert the pending request. RLS lets the talent (talent_profiles.user_id =
  // auth.uid()) or tenant staff insert their own rows; a non-owner insert is
  // rejected by the policy, not by this app-layer code. We select the row back
  // so we have the id + single-use invite_token for the review-invite email.
  const { data: created, error } = await supabase
    .from("review_requests")
    .insert({
      tenant_id: tenantId,
      talent_profile_id: cleanTalentId,
      booking_id: cleanBookingId,
      client_user_id: cleanClientId,
      invited_email: cleanEmail,
      message: cleanMessage,
      status: "pending",
      requested_by_user_id: user.id,
    })
    .select("id, invite_token")
    .maybeSingle()
    .returns<{ id: string; invite_token: string | null }>();

  if (error) {
    // UNIQUE(booking_id, client_user_id) — a request already exists.
    if (error.code === PG_UNIQUE_VIOLATION) {
      return {
        ok: false,
        error: "A request already exists for this client and booking.",
      };
    }
    logServerError("reviews/request/create", error);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  // Fire the review-invite email through the EXISTING notification engine (the
  // dispatcher honors email_suppressions, the `reviews` category preference,
  // unsubscribe headers, and localized copy). Best-effort: a notify failure must
  // never fail the request the caller just created.
  const inviteRow = created as { id: string; invite_token: string | null } | null;
  if (inviteRow?.id) {
    await notifyReviewRequestCreated({
      requestId: inviteRow.id,
      tenantId,
      talentProfileId: cleanTalentId,
      bookingId: cleanBookingId,
      clientUserId: cleanClientId,
      invitedEmail: cleanEmail,
      inviteToken: inviteRow.invite_token,
    });
  }

  return { ok: true };
}

export type ReviewRequestSummary = {
  id: string;
  bookingId: string | null;
  clientUserId: string | null;
  invitedEmail: string | null;
  status: string;
  createdAt: string;
};

type ReviewRequestRow = {
  id: string;
  booking_id: string | null;
  client_user_id: string | null;
  invited_email: string | null;
  status: string;
  created_at: string;
};

/**
 * The talent's existing review requests (so the UI can show what was already
 * asked, and avoid re-asking). RLS scopes the read to the caller's own rows.
 */
export async function loadReviewRequestsForOwnerAction(
  tenantSlug: string,
  talentProfileId: string,
): Promise<ReviewRequestSummary[]> {
  const auth = await requireTalent();
  if (!auth.ok) return [];
  const { supabase } = auth;

  const cleanTalentId = (talentProfileId ?? "").trim();
  if (!cleanTalentId) return [];

  const tenantId = await resolveTenantId(supabase, tenantSlug);
  if (!tenantId) return [];

  const { data, error } = await supabase
    .from("review_requests")
    .select("id, booking_id, client_user_id, invited_email, status, created_at")
    .eq("tenant_id", tenantId)
    .eq("talent_profile_id", cleanTalentId)
    .order("created_at", { ascending: false })
    .returns<ReviewRequestRow[]>();

  if (error) {
    logServerError("reviews/request/load", error);
    return [];
  }

  return (data ?? []).map((r) => ({
    id: r.id,
    bookingId: r.booking_id,
    clientUserId: r.client_user_id,
    invitedEmail: r.invited_email,
    status: r.status,
    createdAt: r.created_at,
  }));
}

/**
 * Whether the review (STANDING) capability is enabled for a workspace, addressed
 * by slug. A thin "use server" bridge over tenantReviewsEnabled so CLIENT shell
 * surfaces (the talent Reviews page, the admin profile-reviews drawer) can read
 * the premium gate — they cannot import the plain server helper directly.
 *
 * Resolves slug → tenant id via the same session-scoped resolver the other
 * actions here use, then defers to tenantReviewsEnabled (service-role PK lookup,
 * FAILS CLOSED). Any resolution failure returns false.
 */
export async function reviewsEnabledForTenantAction(
  tenantSlug: string,
): Promise<boolean> {
  const auth = await requireTalent();
  if (!auth.ok) return false;
  const tenantId = await resolveTenantId(auth.supabase, tenantSlug);
  if (!tenantId) return false;
  return tenantReviewsEnabled(tenantId);
}
