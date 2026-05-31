import "server-only";

import { resolveTenantBrand } from "@/lib/brand/resolve-tenant-brand";
import { renderEmailHtml } from "@/lib/email/render";
import { sendEmailResult } from "@/lib/email";
import {
  buildUnsubscribeApiUrl,
  buildUnsubscribeUrl,
  getUnsubscribeToken,
} from "../unsubscribe";
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
 * The send no-ops gracefully when `RESEND_API_KEY` is unset (dev), and a real
 * Resend failure is re-thrown so the dispatcher records the row as `failed`
 * rather than masking the lost email as `sent`.
 *
 * Returns the Resend message id (or null) so the dispatcher can persist it as
 * the dispatch_log `provider_reference` — the key the Resend webhook uses to
 * map delivery/bounce/complaint events back to this exact send.
 */
export async function sendEmailNotification(
  event: NotificationEvent,
  entry: CatalogEntry,
  recipient: ResolvedRecipient,
  ctx: AudienceContext,
): Promise<string | null> {
  const cfg = entry.email;
  if (!cfg || !recipient.email) return null;

  const brand = await resolveTenantBrand(event.tenantId);

  let unsubscribeUrl: string | undefined;
  let headers: Record<string, string> | undefined;
  if (!entry.required && recipient.userId) {
    const token = await getUnsubscribeToken(ctx.admin, recipient.userId);
    if (token) {
      unsubscribeUrl = buildUnsubscribeUrl(token, entry.category);
      // RFC 8058 one-click: the header points at the API POST endpoint while
      // the footer link (unsubscribeUrl) points at the confirm page.
      headers = {
        "List-Unsubscribe": `<${buildUnsubscribeApiUrl(token, entry.category)}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      };
    }
  }

  const element = cfg.render({ event, recipient, brand, unsubscribeUrl });
  const html = await renderEmailHtml(element);

  const result = await sendEmailResult({
    to: recipient.email,
    subject: cfg.subject(event, recipient),
    html,
    headers,
  });
  // Surface a real provider failure so the dispatcher records THIS dispatch_log
  // row as `failed` (its try/catch calls markDispatchLogFailed) instead of
  // masking the lost email as `sent`. A skipped send (no RESEND_API_KEY — dev/
  // test only; prod always has the key) returns null and is logged as sent,
  // which is acceptable for a deliberate no-op.
  if (result.status === "failed") {
    throw new Error(`Resend send failed for ${entry.id}: ${result.error}`);
  }
  return result.status === "sent" ? result.id : null;
}
