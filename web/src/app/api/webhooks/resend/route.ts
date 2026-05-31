/**
 * Resend webhook handler — delivery tracking + suppression (spec §8 / Phase 8).
 *
 * Endpoint: POST /api/webhooks/resend
 *
 * Consumes Resend delivery events (email.delivered / opened / clicked /
 * bounced / complained), stamps the matching `notification_dispatch_log` row's
 * delivery column, and on hard bounce / complaint adds an `email_suppressions`
 * row so the address is never mailed again.
 *
 * Configuration (required):
 *   RESEND_WEBHOOK_SECRET      — Svix signing secret (`whsec_…`) from the
 *                                Resend dashboard webhook you point here.
 *   SUPABASE_SERVICE_ROLE_KEY  — service-role client for the privileged writes.
 *
 * Without the signing secret the route refuses every request with 503 so a
 * misconfigured deployment never accepts unsigned events — a forged
 * `email.complained` could otherwise suppress a real customer's mail.
 *
 * BLOCKED (ops, not code): the endpoint + secret must be registered in the
 * Resend dashboard once RESEND_API_KEY is provisioned. Until then this route
 * is inert (503), exactly like the Stripe webhook before its secret exists.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { improntaLog } from "@/lib/server/structured-log";
import { logServerError } from "@/lib/server/safe-error";
import {
  applyResendEvent,
  verifyResendSignature,
  type ResendWebhookEvent,
} from "@/lib/notifications/resend-webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Resend webhook not configured" }, { status: 503 });
  }

  // Raw body is required for signature verification — read it before parsing.
  const body = await req.text();
  const verified = verifyResendSignature(secret, body, {
    id: req.headers.get("svix-id"),
    timestamp: req.headers.get("svix-timestamp"),
    signature: req.headers.get("svix-signature"),
  });
  if (!verified) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let event: ResendWebhookEvent;
  try {
    event = JSON.parse(body) as ResendWebhookEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!event?.type) {
    return NextResponse.json({ error: "Missing event type" }, { status: 400 });
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ error: "Service role unavailable" }, { status: 503 });
  }

  try {
    const result = await applyResendEvent(admin, event);
    void improntaLog("notif.webhook.resend", {
      type: event.type,
      status: result.status,
      detail: result.detail,
    });
    // Always 200 on a processed event (even ignored/unmatched) so Resend
    // doesn't retry something we've intentionally no-op'd.
    return NextResponse.json({ received: true, status: result.status });
  } catch (err) {
    logServerError("webhooks.resend.dispatch", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
