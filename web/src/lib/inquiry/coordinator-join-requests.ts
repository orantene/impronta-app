/**
 * Coordinator join requests — engine wrapper around the SQL RPCs.
 *
 * Messages Consolidation Plan v2 — Slice F.
 * Lifecycle (plan §7.3): pending → approved | declined |
 * cancelled_by_requester | revoked_after_approval.
 *
 * All write paths go through `SECURITY DEFINER` RPCs in the database
 * (migration `20260513201434_coordinator_join_requests.sql`). This
 * module is the typed TypeScript surface.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";

export type CoordRequestState =
  | "pending"
  | "approved"
  | "declined"
  | "cancelled_by_requester"
  | "revoked_after_approval";

export type CoordJoinRequest = {
  id: string;
  tenant_id: string;
  inquiry_id: string;
  requester_user_id: string;
  pitch: string | null;
  state: CoordRequestState;
  decided_by_user_id: string | null;
  decided_at: string | null;
  decision_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type CoordRequestResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * Submit a coordinator-join request for the current user on the given
 * inquiry. Idempotent: if a pending request already exists for this
 * (inquiry, user) pair the existing row's id is returned.
 *
 * Engine-side preconditions:
 *   - Caller must be authenticated.
 *   - Caller must already be a `talent` participant on the inquiry.
 */
export async function submitCoordRequest(
  supabase: SupabaseClient,
  args: { inquiryId: string; pitch?: string | null },
): Promise<CoordRequestResult<{ requestId: string }>> {
  const { data, error } = await supabase.rpc("coord_request_submit", {
    p_inquiry_id: args.inquiryId,
    p_pitch: args.pitch ?? null,
  });
  if (error) {
    logServerError("coordinator-join-requests.submit", error);
    return { ok: false, error: friendlyMessage(error.message) };
  }
  const requestId = typeof data === "string" ? data : (data as { id?: string } | null)?.id;
  if (!requestId) {
    return { ok: false, error: "Could not submit request." };
  }
  return { ok: true, data: { requestId } };
}

/** Approve a pending request. Approver must satisfy plan §7.2. */
export async function approveCoordRequest(
  supabase: SupabaseClient,
  args: { requestId: string },
): Promise<CoordRequestResult> {
  const { error } = await supabase.rpc("coord_request_approve", {
    p_request_id: args.requestId,
  });
  if (error) {
    logServerError("coordinator-join-requests.approve", error);
    return { ok: false, error: friendlyMessage(error.message) };
  }
  return { ok: true, data: undefined };
}

/** Decline a pending request. */
export async function declineCoordRequest(
  supabase: SupabaseClient,
  args: { requestId: string; reason?: string | null },
): Promise<CoordRequestResult> {
  const { error } = await supabase.rpc("coord_request_decline", {
    p_request_id: args.requestId,
    p_reason: args.reason ?? null,
  });
  if (error) {
    logServerError("coordinator-join-requests.decline", error);
    return { ok: false, error: friendlyMessage(error.message) };
  }
  return { ok: true, data: undefined };
}

/** Requester cancels their own pending request. */
export async function cancelCoordRequest(
  supabase: SupabaseClient,
  args: { requestId: string },
): Promise<CoordRequestResult> {
  const { error } = await supabase.rpc("coord_request_cancel", {
    p_request_id: args.requestId,
  });
  if (error) {
    logServerError("coordinator-join-requests.cancel", error);
    return { ok: false, error: friendlyMessage(error.message) };
  }
  return { ok: true, data: undefined };
}

/** Admin/owner revokes a previously-approved request, demoting the
 *  coordinator back to talent role. */
export async function revokeCoordRequest(
  supabase: SupabaseClient,
  args: { requestId: string; reason?: string | null },
): Promise<CoordRequestResult> {
  const { error } = await supabase.rpc("coord_request_revoke", {
    p_request_id: args.requestId,
    p_reason: args.reason ?? null,
  });
  if (error) {
    logServerError("coordinator-join-requests.revoke", error);
    return { ok: false, error: friendlyMessage(error.message) };
  }
  return { ok: true, data: undefined };
}

/**
 * List requests visible to the caller for a given inquiry. RLS policy
 * filters automatically: requesters see their own; approvers see all
 * for that inquiry.
 */
export async function listCoordRequestsForInquiry(
  supabase: SupabaseClient,
  inquiryId: string,
): Promise<CoordRequestResult<CoordJoinRequest[]>> {
  const { data, error } = await supabase
    .from("coordinator_join_requests")
    .select("*")
    .eq("inquiry_id", inquiryId)
    .order("created_at", { ascending: false });
  if (error) {
    logServerError("coordinator-join-requests.list", error);
    return { ok: false, error: "Could not load requests." };
  }
  return { ok: true, data: (data ?? []) as CoordJoinRequest[] };
}

/** Friendly-error translator — maps Postgres exception messages to
 *  copy that surfaces well in UI. */
function friendlyMessage(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes("auth required")) return "Sign in required.";
  if (m.includes("forbidden: not a talent on this inquiry"))
    return "Only talent on this inquiry can request to coordinate.";
  if (m.includes("forbidden: not an approver"))
    return "You don't have permission to approve this request.";
  if (m.includes("forbidden: only requester"))
    return "Only the requester can cancel this request.";
  if (m.includes("forbidden: only workspace admin"))
    return "Only the workspace admin or owner can revoke a coordinator.";
  if (m.includes("request not found"))
    return "Request not found (it may have been already decided).";
  if (m.includes("request already approved")) return "Already approved.";
  if (m.includes("request already declined")) return "Already declined.";
  if (m.includes("request already cancelled_by_requester"))
    return "You already cancelled this request.";
  if (m.includes("request already revoked_after_approval"))
    return "This coordinator was already revoked.";
  return raw;
}
