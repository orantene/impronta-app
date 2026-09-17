import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * S4: `inquiry_action_log` write helpers for the history reader
 * (`web/src/lib/messaging/history.ts`). Lives outside `server-actions/`
 * (unlike the engine) so the raw `.from(...)` calls here are not subject to
 * `ratchet/no-untenanted-from` — `inquiry_action_log` genuinely has no
 * `tenant_id` column (D-MSG-2/D-MSG-5, decisions.md), so `tenantScopedQuery`
 * cannot be used; the caller has already tenant-checked the inquiry.
 *
 * A failed insert here must never fail the action that already succeeded —
 * every write is best-effort.
 */

type Admin = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

export async function logAction(
  admin: SupabaseClient,
  input: { inquiryId: string; actorUserId: string; actionType: string; metadata?: Record<string, unknown> },
) {
  await admin.from("inquiry_action_log").insert({
    inquiry_id: input.inquiryId,
    actor_user_id: input.actorUserId,
    action_type: input.actionType,
    result: "success",
    metadata: input.metadata ?? null,
  });
}

export async function resolveDisplayName(admin: Admin, userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const { data } = await admin.from("profiles").select("display_name").eq("id", userId).maybeSingle();
  return (data as { display_name: string | null } | null)?.display_name ?? null;
}

/** Logs assignment/handover after `messaging_assign_owner` succeeds — the two
 * are the same RPC, told apart in history only by this flag. */
export async function logAssignment(
  admin: SupabaseClient,
  input: { inquiryId: string; actorUserId: string; ownerUserId: string | null; handover: boolean },
) {
  const ownerLabel = await resolveDisplayName(admin, input.ownerUserId);
  await logAction(admin, {
    inquiryId: input.inquiryId,
    actorUserId: input.actorUserId,
    actionType: "messaging_assign_owner",
    metadata: { ownerUserId: input.ownerUserId, ownerLabel, handover: input.handover },
  });
}

/** Logs resolve/reopen after `messaging_set_conversation_state` succeeds. */
export async function logConversationState(
  admin: SupabaseClient,
  input: { inquiryId: string; actorUserId: string; state: "resolved" | "needs_reply" },
) {
  await logAction(admin, {
    inquiryId: input.inquiryId,
    actorUserId: input.actorUserId,
    actionType: "messaging_set_conversation_state",
    metadata: { state: input.state },
  });
}

/**
 * Logs a staff edit of the client's contact fields (D15 ClientSheet,
 * D-MSG-91) after the actual write (`updateInquiryDetails` or
 * `messaging_set_identity`) succeeds. `fields` names only what changed —
 * never the values, so a phone/email never lands in a log row a wider staff
 * audience might read.
 */
export async function logClientEdit(
  admin: SupabaseClient,
  input: { inquiryId: string; actorUserId: string; fields: readonly ("name" | "phone" | "email")[] },
) {
  if (input.fields.length === 0) return;
  await logAction(admin, {
    inquiryId: input.inquiryId,
    actorUserId: input.actorUserId,
    actionType: "messaging_client_edit",
    metadata: { fields: input.fields },
  });
}

/** Logs close-lost after `messaging_close_lost` succeeds. */
export async function logCloseLost(
  admin: SupabaseClient,
  input: { inquiryId: string; actorUserId: string; reason: string },
) {
  await logAction(admin, {
    inquiryId: input.inquiryId,
    actorUserId: input.actorUserId,
    actionType: "messaging_close_lost",
    metadata: { reason: input.reason },
  });
}
