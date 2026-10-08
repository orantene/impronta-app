/**
 * Resend webhook handler — delivery tracking + suppression (spec §8 / Phase 8).
 *
 * Endpoint: POST /api/webhooks/resend
 *
 * Consumes Resend webhook events:
 *   - Delivery (email.delivered / opened / clicked / bounced / complained):
 *     stamps `notification_dispatch_log` and may add `email_suppressions`.
 *   - Inbound (`email.received`): persists to `resend_inbound_emails`, then
 *     best-effort forwards to Gmail (Track C — see
 *     `lib/email/resend-inbound-forward.ts`). Store is the retention guarantee
 *     until Support Desk Phase 3.
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
 * LIVE in production: RESEND_API_KEY + RESEND_WEBHOOK_SECRET are both set in
 * Vercel prod, so this route is active and verifies signatures (an unsigned
 * POST returns 400, not the unconfigured 503). The 503 branch below remains the
 * fail-safe for any environment where the secret is absent.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { improntaLog } from "@/lib/server/structured-log";
import { logServerError } from "@/lib/server/safe-error";
import { processResendInboundEmail } from "@/lib/email/resend-inbound-forward";
import { appendInboundSupportReply } from "@/lib/support/support-inbound-append.server";
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

  if (event.type === "email.received") {
    try {
      const inbound = await processResendInboundEmail(event);
      void improntaLog("notif.webhook.resend.inbound", {
        ok: inbound.ok,
        stored: inbound.stored,
        forwardStatus: inbound.forwardStatus ?? null,
        detail: inbound.detail,
      });
      // Retention: if we stored the row, ack 200 even when Gmail forward
      // failed — Resend retry would only re-hit the unique key. If store
      // failed, 500 so Resend retries delivery.
      if (!inbound.stored) {
        return NextResponse.json(
          { error: "Inbound store failed", detail: inbound.detail },
          { status: 500 },
        );
      }
      // Thread append is best-effort and never throws; the row is already stored.
      await appendInboundSupportReply(event.data?.email_id);
      return NextResponse.json({ received: true, inbound });
    } catch (err) {
      logServerError("webhooks.resend.inbound", err);
      return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
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
