import "server-only";

import { insertInquiryMessage } from "@/lib/coordinator/masked-message-write.server";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import type { SupabaseClient } from "@supabase/supabase-js";

import { fail } from "./refusals";
import { INTERNAL_NOTE_KIND, threadTypeForStaffMessage } from "./thread-rule";
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
): Promise<ActionResult<{ messageId: string; storedBody: string }>> {
  const row = {
    inquiry_id: input.inquiryId,
    // D-MSG-2: staff replies, cards and internal notes all sit on the client
    // thread; `message_kind` is what keeps a note from the client.
    thread_type: threadTypeForStaffMessage(input.kind),
    message_kind: input.kind,
    body: input.body,
    card_payload: input.payload ?? null,
    sender_user_id: input.senderUserId,
  };
  // TUL-1589: an internal note is staff-only and never reaches the client, so it is stored as typed.
  // EVERY other kind is client-visible and goes through the masking writer (coordinator contact
  // masking); callers must send/notify `storedBody`, never the text that was typed.
  if (input.kind === INTERNAL_NOTE_KIND) {
    const { data, error } = await tenantScopedQuery(admin, "inquiry_messages", input.tenantId).insert(row).select("id").single();
    if (error || !data) return fail("unavailable");
    return { ok: true, messageId: (data as { id: string }).id, storedBody: input.body };
  }
  const written = await insertInquiryMessage(admin, { ...row, tenant_id: input.tenantId });
  const id = (written.data as { id?: string } | null)?.id;
  if (written.error || !id) return fail("unavailable");
  return { ok: true, messageId: id, storedBody: written.storedBody ?? input.body };
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
