import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { auditFailure } from "@/lib/audit/emit";
import { logServerError } from "@/lib/server/safe-error";

/**
 * Resend delivery-event webhook core (spec §8 / Phase 8).
 *
 * Resend signs webhooks with the Svix scheme (svix-id / svix-timestamp /
 * svix-signature headers, `whsec_…` secret). This module owns:
 *  - signature + timestamp verification (no svix dependency — plain HMAC), and
 *  - applying a verified event: stamp the matching dispatch_log row's
 *    delivery column, and on hard bounce / complaint add an email_suppressions
 *    row so the channel never mails that address again.
 *
 * Correlation key is `notification_dispatch_log.provider_reference`, which the
 * dispatcher now stores as the Resend message id at send time. Auth emails go
 * out via Supabase SMTP and have no dispatch_log row — their delivery events
 * simply don't correlate (we still suppress by resolving the address → user).
 */

// ─── Event shape ────────────────────────────────────────────────────────────

/** Minimal shape of the fields we read off a Resend webhook event. */
export type ResendWebhookEvent = {
  type: string;
  created_at?: string;
  data?: {
    email_id?: string;
    to?: string | string[];
    created_at?: string;
    /** Newer Resend bounce detail: type ∈ Permanent|Transient|Undetermined. */
    bounce?: { type?: string; subType?: string; message?: string };
  };
};

/** dispatch_log delivery columns, keyed by Resend event type. */
const EVENT_COLUMN: Record<string, "delivered_at" | "opened_at" | "clicked_at" | "bounced_at" | "complaint_at"> = {
  "email.delivered": "delivered_at",
  "email.opened": "opened_at",
  "email.clicked": "clicked_at",
  "email.bounced": "bounced_at",
  "email.complained": "complaint_at",
};

type SuppressionReason = "hard_bounce" | "complaint";

/**
 * Decide whether an event should suppress the address, and with what reason.
 *
 * Conservative on bounces: only a *permanent* bounce suppresses. Transient /
 * undetermined / shape-less bounces are recorded (bounced_at) but never
 * suppress — blocking a real customer's address on a transient blip is worse
 * than a retry. Complaints always suppress (the recipient hit "spam").
 */
export function suppressionReasonFor(event: ResendWebhookEvent): SuppressionReason | null {
  if (event.type === "email.complained") return "complaint";
  if (event.type === "email.bounced") {
    const bounceType = event.data?.bounce?.type?.toLowerCase() ?? "";
    if (bounceType.includes("permanent") || bounceType === "hard") return "hard_bounce";
    return null;
  }
  return null;
}

function eventTimestamp(event: ResendWebhookEvent): string {
  const raw = event.created_at ?? event.data?.created_at;
  if (raw) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return new Date().toISOString();
}

function firstRecipient(event: ResendWebhookEvent): string | null {
  const to = event.data?.to;
  if (Array.isArray(to)) return to[0] ?? null;
  if (typeof to === "string") return to || null;
  return null;
}

// ─── Signature verification (Svix scheme) ─────────────────────────────────────

export type ResendSignatureHeaders = {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
};

/** Tolerance for clock skew / delivery lag on the svix-timestamp (seconds). */
const TIMESTAMP_TOLERANCE_SECONDS = 5 * 60;

/**
 * Verify a Resend (Svix) webhook signature against the raw request body.
 *
 * signedContent = `${id}.${timestamp}.${body}`; the secret is the base64 blob
 * after the `whsec_` prefix; expected = base64(HMAC-SHA256(secret, content)).
 * The svix-signature header is a space-delimited list of `v1,<sig>` entries —
 * any match passes. Returns false on any missing/blank input or skew overflow.
 */
export function verifyResendSignature(
  secret: string,
  body: string,
  headers: ResendSignatureHeaders,
): boolean {
  const { id, timestamp, signature } = headers;
  if (!secret || !id || !timestamp || !signature) return false;

  // Reject stale/forward-dated timestamps (replay protection).
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const skew = Math.abs(Date.now() / 1000 - ts);
  if (skew > TIMESTAMP_TOLERANCE_SECONDS) return false;

  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  if (secretBytes.length === 0) return false;

  const expected = createHmac("sha256", secretBytes)
    .update(`${id}.${timestamp}.${body}`)
    .digest("base64");
  const expectedBuf = Buffer.from(expected);

  // Header: "v1,<sig> v1,<sig2> …" — accept if any version-1 sig matches.
  for (const part of signature.split(" ")) {
    const comma = part.indexOf(",");
    const sig = comma === -1 ? part : part.slice(comma + 1);
    const sigBuf = Buffer.from(sig);
    if (sigBuf.length === expectedBuf.length && timingSafeEqual(sigBuf, expectedBuf)) {
      return true;
    }
  }
  return false;
}

// ─── Apply a verified event ───────────────────────────────────────────────────

export type ApplyResult =
  | { status: "ignored"; detail: string }
  | { status: "stamped"; detail: string }
  | { status: "suppressed"; detail: string }
  | { status: "unmatched"; detail: string };

/**
 * Apply a verified Resend event: stamp the dispatch_log delivery column and,
 * for hard bounce / complaint, add an email_suppressions row.
 *
 * Idempotent: stamping a column to the event timestamp and upserting the
 * (user_id, email_address) suppression are both safe to replay (Resend retries
 * on non-2xx). Degrades quietly — a missing dispatch_log row (auth/SMTP mail)
 * or an unresolvable user is logged, not thrown.
 */
export async function applyResendEvent(
  admin: SupabaseClient,
  event: ResendWebhookEvent,
): Promise<ApplyResult> {
  const column = EVENT_COLUMN[event.type];
  if (!column) return { status: "ignored", detail: event.type };

  const ts = eventTimestamp(event);
  const emailId = event.data?.email_id ?? null;
  const address = firstRecipient(event);

  // Stamp the matching dispatch_log row(s) and learn the recipient identity.
  // `tenant_id` rides along on the same select so the suppression branch below
  // can file a workspace-visible audit row without a second query.
  let matchedUserId: string | null = null;
  let matchedTenantId: string | null = null;
  if (emailId) {
    const { data, error } = await admin
      .from("notification_dispatch_log")
      .update({ [column]: ts })
      .eq("provider_reference", emailId)
      .select("recipient_user_id, recipient_email, tenant_id");
    if (error) {
      logServerError("notifications.webhook.stamp", error);
    } else {
      const rows =
        (data as Array<{
          recipient_user_id: string | null;
          tenant_id: string | null;
        }> | null) ?? [];
      matchedUserId = rows.find((r) => r.recipient_user_id)?.recipient_user_id ?? null;
      matchedTenantId = rows.find((r) => r.tenant_id)?.tenant_id ?? null;
    }
  }

  const reason = suppressionReasonFor(event);
  if (!reason) {
    return { status: "stamped", detail: `${event.type}:${emailId ?? "no-id"}` };
  }

  // The address is the real grain. A user id is preferred (a user who changed
  // email should get a fresh slate on the new address), but it is NOT required:
  // guest support and invitees are mailed with no account at all, and requiring
  // a user here meant their hard bounces suppressed nothing and the dead address
  // kept being mailed. Only a missing ADDRESS is unworkable.
  let userId = matchedUserId;
  if (!userId && address) {
    userId = await resolveUserIdByEmail(admin, address);
  }
  if (!address) {
    return { status: "unmatched", detail: `${event.type}:no-address` };
  }

  // Two conflict targets: the (user_id, email_address) constraint cannot dedupe
  // user-less rows because NULLs compare as distinct, so those go through the
  // partial unique index on lower(email_address) WHERE user_id IS NULL.
  const { error: supErr } = await admin.from("email_suppressions").upsert(
    {
      user_id: userId,
      email_address: address,
      reason,
      source: emailId,
    },
    {
      onConflict: userId ? "user_id,email_address" : "email_address",
      ignoreDuplicates: true,
    },
  );
  if (supErr) {
    logServerError("notifications.webhook.suppress", supErr);
    return { status: "unmatched", detail: `suppress-failed:${reason}` };
  }
  // Workspace-visible: a suppressed address stops receiving mail from here on,
  // so the workspace needs to see WHY the client stopped getting emails.
  // Only this branch logs — delivered / opened / clicked returned `stamped`
  // above and stay out of the activity log.
  auditFailure(
    matchedTenantId,
    "messages",
    reason === "complaint" ? "messages.email.complaint" : "messages.email.bounced",
    reason === "complaint"
      ? `${address} marked an email as spam`
      : `Email to ${address} hard bounced`,
    {
      targetType: "email_address",
      targetId: userId,
      targetLabel: address,
      metadata: { provider: "resend", suppressionReason: reason },
    },
  );
  return { status: "suppressed", detail: `${reason}:${address}` };
}

/** Most-recent account-holder we've emailed at this address, or null (guest). */
async function resolveUserIdByEmail(
  admin: SupabaseClient,
  address: string,
): Promise<string | null> {
  const safe = address.toLowerCase().replace(/([%_\\])/g, "\\$1");
  const { data, error } = await admin
    .from("notification_dispatch_log")
    .select("recipient_user_id")
    .eq("channel", "email")
    .not("recipient_user_id", "is", null)
    .ilike("recipient_email", safe)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    logServerError("notifications.webhook.resolveUser", error);
    return null;
  }
  return (data as { recipient_user_id: string | null } | null)?.recipient_user_id ?? null;
}
