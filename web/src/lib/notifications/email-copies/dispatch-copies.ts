import "server-only";

import { resolveTenantBrand, type EmailBrand } from "@/lib/brand/resolve-tenant-brand";
import { renderEmailHtml } from "@/lib/email/render";
import { sendEmailResult } from "@/lib/email";
import { logServerError } from "@/lib/server/safe-error";
import { improntaLog } from "@/lib/server/structured-log";
import type {
  AudienceContext,
  CatalogEntry,
  NotificationEvent,
  ResolvedRecipient,
} from "../types";
import { copyKindForEntry } from "./kinds";
import { loadActiveCopyRecipients } from "./recipients";

export const COPY_SUBJECT_PREFIX = "[Copy] ";

/**
 * Synthetic English recipient for rendering a copy. No userId (so no account
 * unsubscribe token), platform-admin role (copies are an ops feed).
 */
export function copyRecipient(email: string): ResolvedRecipient {
  return {
    userId: null,
    email,
    displayName: null,
    locale: "en",
    localeIsExplicit: true,
    isPlatformAdmin: true,
    role: "platform_admin",
    dedupeId: `copy:${email}`,
  };
}

/**
 * Send ONE copy per active list recipient for this (event, entry). Best-effort:
 * never throws and never touches the dispatcher's result counts.
 *
 * Rendering reuses the entry's own email config (cfg.subject + cfg.render, the
 * same code defaults the email channel uses) with a synthetic English
 * recipient, no unsubscribe link, and no admin template override.
 *
 * Idempotency: copies are NOT written to notification_dispatch_log. That log
 * feeds the retry cron, the digest sweep, the send log and the Resend webhook
 * mapping, all of which assume a row targets a real audience member of the
 * entry; a copy row would be re-sent by retry through the entry's audience
 * path. A re-dispatched event can therefore send a duplicate copy.
 */
export async function sendNotificationCopies(
  event: NotificationEvent,
  entry: CatalogEntry,
  ctx: AudienceContext,
): Promise<void> {
  try {
    const kind = copyKindForEntry(entry.id);
    if (!kind || (!entry.email && !entry.in_app)) return;
    const targets = await loadActiveCopyRecipients(kind, ctx.admin);
    if (targets.length === 0) return;

    const tenantBrand = await resolveTenantBrand(event.tenantId);
    const brand = { ...tenantBrand, locale: "en", recipientHasAccount: false };

    for (const email of targets) {
      try {
        const recipient = copyRecipient(email);
        const rendered = await renderCopy(event, entry, recipient, brand);
        if (!rendered) continue;
        const subject = `${COPY_SUBJECT_PREFIX}${rendered.subject}`;
        const html = rendered.html;
        const result = await sendEmailResult({ to: email, subject, html, tenantId: null });
        void improntaLog("notif.copy.email", {
          eventType: event.type,
          eventId: event.eventId,
          entryId: entry.id,
          kind,
          status: result.status,
        });
        if (result.status === "failed") {
          logServerError(`notifications.copy:${entry.id}`, new Error(result.error));
        }
      } catch (err) {
        logServerError(`notifications.copy:${entry.id}`, err);
      }
    }
  } catch (err) {
    logServerError(`notifications.copy:${entry.id}`, err);
  }
}

/**
 * Subject + HTML for one copy. Email entries reuse their own template; in-app
 * only entries (refund.failed / payment.needs_attention) get a plain email
 * built from the in-app title and body.
 */
async function renderCopy(
  event: NotificationEvent,
  entry: CatalogEntry,
  recipient: ResolvedRecipient,
  brand: EmailBrand,
): Promise<{ subject: string; html: string } | null> {
  if (entry.email) {
    return {
      subject: entry.email.subject(event, recipient),
      html: await renderEmailHtml(
        entry.email.render({ event, recipient, brand, unsubscribeUrl: undefined }),
      ),
    };
  }
  if (entry.in_app) {
    const title = entry.in_app.title(event, recipient);
    const body = entry.in_app.body?.(event, recipient) ?? "";
    return { subject: title, html: plainCopyHtml(title, body, entry.id) };
  }
  return null;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function plainCopyHtml(title: string, body: string, entryId: string): string {
  return [
    `<div style="font-family:Inter,system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px">`,
    `<h2 style="margin:0 0 12px;font-size:18px">${escapeHtml(title)}</h2>`,
    body ? `<p style="margin:0 0 12px;font-size:14px;line-height:1.5">${escapeHtml(body)}</p>` : "",
    `<p style="margin:16px 0 0;font-size:12px;opacity:0.7">Copy of notification ${escapeHtml(entryId)}</p>`,
    `</div>`,
  ].join("");
}
