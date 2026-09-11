import { NextResponse } from "next/server";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { messagingChannel } from "@/lib/messaging/channels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logServerError("cron/messaging-delivery-retry", "CRON_SECRET not set; refusing to run");
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  }
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (token !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const admin = createServiceRoleClient();
  if (!admin) return NextResponse.json({ ok: false, error: "no_service_role" }, { status: 503 });

  const { data, error } = await admin
    .from("message_delivery")
    .select("id, message_id, tenant_id, channel, attempts, provider_ref")
    .eq("state", "failed")
    .lt("attempts", 2)
    .limit(40);
  if (error) {
    logServerError("cron/messaging-delivery-retry", error);
    return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503 });
  }

  let retried = 0;
  for (const row of (data ?? []) as {
    id: string;
    message_id: string;
    tenant_id: string;
    channel: string;
    attempts: number;
    provider_ref: string | null;
  }[]) {
    const adapter = messagingChannel(row.channel);
    if (!adapter) continue;
    const sent = await adapter.send({
      tenantId: row.tenant_id,
      inquiryId: row.message_id,
      messageId: row.message_id,
      body: "",
      smsText: "",
      to: null,
    });
    await admin
      .from("message_delivery")
      .update({
        state: sent.ok ? "sent" : "failed",
        attempts: row.attempts + 1,
        provider_ref: sent.ok ? sent.providerRef : row.provider_ref,
        last_error: sent.ok ? null : sent.reason,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    retried += 1;
  }
  return NextResponse.json({ ok: true, retried });
}
