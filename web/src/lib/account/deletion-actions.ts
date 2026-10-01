"use server";

import { getCachedActorSession } from "@/lib/server/request-cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import {
  DELETION_TABLE,
  OPEN_DELETION_STATUSES,
  deriveBlockers,
  isDeletionConfirmation,
  loadBlockerSnapshot,
  type DeletionBlocker,
  type DeletionStatus,
  type DeletionSurface,
} from "./deletion";

/**
 * Self-serve account deletion: request, cancel, read status. The table is
 * service-role only, so every action resolves the user from the session and
 * scopes every query to that user id. Nobody can act on another account.
 */

export type DeletionRequestView = {
  id: string;
  status: DeletionStatus;
  requestedAt: string;
  scheduledFor: string;
};

export type DeletionStatusResult =
  | { ok: true; request: DeletionRequestView | null; blockers: DeletionBlocker[] }
  | { ok: false; error: string };

type RequestRow = {
  id: string;
  status: DeletionStatus;
  requested_at: string;
  scheduled_for: string;
};

function toView(r: RequestRow): DeletionRequestView {
  return { id: r.id, status: r.status, requestedAt: r.requested_at, scheduledFor: r.scheduled_for };
}

async function currentUserId(): Promise<string | null> {
  const session = await getCachedActorSession();
  return session.user?.id ?? null;
}

async function liveBlockers(userId: string): Promise<DeletionBlocker[]> {
  const admin = createServiceRoleClient();
  if (!admin) throw new Error("Service role client not available.");
  const { data, error } = await admin.from("talent_profiles").select("id").eq("user_id", userId);
  if (error) throw new Error(error.message);
  const ids = ((data ?? []) as Array<{ id: string }>).map((t) => t.id);
  return deriveBlockers(await loadBlockerSnapshot(admin, userId, ids));
}

async function openRequest(userId: string): Promise<RequestRow | null> {
  const admin = createServiceRoleClient();
  if (!admin) throw new Error("Service role client not available.");
  const { data, error } = await admin
    .from(DELETION_TABLE)
    .select("id, status, requested_at, scheduled_for")
    .eq("user_id", userId)
    .in("status", OPEN_DELETION_STATUSES)
    .order("requested_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  return ((data ?? []) as RequestRow[])[0] ?? null;
}

export async function getAccountDeletionStatus(): Promise<DeletionStatusResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "not_signed_in" };
  try {
    const [request, blockers] = await Promise.all([openRequest(userId), liveBlockers(userId)]);
    return { ok: true, request: request ? toView(request) : null, blockers };
  } catch (e) {
    logServerError("account/deletion.status", e);
    return { ok: false, error: "load_failed" };
  }
}

export async function requestAccountDeletion(input: {
  confirm: string;
  surface: DeletionSurface;
}): Promise<DeletionStatusResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "not_signed_in" };
  if (!isDeletionConfirmation(input.confirm ?? "")) return { ok: false, error: "confirm_mismatch" };
  const surface: DeletionSurface =
    input.surface === "client" || input.surface === "workspace" ? input.surface : "talent";

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "unavailable" };

  try {
    const existing = await openRequest(userId);
    const blockers = await liveBlockers(userId);
    if (existing) return { ok: true, request: toView(existing), blockers };

    const { data, error } = await admin
      .from(DELETION_TABLE)
      .insert({ user_id: userId, surface, status: "pending", blockers })
      .select("id, status, requested_at, scheduled_for")
      .single();
    if (error) {
      // 23505: a concurrent request won the one-open-per-user index.
      if ((error as { code?: string }).code === "23505") {
        const again = await openRequest(userId);
        return { ok: true, request: again ? toView(again) : null, blockers };
      }
      throw new Error(error.message);
    }
    return { ok: true, request: toView(data as RequestRow), blockers };
  } catch (e) {
    logServerError("account/deletion.request", e);
    return { ok: false, error: "request_failed" };
  }
}

export async function cancelAccountDeletion(): Promise<DeletionStatusResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "not_signed_in" };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "unavailable" };
  try {
    // A request the executor has already claimed (processing) cannot be
    // cancelled: the status filter makes that a no-op, reported below.
    const { data, error } = await admin
      .from(DELETION_TABLE)
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("user_id", userId)
      .in("status", ["pending", "blocked", "failed"])
      .select("id");
    if (error) throw new Error(error.message);
    if ((data ?? []).length === 0) {
      const still = await openRequest(userId);
      if (still) return { ok: false, error: "already_processing" };
    }
    return { ok: true, request: null, blockers: await liveBlockers(userId) };
  } catch (e) {
    logServerError("account/deletion.cancel", e);
    return { ok: false, error: "cancel_failed" };
  }
}
