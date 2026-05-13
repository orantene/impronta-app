"use server";

/**
 * Coordinator join request — server actions for the talent → coord
 * upgrade flow. Wraps the engine RPCs from
 * `lib/inquiry/coordinator-join-requests.ts` with tenant-scoped auth
 * + revalidatePath.
 *
 * Messages Consolidation Plan v2 — Slice G.
 */

import { revalidatePath } from "next/cache";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { logServerError } from "@/lib/server/safe-error";
import {
  submitCoordRequest,
  approveCoordRequest,
  declineCoordRequest,
  cancelCoordRequest,
  revokeCoordRequest,
  type CoordRequestResult,
} from "@/lib/inquiry/coordinator-join-requests";

type ActionResult = { ok: true } | { ok: false; error: string };

function unwrap(r: CoordRequestResult<unknown>): ActionResult {
  if (r.ok) return { ok: true };
  return { ok: false, error: r.error };
}

/**
 * Talent requests to join the Client thread as coordinator on this
 * inquiry. Idempotent: re-submitting while pending is a no-op.
 */
export async function requestCoordinatorJoin(
  inquiryId: string,
  pitch?: string | null,
): Promise<{ ok: true; requestId: string } | { ok: false; error: string }> {
  if (!inquiryId) return { ok: false, error: "Missing inquiry id." };

  const session = await getCachedActorSession();
  if (!session.user) return { ok: false, error: "Sign in required." };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, error: "Database unavailable." };

  const r = await submitCoordRequest(supabase, {
    inquiryId,
    pitch: pitch?.trim() || null,
  });
  if (!r.ok) return { ok: false, error: r.error };
  revalidatePath("/", "layout");
  return { ok: true, requestId: r.data.requestId };
}

/** Approver (admin / coord / client) approves a pending request. */
export async function approveCoordinatorJoin(requestId: string): Promise<ActionResult> {
  if (!requestId) return { ok: false, error: "Missing request id." };
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false, error: "Sign in required." };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, error: "Database unavailable." };

  // Read inquiry_id before calling the RPC so we can emit the audit row.
  const { data: req } = await supabase
    .from("coordinator_join_requests")
    .select("inquiry_id")
    .eq("id", requestId)
    .maybeSingle();
  const inquiryId = req?.inquiry_id as string | null ?? null;

  const r = unwrap(await approveCoordRequest(supabase, { requestId }));
  if (r.ok) {
    revalidatePath("/", "layout");
    // Audit emit — fire-and-forget. Failure must never block the action.
    if (inquiryId) {
      await supabase.rpc("inquiry_audit_emit", {
        p_inquiry_id: inquiryId,
        p_kind: "coordinator_added",
        p_payload: { request_id: requestId },
      }).then((res) => { if (res.error) logServerError("audit.emit.coordinator_added", res.error); });
      // §6 chat-card: emit coordinator_request card into the group thread.
      try {
        // Resolve tenant_id for the inquiry.
        const { data: inqRow } = await supabase
          .from("inquiries")
          .select("tenant_id")
          .eq("id", inquiryId)
          .maybeSingle();
        const tenantId = (inqRow?.tenant_id as string | null) ?? null;
        if (tenantId) {
          await supabase.from("inquiry_messages").insert({
            inquiry_id: inquiryId,
            tenant_id: tenantId,
            thread_type: "group",
            sender_user_id: session.user!.id,
            body: "Coordinator joined this inquiry.",
            message_kind: "coordinator_request",
            card_payload: { summary: "Coordinator joined this inquiry", status: "approved" },
          });
        }
      } catch (emitErr) {
        logServerError("coord-request.approve.chatCard", emitErr);
      }
    }
  }
  return r;
}

/** Approver declines a pending request (low-friction, optional reason). */
export async function declineCoordinatorJoin(
  requestId: string,
  reason?: string | null,
): Promise<ActionResult> {
  if (!requestId) return { ok: false, error: "Missing request id." };
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false, error: "Sign in required." };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, error: "Database unavailable." };
  const r = unwrap(await declineCoordRequest(supabase, { requestId, reason: reason?.trim() || null }));
  if (r.ok) revalidatePath("/", "layout");
  return r;
}

/** Requester cancels their own pending request. */
export async function cancelCoordinatorJoin(requestId: string): Promise<ActionResult> {
  if (!requestId) return { ok: false, error: "Missing request id." };
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false, error: "Sign in required." };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, error: "Database unavailable." };
  const r = unwrap(await cancelCoordRequest(supabase, { requestId }));
  if (r.ok) revalidatePath("/", "layout");
  return r;
}

/** Admin/owner revokes a previously-approved coordinator. */
export async function revokeCoordinator(
  requestId: string,
  reason?: string | null,
): Promise<ActionResult> {
  if (!requestId) return { ok: false, error: "Missing request id." };
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false, error: "Sign in required." };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, error: "Database unavailable." };

  // Read inquiry_id before calling the RPC so we can emit the audit row.
  const { data: req } = await supabase
    .from("coordinator_join_requests")
    .select("inquiry_id")
    .eq("id", requestId)
    .maybeSingle();
  const inquiryId = req?.inquiry_id as string | null ?? null;

  const r = unwrap(await revokeCoordRequest(supabase, { requestId, reason: reason?.trim() || null }));
  if (r.ok) {
    revalidatePath("/", "layout");
    // Audit emit — fire-and-forget. Failure must never block the action.
    if (inquiryId) {
      await supabase.rpc("inquiry_audit_emit", {
        p_inquiry_id: inquiryId,
        p_kind: "coordinator_removed",
        p_payload: { request_id: requestId },
      }).then((res) => { if (res.error) logServerError("audit.emit.coordinator_removed", res.error); });
    }
  }
  return r;
}
