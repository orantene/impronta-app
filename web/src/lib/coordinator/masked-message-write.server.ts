import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { contactMaskingEnabled, maskCardPayloadText, maskContactDetails } from "./contact-masking";
import { contactMaskingActive } from "./contact-masking.server";

/**
 * THE one place a message reaches `inquiry_messages` with text a person typed
 * (TUL-1373 contact masking). Every such writer goes through here; a guard test
 * fails when a new one writes around it.
 *
 * When masking applies (private/client thread, flag on, terms say the workspace
 * is the client's contact, nothing booked) the stored body has phone and email
 * hidden and the ORIGINAL is kept in `inquiry_message_originals`: a restricted
 * table, readable by service role and platform admin only, never shown in any UI,
 * kept for safety and disputes. The original is written FIRST; if that fails the
 * message is not sent (privacy and the record both fail closed), and if the
 * message insert then fails the original is removed again.
 *
 * Flag off, or any other thread, or nothing to hide: a plain insert, unchanged.
 */

/** Any client that can `.from(table)`: a user client, the service client, or the narrow admin types some webhooks use. */
export type MessageWriteClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

export type InquiryMessageRow = {
  inquiry_id: string;
  tenant_id: string;
  thread_type: string;
  body: string | null;
  metadata?: Record<string, unknown> | null;
  [key: string]: unknown;
};

export type InsertMessageResult = {
  data: Record<string, unknown> | null;
  error: { message: string; code?: string } | null;
  /** What was stored: use this (not the typed text) for notifications, nudges and mentions. */
  storedBody: string | null;
  maskedCount: number;
};

type Deps = { admin?: SupabaseClient | null; newId?: () => string };

async function plainInsert(client: MessageWriteClient, row: InquiryMessageRow, select: string): Promise<InsertMessageResult> {
  const { data, error } = await client.from("inquiry_messages").insert(row).select(select).single();
  return { data: (data as unknown as Record<string, unknown> | null) ?? null, error: error ?? null, storedBody: row.body, maskedCount: 0 };
}

export async function insertInquiryMessage(
  client: MessageWriteClient,
  row: InquiryMessageRow,
  opts: { select?: string } = {},
  deps: Deps = {},
): Promise<InsertMessageResult> {
  const select = opts.select ?? "id";
  if (row.thread_type !== "private" || (!row.body && !row.card_payload) || !contactMaskingEnabled()) return plainInsert(client, row, select);

  const admin = deps.admin === undefined ? createServiceRoleClient() : deps.admin;
  if (!admin) {
    logServerError("coordinator.maskedWrite", "no service client while masking is on");
    return { data: null, error: { message: "masking_unavailable" }, storedBody: row.body, maskedCount: 0 };
  }
  if (!(await contactMaskingActive(admin, { inquiryId: row.inquiry_id, tenantId: row.tenant_id }))) {
    return plainInsert(client, row, select);
  }
  const masked = maskContactDetails(row.body ?? "");
  // TUL-1597: the free text inside a card payload (notes, summaries, captions) is masked too.
  const maskedCard = maskCardPayloadText(row.card_payload ?? null);
  const maskedCount = masked.maskedCount + maskedCard.maskedCount;
  if (maskedCount === 0) return plainInsert(client, row, select);

  const id = (deps.newId ?? (() => crypto.randomUUID()))();
  const saved = await admin.from("inquiry_message_originals").insert({
    message_id: id,
    inquiry_id: row.inquiry_id,
    tenant_id: row.tenant_id,
    kind: "insert",
    // The typed original: the body, or (when a card payload was masked too) body + payload as JSON.
    original_body: maskedCard.maskedCount > 0 ? JSON.stringify({ body: row.body, card_payload: row.card_payload }) : row.body,
    masked_count: maskedCount,
  });
  if (saved.error) {
    logServerError("coordinator.maskedWrite.original", saved.error);
    return { data: null, error: { message: "original_not_saved" }, storedBody: row.body, maskedCount: 0 };
  }
  const { data, error } = await client
    .from("inquiry_messages")
    .insert({
      ...row,
      id,
      body: row.body ? masked.text : row.body,
      ...(maskedCard.maskedCount > 0 ? { card_payload: maskedCard.payload } : {}),
      metadata: { ...(row.metadata ?? {}), contact_masked: maskedCount },
    })
    .select(select)
    .single();
  if (error) {
    await admin.from("inquiry_message_originals").delete().eq("message_id", id).eq("kind", "insert");
    return { data: null, error, storedBody: masked.text, maskedCount };
  }
  return { data: (data as unknown as Record<string, unknown> | null) ?? null, error: null, storedBody: masked.text, maskedCount };
}

/**
 * An EDIT of a client-chat message goes through the same rule: the edited text is
 * masked and the typed original is kept. Returns the body to store, or null when the
 * original could not be saved (the edit must then be refused).
 */
export async function maskEditedBody(
  input: { messageId: string; inquiryId: string; tenantId: string; threadType: string; body: string },
  deps: Deps = {},
): Promise<string | null> {
  if (input.threadType !== "private" || !input.body || !contactMaskingEnabled()) return input.body;
  const admin = deps.admin === undefined ? createServiceRoleClient() : deps.admin;
  if (!admin) return null;
  if (!(await contactMaskingActive(admin, { inquiryId: input.inquiryId, tenantId: input.tenantId }))) return input.body;
  const masked = maskContactDetails(input.body);
  if (masked.maskedCount === 0) return input.body;
  const saved = await admin.from("inquiry_message_originals").insert({
    message_id: input.messageId,
    inquiry_id: input.inquiryId,
    tenant_id: input.tenantId,
    kind: "edit",
    original_body: input.body,
    masked_count: masked.maskedCount,
  });
  if (saved.error) {
    logServerError("coordinator.maskedEdit.original", saved.error);
    return null;
  }
  return masked.text;
}
