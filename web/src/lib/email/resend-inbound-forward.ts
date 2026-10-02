import "server-only";

import { getResendClient } from "@/lib/email/resend-client";
import { sendEmailResult } from "@/lib/email";
import { logServerError } from "@/lib/server/safe-error";

/** Platform inbox for inbound mail forwarded from Resend receiving. */
export const DEFAULT_INBOUND_FORWARD_TO = "orantene@gmail.com";

export type ResendInboundWebhookEvent = {
  type: string;
  data?: {
    email_id?: string;
    from?: string;
    to?: string | string[];
    subject?: string;
  };
};

export function resolveInboundForwardTo(): string {
  return (
    process.env.RESEND_INBOUND_FORWARD_TO?.trim() ||
    DEFAULT_INBOUND_FORWARD_TO
  );
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

/**
 * Fetch a received message from Resend and forward it to the platform Gmail.
 * Used by the `email.received` webhook (Track C receiving).
 */
export async function forwardResendInboundEmail(
  event: ResendInboundWebhookEvent,
): Promise<{ ok: boolean; detail: string }> {
  if (event.type !== "email.received") {
    return { ok: false, detail: "not an inbound event" };
  }

  const emailId = event.data?.email_id?.trim();
  if (!emailId) return { ok: false, detail: "missing email_id" };

  const resend = getResendClient();
  if (!resend) return { ok: false, detail: "RESEND_API_KEY unset" };

  const { data, error } = await resend.emails.receiving.get(emailId);
  if (error || !data) {
    logServerError("resend.inbound.get", error ?? new Error("no inbound payload"));
    return { ok: false, detail: "inbound fetch failed" };
  }

  const originalTo = Array.isArray(data.to)
    ? data.to.join(", ")
    : String(data.to ?? event.data?.to ?? SUPPORT_FALLBACK_TO(event));
  const from = String(data.from ?? event.data?.from ?? "unknown");
  const subject = String(data.subject ?? event.data?.subject ?? "(no subject)");
  const forwardTo = resolveInboundForwardTo();

  const html = buildForwardHtml({
    originalTo,
    from,
    subject,
    bodyHtml: typeof data.html === "string" ? data.html : null,
    bodyText: typeof data.text === "string" ? data.text : null,
  });

  const result = await sendEmailResult({
    to: forwardTo,
    subject: `[Tulala inbound] ${subject}`,
    html,
    replyTo: from.includes("@") ? from : undefined,
  });

  if (result.status === "failed") {
    return { ok: false, detail: result.error };
  }
  if (result.status === "skipped") {
    return { ok: false, detail: `forward skipped (${result.reason ?? "unknown"})` };
  }

  return { ok: true, detail: `forwarded ${emailId} to ${forwardTo}` };
}

function SUPPORT_FALLBACK_TO(event: ResendInboundWebhookEvent): string {
  const to = event.data?.to;
  if (Array.isArray(to)) return to.join(", ");
  if (typeof to === "string") return to;
  return "unknown";
}
