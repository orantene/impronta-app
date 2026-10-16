/**
 * TUL-225: Twilio's "a message came in" webhook for the WhatsApp sender. Today it only honours
 * STOP / BAJA (opt-out) and HELP; any other reply is acknowledged and dropped. The request is
 * authenticated by Twilio's signature over the exact public URL, so nothing is read or written
 * before it verifies. Reachability: `/api/webhooks/` is host-agnostic (proxy.ts, staging-gate).
 */
import { NextResponse } from "next/server";

import { getAppUrl } from "@/lib/auth-flow";
import { handleInboundWhatsApp } from "@/lib/notifications/whatsapp/inbound";
import { createTwilioWhatsAppProvider, twilioWhatsAppConfigFromEnv } from "@/lib/notifications/whatsapp/twilio";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const xml = (text: string, status = 200) =>
  new NextResponse(text, { status, headers: { "content-type": "text/xml; charset=utf-8" } });

const escapeXml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function POST(request: Request) {
  const config = twilioWhatsAppConfigFromEnv();
  if (!config) return NextResponse.json({ error: "WhatsApp not configured" }, { status: 503 });

  const params: Record<string, string> = {};
  for (const [key, value] of (await request.formData()).entries()) {
    if (typeof value === "string") params[key] = value;
  }

  const provider = createTwilioWhatsAppProvider(config);
  const verified = await provider.verifySignature({
    url: `${getAppUrl()}/api/webhooks/whatsapp/inbound`,
    signature: request.headers.get("x-twilio-signature"),
    params,
  });
  if (!verified) return NextResponse.json({ error: "Invalid signature" }, { status: 403 });

  const admin = createServiceRoleClient();
  if (!admin) return NextResponse.json({ error: "Service role unavailable" }, { status: 503 });

  const result = await handleInboundWhatsApp(admin, { from: params.From, body: params.Body });
  // A 5xx makes Twilio retry; a STOP we failed to store must not be dropped.
  if (!result.ok) return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  return xml(result.reply ? `<Response><Message>${escapeXml(result.reply)}</Message></Response>` : "<Response/>");
}
