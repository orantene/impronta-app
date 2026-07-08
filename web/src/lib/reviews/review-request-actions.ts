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
  // rejected by the policy, not by this app-layer code.
  const { error } = await supabase.from("review_requests").insert({
    tenant_id: tenantId,
    talent_profile_id: cleanTalentId,
    booking_id: cleanBookingId,
    client_user_id: cleanClientId,
    invited_email: cleanEmail,
    message: cleanMessage,
    status: "pending",
    requested_by_user_id: user.id,
  });

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

  // TODO(email): send the invite once email infra is wired.
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
