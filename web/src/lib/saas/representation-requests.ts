import "server-only";

import { getCachedActorSession } from "@/lib/server/request-cache";
import { hasCapability } from "@/lib/saas/capabilities";
import { findTenantMembership } from "@/lib/saas/tenant";

/**
 * Talent representation request engine (SaaS Phase 7).
 *
 * Unified governed-request surface for two flows:
 *   - target_type='agency': talent applies to an agency roster
 *   - target_type='hub':    hub-visibility submission, platform-reviewed
 *
 * Spec: docs/saas/phase-0/03-state-machines.md §6 (L41, L42, L44).
 *
 * This module owns capability checks + DB writes. Effectuation on
 * `accepted` is handled by the DB trigger
 * `talent_representation_requests_effectuate` so platform reviewers can
 * cross-tenant write into `agency_talent_roster` without app-layer
 * SECURITY-DEFINER helpers. RLS still gates who may call UPDATE at all.
 */

export type RepresentationTargetType = "agency" | "hub";

export type RepresentationRequestStatus =
  | "requested"
  | "under_review"
  | "accepted"
  | "rejected"
  | "withdrawn";

export type RepresentationRequestRow = {
  id: string;
  talent_profile_id: string;
  target_type: RepresentationTargetType;
  target_id: string;
  status: RepresentationRequestStatus;
  reviewer_reason: string | null;
  requested_by: string | null;
  requested_at: string;
  requester_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  picked_up_by: string | null;
  picked_up_at: string | null;
  created_at: string;
  updated_at: string;
};

export type EngineResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

/**
 * Can the current user act as a reviewer for `(target_type, target_id)`?
 *
 * - target_type='agency': staff of target_id with `manage_talent_roster`.
 * - target_type='hub':    platform admin only (L42).
 */
export async function canReviewRepresentationRequest(
  targetType: RepresentationTargetType,
  targetId: string,
): Promise<boolean> {
  const session = await getCachedActorSession();
  if (!session.user) return false;

  if (targetType === "hub") {
    return session.profile?.app_role === "super_admin";
  }

  // target_type='agency' → capability check on target tenant
  if (session.profile?.app_role === "super_admin") return true;
  const membership = await findTenantMembership(targetId);
  if (!membership) return false;
  return hasCapability("manage_talent_roster", targetId);
}

/**
 * Submit a new representation request. Caller can be:
 *   - the talent themselves (their profile → talent_profiles.profile_id)
 *   - staff of the target tenant (agency coordinator submitting a hub request
 *     on behalf of a rostered talent)
 *   - a platform admin
 *
 * Always creates in `requested` state. Never auto-publishes (L41).
 */
export async function submitRepresentationRequest(input: {
  talentProfileId: string;
  targetType: RepresentationTargetType;
  targetId: string;
  note?: string | null;
}): Promise<EngineResult<{ id: string }>> {
  const session = await getCachedActorSession();
  if (!session.supabase || !session.user) {
    return fail("You must be signed in.");
  }

  // App-layer sanity: reject an immediate resubmit while an existing request
  // is still open. (DB partial unique index is authoritative; this just gives
  // the caller a friendlier error than a constraint violation.)
  const existing = await session.supabase
    .from("talent_representation_requests")
    .select("id, status")
    .eq("talent_profile_id", input.talentProfileId)
    .eq("target_type", input.targetType)
    .eq("target_id", input.targetId)
    .in("status", ["requested", "under_review"])
    .maybeSingle();

  if (existing.data) {
    return fail("A request is already open for this target.");
  }

  const { data, error } = await session.supabase
    .from("talent_representation_requests")
    .insert({
      talent_profile_id: input.talentProfileId,
      target_type: input.targetType,
      target_id: input.targetId,
      requested_by: session.user.id,
      requester_note: input.note ?? null,
      status: "requested",
    })
    .select("id")
    .single();

  if (error || !data) {
    return fail(error?.message ?? "Failed to submit request.");
  }

  return { ok: true, data: { id: data.id } };
}

/** Reviewer picks up a request (requested → under_review). */
export async function pickUpRepresentationRequest(
  requestId: string,
): Promise<EngineResult<void>> {
  const session = await getCachedActorSession();
  if (!session.supabase || !session.user) return fail("You must be signed in.");

  const { data: row, error: loadErr } = await session.supabase
    .from("talent_representation_requests")
    .select("id, status, target_type, target_id")
    .eq("id", requestId)
    .maybeSingle();
  if (loadErr || !row) return fail(loadErr?.message ?? "Request not found.");
  if (row.status !== "requested") {
    return fail("Only requests in the queue can be picked up.");
  }

  const allowed = await canReviewRepresentationRequest(
    row.target_type as RepresentationTargetType,
    row.target_id as string,
  );
  if (!allowed) return fail("Not authorized to review this request.");

  const { error } = await session.supabase
    .from("talent_representation_requests")
    .update({
      status: "under_review",
      picked_up_by: session.user.id,
      picked_up_at: new Date().toISOString(),
    })
    .eq("id", requestId);
  if (error) return fail(error.message);
  return { ok: true, data: undefined };
}

/**
 * Approve (under_review → accepted). Triggers DB effectuation into
 * `agency_talent_roster` (see migration).
 */
export async function approveRepresentationRequest(
  requestId: string,
): Promise<EngineResult<void>> {
  const session = await getCachedActorSession();
  if (!session.supabase || !session.user) return fail("You must be signed in.");

  const { data: row, error: loadErr } = await session.supabase
    .from("talent_representation_requests")
    .select("id, status, target_type, target_id")
    .eq("id", requestId)
    .maybeSingle();
  if (loadErr || !row) return fail(loadErr?.message ?? "Request not found.");
  if (row.status !== "under_review") {
    return fail("Pick up the request before approving.");
  }

  const allowed = await canReviewRepresentationRequest(
    row.target_type as RepresentationTargetType,
    row.target_id as string,
  );
  if (!allowed) return fail("Not authorized to review this request.");

  const { error } = await session.supabase
    .from("talent_representation_requests")
    .update({
      status: "accepted",
      reviewed_by: session.user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", requestId);
  if (error) return fail(error.message);
  return { ok: true, data: undefined };
}

/** Reject (under_review → rejected) with optional reason surfaced to requester. */
export async function rejectRepresentationRequest(input: {
  requestId: string;
  reason?: string | null;
}): Promise<EngineResult<void>> {
  const session = await getCachedActorSession();
  if (!session.supabase || !session.user) return fail("You must be signed in.");

  const { data: row, error: loadErr } = await session.supabase
    .from("talent_representation_requests")
    .select("id, status, target_type, target_id")
    .eq("id", input.requestId)
    .maybeSingle();
  if (loadErr || !row) return fail(loadErr?.message ?? "Request not found.");
  if (row.status !== "under_review") {
    return fail("Pick up the request before rejecting.");
  }

  const allowed = await canReviewRepresentationRequest(
    row.target_type as RepresentationTargetType,
    row.target_id as string,
  );
  if (!allowed) return fail("Not authorized to review this request.");

  const { error } = await session.supabase
    .from("talent_representation_requests")
    .update({
      status: "rejected",
      reviewer_reason: input.reason?.trim() || null,
      reviewed_by: session.user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", input.requestId);
  if (error) return fail(error.message);
  return { ok: true, data: undefined };
}

/**
 * Withdraw (requested|under_review → withdrawn). Allowed for the original
 * requester or a platform admin. RLS permits both via their respective read
 * paths (talent self-write OR platform admin).
 */
export async function withdrawRepresentationRequest(
  requestId: string,
): Promise<EngineResult<void>> {
  const session = await getCachedActorSession();
  if (!session.supabase || !session.user) return fail("You must be signed in.");

  const { data: row, error: loadErr } = await session.supabase
    .from("talent_representation_requests")
    .select("id, status, requested_by")
    .eq("id", requestId)
    .maybeSingle();
  if (loadErr || !row) return fail(loadErr?.message ?? "Request not found.");
  if (row.status !== "requested" && row.status !== "under_review") {
    return fail("Only open requests can be withdrawn.");
  }

  const isRequester = row.requested_by === session.user.id;
  const isPlatformAdmin = session.profile?.app_role === "super_admin";
  if (!isRequester && !isPlatformAdmin) {
    return fail("Only the requester or a platform admin can withdraw a request.");
  }

  const { error } = await session.supabase
    .from("talent_representation_requests")
    .update({
      status: "withdrawn",
      reviewed_by: isPlatformAdmin ? session.user.id : null,
      reviewed_at: isPlatformAdmin ? new Date().toISOString() : null,
    })
    .eq("id", requestId);
  if (error) return fail(error.message);
  return { ok: true, data: undefined };
}
