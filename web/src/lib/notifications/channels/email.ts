import "server-only";

import { resolveTenantBrand } from "@/lib/brand/resolve-tenant-brand";
import { renderEmailHtml } from "@/lib/email/render";
import { sendEmail } from "@/lib/email";
import { buildUnsubscribeUrl, getUnsubscribeToken } from "../unsubscribe";
import type {
  AudienceContext,
  CatalogEntry,
  NotificationEvent,
  ResolvedRecipient,
} from "../types";

/**
 * Email channel handler.
 *
 * Resolves the tenant brand, builds a per-category one-click unsubscribe link
 * (non-required categories with a known user only), renders the catalog
 * entry's React Email template, and hands the HTML to `sendEmail`.
 *
 * `sendEmail` no-ops gracefully when `RESEND_API_KEY` is unset, so this runs
 * end-to-end in dev — the send is simply skipped and logged.
 */
export async function sendEmailNotification(
  event: NotificationEvent,
  entry: CatalogEntry,
  recipient: ResolvedRecipient,
  ctx: AudienceContext,
): Promise<void> {
  const cfg = entry.email;
  if (!cfg || !recipient.email) return;

  const brand = await resolveTenantBrand(event.tenantId);

  let unsubscribeUrl: string | undefined;
  if (!entry.required && recipient.userId) {
    const token = await getUnsubscribeToken(ctx.admin, recipient.userId);
    if (token) unsubscribeUrl = buildUnsubscribeUrl(token, entry.category);
  }

  const element = cfg.render({ event, recipient, brand, unsubscribeUrl });
  const html = await renderEmailHtml(element);

  await sendEmail({
    to: recipient.email,
    subject: cfg.subject(event, recipient),
    html,
  });
}
