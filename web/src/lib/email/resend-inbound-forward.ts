import "server-only";

import { getResendClient } from "@/lib/email/resend-client";
import { isValidAuthEmail } from "@/lib/auth/otp-flow";
import { sendEmailResult } from "@/lib/email";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";

/** Cap stored HTML/text so a single inbound cannot blow up a row. */
export const INBOUND_BODY_STORE_BYTES = 200_000;

export type ResendInboundWebhookEvent = {
  type: string;
  data?: {
    email_id?: string;
    from?: string;
    to?: string | string[];
    subject?: string;
  };
};

export type InboundForwardStatus = "pending" | "sent" | "failed" | "skipped";

export type InboundProcessResult = {
  ok: boolean;
  detail: string;
  stored: boolean;
  rowId?: string;
  forwardStatus?: InboundForwardStatus;
};

/**
 * Forward target comes ONLY from RESEND_INBOUND_FORWARD_TO. Returns null when
 * the variable is unset or is not exactly one plausible email address (lists,
 * inner whitespace and display names are all rejected).
 */
export function resolveInboundForwardTo(): string | null {
  const raw = process.env.RESEND_INBOUND_FORWARD_TO?.trim();
  if (!raw) return null;
  if (/[\s,;<>]/.test(raw)) return null;
  return isValidAuthEmail(raw) ? raw : null;
}

export const INBOUND_FORWARD_SKIPPED_REASON =
  "forward skipped: RESEND_INBOUND_FORWARD_TO unset or invalid";

let warnedForwardUnset = false;

function warnForwardSkippedOnce(): void {
  if (warnedForwardUnset) return;
  warnedForwardUnset = true;
  // eslint-disable-next-line no-console
  console.warn("inbound forward skipped: RESEND_INBOUND_FORWARD_TO unset");
}

export function normalizeToAddresses(
  value: string | string[] | null | undefined,
): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    return value.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

export function truncateBody(
  value: string | null | undefined,
  maxBytes: number = INBOUND_BODY_STORE_BYTES,
): { text: string | null; truncated: boolean } {
  if (value == null) return { text: null, truncated: false };
  const buf = Buffer.from(value, "utf8");
  if (buf.byteLength <= maxBytes) return { text: value, truncated: false };
  return {
    text: buf.subarray(0, maxBytes).toString("utf8"),
    truncated: true,
  };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildForwardHtml(params: {
  originalTo: string;
  from: string;
  subject: string;
  bodyHtml: string | null;
  bodyText: string | null;
}): string {
  const body =
    params.bodyHtml?.trim() ||
    (params.bodyText
      ? `<pre style="white-space:pre-wrap;font-family:ui-monospace,monospace">${escapeHtml(params.bodyText)}</pre>`
      : "<p><em>No body</em></p>");
  return [
    `<p style="font-size:13px;color:#666">Forwarded from Tulala inbound (<strong>${escapeHtml(params.originalTo)}</strong>)</p>`,
    `<p style="font-size:13px;color:#666">From: ${escapeHtml(params.from)} · Subject: ${escapeHtml(params.subject)}</p>`,
    "<hr />",
    body,
  ].join("\n");
}

type StoreRow = {
  id: string;
  forward_status: InboundForwardStatus;
};

type InboundStore = {
  upsertInbound: (row: {
    resend_email_id: string;
    message_id: string | null;
    from_address: string;
    to_addresses: string[];
    subject: string;
    body_text: string | null;
    body_html: string | null;
    body_truncated: boolean;
    forward_to: string | null;
    provider_payload: Record<string, unknown>;
  }) => Promise<StoreRow | null>;
  markForward: (
    id: string,
    status: InboundForwardStatus,
    error: string | null,
  ) => Promise<void>;
};

function createDbStore(): InboundStore | null {
  const admin = createServiceRoleClient();
  if (!admin) return null;

  return {
    async upsertInbound(row) {
      const { data, error } = await admin
        .from("resend_inbound_emails")
        .upsert(
          {
            resend_email_id: row.resend_email_id,
            message_id: row.message_id,
            from_address: row.from_address,
            to_addresses: row.to_addresses,
            subject: row.subject,
            body_text: row.body_text,
            body_html: row.body_html,
            body_truncated: row.body_truncated,
            forward_to: row.forward_to,
            provider_payload: row.provider_payload,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "resend_email_id" },
        )
        .select("id, forward_status")
        .maybeSingle();

      if (error) {
        logServerError("resend.inbound.store", error);
        return null;
      }
      if (!data?.id) return null;
      return {
        id: data.id as string,
        forward_status: (data.forward_status as InboundForwardStatus) ?? "pending",
      };
    },

    async markForward(id, status, errorMessage) {
      const { error } = await admin
        .from("resend_inbound_emails")
        .update({
          forward_status: status,
          forward_error: errorMessage,
          forwarded_at:
            status === "sent" ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) logServerError("resend.inbound.markForward", error);
    },
  };
}

/**
 * Fetch a received message from Resend, persist it, then best-effort forward
 * to the env-configured target (skipped when unset). Persistence is the retention guarantee; forward is
 * convenience until Support Desk Phase 3.
 */
export async function processResendInboundEmail(
  event: ResendInboundWebhookEvent,
  deps?: {
    store?: InboundStore | null;
    fetchInbound?: (emailId: string) => Promise<{
      data: {
        to?: string | string[];
        from?: string;
        subject?: string;
        html?: string | null;
        text?: string | null;
        message_id?: string | null;
      } | null;
      error: unknown;
    }>;
    sendForward?: typeof sendEmailResult;
  },
): Promise<InboundProcessResult> {
  if (event.type !== "email.received") {
    return { ok: false, detail: "not an inbound event", stored: false };
  }

  const emailId = event.data?.email_id?.trim();
  if (!emailId) {
    return { ok: false, detail: "missing email_id", stored: false };
  }

  const fetchInbound =
    deps?.fetchInbound ??
    (async (id: string) => {
      const resend = getResendClient();
      if (!resend) return { data: null, error: new Error("RESEND_API_KEY unset") };
      return resend.emails.receiving.get(id);
    });

  const { data, error } = await fetchInbound(emailId);
  if (error || !data) {
    logServerError("resend.inbound.get", error ?? new Error("no inbound payload"));
    return { ok: false, detail: "inbound fetch failed", stored: false };
  }

  const toAddresses = normalizeToAddresses(
    data.to ?? event.data?.to ?? fallbackTo(event),
  );
  const from = String(data.from ?? event.data?.from ?? "unknown");
  const subject = String(data.subject ?? event.data?.subject ?? "(no subject)");
  const textPart = truncateBody(
    typeof data.text === "string" ? data.text : null,
  );
  const htmlPart = truncateBody(
    typeof data.html === "string" ? data.html : null,
  );
  const bodyTruncated = textPart.truncated || htmlPart.truncated;
  const forwardTo = resolveInboundForwardTo();

  const store = deps?.store === undefined ? createDbStore() : deps.store;
  if (!store) {
    return {
      ok: false,
      detail: "inbound store unavailable (no service role)",
      stored: false,
    };
  }

  const stored = await store.upsertInbound({
    resend_email_id: emailId,
    message_id:
      typeof data.message_id === "string" ? data.message_id : null,
    from_address: from,
    to_addresses: toAddresses,
    subject,
    body_text: textPart.text,
    body_html: htmlPart.text,
    body_truncated: bodyTruncated,
    forward_to: forwardTo,
    provider_payload: {
      resend_email_id: emailId,
      webhook_to: event.data?.to ?? null,
      webhook_from: event.data?.from ?? null,
    },
  });

  if (!stored) {
    return { ok: false, detail: "inbound store write failed", stored: false };
  }

  // Already forwarded on a prior webhook delivery — do not re-send.
  if (stored.forward_status === "sent") {
    return {
      ok: true,
      detail: `already stored+forwarded ${emailId}`,
      stored: true,
      rowId: stored.id,
      forwardStatus: "sent",
    };
  }

  if (!forwardTo) {
    warnForwardSkippedOnce();
    await store.markForward(stored.id, "skipped", INBOUND_FORWARD_SKIPPED_REASON);
    return {
      ok: true,
      detail: `stored ${emailId}; forward skipped: no forward target configured`,
      stored: true,
      rowId: stored.id,
      forwardStatus: "skipped",
    };
  }

  const originalTo = toAddresses.join(", ") || "unknown";
  const html = buildForwardHtml({
    originalTo,
    from,
    subject,
    bodyHtml: htmlPart.text,
    bodyText: textPart.text,
  });

  const send = deps?.sendForward ?? sendEmailResult;
  const result = await send({
    to: forwardTo,
    subject: `[Tulala inbound] ${subject}`,
    html,
    replyTo: from.includes("@") ? from : undefined,
  });

  if (result.status === "sent") {
    await store.markForward(stored.id, "sent", null);
    return {
      ok: true,
      detail: `stored+forwarded ${emailId} to ${forwardTo}`,
      stored: true,
      rowId: stored.id,
      forwardStatus: "sent",
    };
  }

  const failStatus: InboundForwardStatus =
    result.status === "skipped" ? "skipped" : "failed";
  const failDetail =
    result.status === "failed"
      ? result.error
      : `forward skipped (${result.reason ?? "unknown"})`;
  await store.markForward(stored.id, failStatus, failDetail);

  // Stored = success for retention. Forward failure must NOT drop the mail.
  return {
    ok: true,
    detail: `stored ${emailId}; forward ${failStatus}: ${failDetail}`,
    stored: true,
    rowId: stored.id,
    forwardStatus: failStatus,
  };
}

/** @deprecated Prefer processResendInboundEmail — kept for call-site clarity. */
export async function forwardResendInboundEmail(
  event: ResendInboundWebhookEvent,
): Promise<InboundProcessResult> {
  return processResendInboundEmail(event);
}

function fallbackTo(event: ResendInboundWebhookEvent): string {
  const to = event.data?.to;
  if (Array.isArray(to)) return to.join(", ");
  if (typeof to === "string") return to;
  return "unknown";
}
