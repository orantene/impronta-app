import { NextResponse } from "next/server";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logServerError("cron/messaging-reminders", "CRON_SECRET not set; refusing to run");
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  }
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (token !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const admin = createServiceRoleClient();
  if (!admin) return NextResponse.json({ ok: false, error: "no_service_role" }, { status: 503 });

  const { data, error } = await admin
    .from("scheduled_messages")
    .select("id, tenant_id, inquiry_id, body, card_kind")
    .eq("state", "scheduled")
    .lte("send_at", new Date().toISOString())
    .limit(50);
  if (error) {
    logServerError("cron/messaging-reminders", error);
    return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503 });
  }

  let sent = 0;
  let failed = 0;
  for (const row of (data ?? []) as { id: string; tenant_id: string; inquiry_id: string; body: string; card_kind: string | null }[]) {
    const inserted = await admin.from("inquiry_messages").insert({
      inquiry_id: row.inquiry_id,
      tenant_id: row.tenant_id,
      thread_type: "group",
      message_kind: row.card_kind ?? "reminder",
      body: row.body,
      card_payload: { state: "sent" },
    });
    if (inserted.error) {
      failed += 1;
      await admin.from("scheduled_messages").update({ state: "failed" }).eq("id", row.id);
      continue;
    }
    await admin.from("scheduled_messages").update({ state: "sent" }).eq("id", row.id);
    sent += 1;
  }
  return NextResponse.json({ ok: true, sent, failed });
}
