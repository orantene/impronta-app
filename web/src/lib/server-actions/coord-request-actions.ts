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
  const r = unwrap(await approveCoordRequest(supabase, { requestId }));
  if (r.ok) revalidatePath("/", "layout");
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
  const r = unwrap(await revokeCoordRequest(supabase, { requestId, reason: reason?.trim() || null }));
  if (r.ok) revalidatePath("/", "layout");
  return r;
}
