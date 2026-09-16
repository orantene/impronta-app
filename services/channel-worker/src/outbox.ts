import { db } from "./db.js";
import { sendWhatsApp } from "./whatsapp-client.js";
import { postWebhook } from "./webhook-client.js";

type OutboxRow = {
  id: string;
  tenant_id: string;
  message_id: string;
  to_e164: string;
  body: string;
  attempts: number;
};

export async function tickOutbox(): Promise<number> {
  const admin = db();
  const { data } = await admin
    .from("channel_outbox")
    .select("id, tenant_id, message_id, to_e164, body, attempts")
    .eq("channel", "whatsapp")
    .eq("state", "queued")
    .lte("not_before", new Date().toISOString())
    .order("not_before", { ascending: true })
    .limit(10);
  const rows = (data ?? []) as OutboxRow[];
  let sent = 0;
  for (const row of rows) {
    const claim = await admin
      .from("channel_outbox")
      .update({ state: "sending", attempts: row.attempts + 1 })
      .eq("id", row.id)
      .eq("state", "queued")
      .select("id")
      .maybeSingle();
    if (!claim.data) continue;
    const result = await sendWhatsApp(row.tenant_id, row.to_e164, row.body);
    if (result.ok) {
      await admin
        .from("channel_outbox")
        .update({ state: "sent", provider_ref: result.providerRef, last_error: null })
        .eq("id", row.id);
      await postWebhook({
        kind: "ack",
        tenantId: row.tenant_id,
        providerRef: result.providerRef,
        state: "sent",
      });
      sent += 1;
    } else {
      await admin
        .from("channel_outbox")
        .update({
          state: "failed",
          last_error: result.error,
          not_before: new Date(Date.now() + 30_000).toISOString(),
        })
        .eq("id", row.id);
    }
  }
  return sent;
}
