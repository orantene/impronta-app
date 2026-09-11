import { createHmac, timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { createServiceRoleClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function verifySignature(channel: string, raw: string, header: string | null): boolean {
  const secret =
    channel === "whatsapp"
      ? process.env.WHATSAPP_WEBHOOK_SECRET
      : channel === "sms"
        ? process.env.TWILIO_WEBHOOK_SECRET
        : process.env.RESEND_WEBHOOK_SECRET;
  if (!secret || !header) return false;
  const digest = createHmac("sha256", secret).update(raw).digest("hex");
  const left = Buffer.from(digest, "utf8");
  const right = Buffer.from(header, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ channel: string }> },
) {
  const { channel } = await context.params;
  if (channel !== "whatsapp" && channel !== "sms" && channel !== "email") {
    return NextResponse.json({ ok: false, reason: "invalid" }, { status: 404 });
  }
  const raw = await request.text();
  const signature = request.headers.get("x-messaging-signature");
  if (!verifySignature(channel, raw, signature)) {
    return NextResponse.json({ ok: false, reason: "not_allowed" }, { status: 401 });
  }
  let body: { inquiryId?: string; tenantId?: string; text?: string; providerRef?: string };
  try {
    body = JSON.parse(raw) as { inquiryId?: string; tenantId?: string; text?: string; providerRef?: string };
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid" }, { status: 400 });
  }
  if (!body.inquiryId || !body.tenantId || !body.text) {
    return NextResponse.json({ ok: false, reason: "invalid" }, { status: 400 });
  }
  const admin = createServiceRoleClient();
  if (!admin) return NextResponse.json({ ok: false, reason: "unavailable" }, { status: 503 });
  const { data, error } = await admin
    .from("inquiry_messages")
    .insert({
      inquiry_id: body.inquiryId,
      tenant_id: body.tenantId,
      thread_type: "group",
      message_kind: "text",
      body: body.text,
      sender_user_id: null,
    })
    .select("id")
    .single();
  if (error || !data) return NextResponse.json({ ok: false, reason: "unavailable" }, { status: 503 });
  if (body.providerRef) {
    await admin.from("message_delivery").upsert({
      message_id: (data as { id: string }).id,
      tenant_id: body.tenantId,
      channel,
      state: "delivered",
      provider_ref: body.providerRef,
      attempts: 1,
    }, { onConflict: "message_id,channel" });
  }
  return NextResponse.json({ ok: true, messageId: (data as { id: string }).id });
}
