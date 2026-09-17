import "server-only";

import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import type { SupabaseClient } from "@supabase/supabase-js";

import { fail } from "./refusals";
import type { ActionResult } from "./types";

/**
 * Shared by every messaging-engine write that appends a thread row
 * (reply, internal note, card, payment request, new-conversation first
 * message). Moved out of `messaging-engine.ts` (S4) purely to keep that
 * file under the 800-line ratchet — same tenant-scoped insert as before,
 * not a behavior change.
 */
export async function insertMessage(
  admin: SupabaseClient,
  input: {
    tenantId: string;
    inquiryId: string;
    kind: string;
    body: string;
    payload?: Record<string, unknown>;
    senderUserId: string | null;
  },
): Promise<ActionResult<{ messageId: string }>> {
  const { data, error } = await tenantScopedQuery(admin, "inquiry_messages", input.tenantId)
    .insert({
      inquiry_id: input.inquiryId,
      thread_type: input.kind === "internal_note" ? "private" : "group",
      message_kind: input.kind,
      body: input.body,
      card_payload: input.payload ?? null,
      sender_user_id: input.senderUserId,
    })
    .select("id")
    .single();
  if (error || !data) return fail("unavailable");
  return { ok: true, messageId: (data as { id: string }).id };
}

export async function recordDelivery(
  admin: SupabaseClient,
  input: {
    tenantId: string;
    messageId: string;
    channel: string;
    state: string;
    providerRef: string | null;
    lastError: string | null;
  },
) {
  await tenantScopedQuery(admin, "message_delivery", input.tenantId).upsert(
    {
      message_id: input.messageId,
      channel: input.channel,
      state: input.state,
      provider_ref: input.providerRef,
      attempts: 1,
      last_error: input.lastError,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "message_id,channel" },
  );
}
