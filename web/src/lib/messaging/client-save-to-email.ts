import "server-only";

/**
 * Token-identity "Save this conversation to your email" (closes D-MSG-166b).
 * The link holder already proved ownership via `verifyThreadToken`; this mails
 * the SAME `/c/t/<token>?from=email` URL to the inquiry's contact email so they
 * can reopen it later. No guest cookie session required.
 */

import { sendEmailResult } from "@/lib/email";
import { resolveTenantBrand } from "@/lib/brand/resolve-tenant-brand";
import { logServerError } from "@/lib/server/safe-error";
import { customerThreadUrl, HUB_THREAD_ORIGIN, conversationHostKind, threadLinkUrl } from "@/lib/messaging/thread-link";
import type { MessagingRefusal } from "@/lib/messaging/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";

export type SaveConversationToEmailResult =
  | { ok: true; email: string }
  | { ok: false; reason: MessagingRefusal };

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildSaveEmailHtml(input: {
  businessName: string;
  threadUrl: string;
  guestName: string | null;
  brand: { wordmark: string; accountName: string; footerDomain: string; homeHref: string };
}): { subject: string; html: string } {
  const greeting = input.guestName?.trim()
    ? `Hi ${escapeHtml(input.guestName.trim().split(/\s+/)[0] ?? input.guestName.trim())}`
    : "Hi";
  const business = escapeHtml(input.businessName);
  const subject = `Your conversation with ${input.businessName}`;
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#f9f9f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:560px;" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding-bottom:24px;text-align:center;">
              <a href="${escapeHtml(input.brand.homeHref)}" style="font-family:Georgia,serif;font-size:18px;letter-spacing:0.2em;color:#1a1a1a;text-decoration:none;font-weight:600;">${escapeHtml(input.brand.wordmark)}</a>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;border-radius:12px;border:1px solid #e5e5e5;padding:32px 32px 28px;">
              <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#1a1a1a;">Conversation saved</h2>
              <p style="margin:0 0 16px;font-size:15px;color:#444444;line-height:1.6;">
                ${greeting}, here is your private link back to your conversation with <strong>${business}</strong>.
              </p>
              <a href="${escapeHtml(input.threadUrl)}" style="display:inline-block;margin-top:8px;padding:12px 24px;background:#0b0b0d;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">Open conversation</a>
              <p style="margin:16px 0 0;font-size:12px;color:#888888;">Keep this link private. Anyone with it can see and reply in this conversation.</p>
            </td>
          </tr>
          <tr>
            <td style="padding-top:20px;text-align:center;font-size:12px;color:#888888;">
              You received this because you asked to save a conversation with ${escapeHtml(input.brand.accountName)}.
              <br/>
              <a href="${escapeHtml(input.brand.homeHref)}" style="color:#888888;">${escapeHtml(input.brand.footerDomain)}</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  return { subject, html };
}

/**
 * Resolve the absolute client-link URL for this inquiry. Talent-site origins
 * 404 `/c/t`, so those always mint on the hub (same rule as `threadLinkUrl`).
 */
export function conversationSaveUrl(input: {
  token: string;
  sourceContext: unknown;
  requestOrigin?: string | null;
}): string | null {
  const base =
    threadLinkUrl({
      token: input.token,
      requestOrigin: (input.requestOrigin ?? "").trim() || HUB_THREAD_ORIGIN,
      conversationHostKind: conversationHostKind(input.sourceContext),
    }) ?? customerThreadUrl(HUB_THREAD_ORIGIN, input.token);
  if (!base) return null;
  const joiner = base.includes("?") ? "&" : "?";
  return `${base}${joiner}from=email`;
}

export async function saveConversationToEmail(
  admin: SupabaseClient,
  input: {
    tenantId: string;
    inquiryId: string;
    token: string;
    requestOrigin?: string | null;
  },
): Promise<SaveConversationToEmailResult> {
  const { data, error } = await tenantScopedQuery(admin, "inquiries", input.tenantId)
    .select("id, contact_email, contact_name, source_context")
    .eq("id", input.inquiryId)
    .maybeSingle();
  if (error) {
    logServerError("client-save-to-email/readInquiry", error);
    return { ok: false, reason: "unavailable" };
  }
  const row = data as {
    id: string;
    contact_email: string | null;
    contact_name: string | null;
    source_context: unknown;
  } | null;
  if (!row) return { ok: false, reason: "not_found" };

  const email = (row.contact_email ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) return { ok: false, reason: "invalid" };

  const threadUrl = conversationSaveUrl({
    token: input.token,
    sourceContext: row.source_context,
    requestOrigin: input.requestOrigin,
  });
  if (!threadUrl) return { ok: false, reason: "unavailable" };

  // agencies.id IS the tenant id (no tenant_id column); identity uses tenant_id.
  const [{ data: agency }, { data: identity }] = await Promise.all([
    admin.from("agencies").select("display_name").eq("id", input.tenantId).maybeSingle(),
    admin.from("agency_business_identity").select("public_name").eq("tenant_id", input.tenantId).maybeSingle(),
  ]);
  const businessName =
    ((identity as { public_name?: string | null } | null)?.public_name ?? "").trim() ||
    ((agency as { display_name?: string | null } | null)?.display_name ?? "").trim() ||
    "the team";

  const brand = await resolveTenantBrand(input.tenantId);
  const { subject, html } = buildSaveEmailHtml({
    businessName,
    threadUrl,
    guestName: row.contact_name,
    brand,
  });

  const sent = await sendEmailResult({
    to: email,
    subject,
    html,
    tenantId: input.tenantId,
    tenantName: brand.accountName,
  });
  if (sent.status === "sent") return { ok: true, email };
  logServerError(
    "client-save-to-email/send",
    new Error(sent.status === "skipped" ? "RESEND_API_KEY unset" : (sent.error ?? "send_failed")),
  );
  return { ok: false, reason: "channel_unavailable" };
}
