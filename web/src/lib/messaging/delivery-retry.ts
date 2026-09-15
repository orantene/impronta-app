import "server-only";

import { messagingChannel } from "@/lib/messaging/channels";

type Admin = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

export type DeliveryRetryRow = {
  id: string;
  message_id: string;
  tenant_id: string;
  channel: string;
  state: string;
  attempts: number;
  provider_ref: string | null;
};

export type DeliveryRetryResult =
  | { ok: true; state: "sent" | "failed" }
  | { ok: false; reason: "channel_unavailable" | "already" | "unavailable" };

/** The cron's per-row retry, shared with the Delivery sheet's Retry (MS23). */
export function deliveryRetryVerdict(row: Pick<DeliveryRetryRow, "channel" | "state">): DeliveryRetryResult | null {
  if (row.state !== "failed") return { ok: false, reason: "already" };
  // WhatsApp is the worker's outbox; there is no adapter-side resend.
  if (row.channel === "whatsapp" || !messagingChannel(row.channel)) return { ok: false, reason: "channel_unavailable" };
  return null;
}

/**
 * Resend one failed delivery through its channel adapter and record the
 * attempt. Loads the message body so the resend carries the words, which
 * the cron's first cut did not.
 */
export async function retryDeliveryRow(admin: Admin, row: DeliveryRetryRow): Promise<DeliveryRetryResult> {
  const verdict = deliveryRetryVerdict(row);
  if (verdict) return verdict;
  const adapter = messagingChannel(row.channel);
  if (!adapter) return { ok: false, reason: "channel_unavailable" };
  const { data: message } = await admin
    .from("inquiry_messages")
    .select("inquiry_id, body")
    .eq("id", row.message_id)
    .maybeSingle();
  const msg = (message ?? {}) as { inquiry_id?: string; body?: string | null };
  const body = msg.body ?? "";
  const sent = await adapter.send({
    tenantId: row.tenant_id,
    inquiryId: msg.inquiry_id ?? row.message_id,
    messageId: row.message_id,
    body,
    smsText: body,
    to: null,
  });
  const { error } = await admin
    .from("message_delivery")
    .update({
      state: sent.ok ? "sent" : "failed",
      attempts: row.attempts + 1,
      provider_ref: sent.ok ? sent.providerRef : row.provider_ref,
      last_error: sent.ok ? null : sent.reason,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);
  if (error) return { ok: false, reason: "unavailable" };
  return { ok: true, state: sent.ok ? "sent" : "failed" };
}
