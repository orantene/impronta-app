import "server-only";

import * as React from "react";
import { Text } from "@react-email/components";
import { resolveTenantBrand } from "@/lib/brand/resolve-tenant-brand";
import { renderEmailHtml } from "@/lib/email/render";
import { sendEmailResult } from "@/lib/email";
import { Layout } from "../../../../emails/components/Layout";
import {
  buildUnsubscribeApiUrl,
  buildUnsubscribeUrl,
  getUnsubscribeToken,
} from "../unsubscribe";
import {
  loadTemplateOverrides,
  getTemplateOverride,
  interpolateOverride,
} from "../overlay";
import { logServerError } from "@/lib/server/safe-error";
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

  // Code defaults — the source of truth and the fallback.
  let subject = cfg.subject(event, recipient);
  let element = cfg.render({ event, recipient, brand, unsubscribeUrl });

  // P3b editable templates: an admin can override subject/body per (entry, locale)
  // without a deploy. Body text renders as React text children (auto-escaped, so
  // XSS-safe) inside the branded Layout. ANY failure falls back to the code
  // template — a bad override can never break the send path.
  try {
    const override = getTemplateOverride(
      await loadTemplateOverrides(ctx.admin),
      entry.id,
      brand.locale ?? "en", // tenant default_locale — there's no per-user locale
    );
    if (override) {
      const vars = { name: recipient.displayName, brand: brand.accountName };
      if (override.subject?.trim()) subject = interpolateOverride(override.subject, vars);
      if (override.body?.trim()) {
        const paragraphs = interpolateOverride(override.body, vars)
          .split(/\n{2,}/)
          .map((p) => p.trim())
          .filter(Boolean);
        // children-in-props is required by createElement here (this is a .ts
        // module, so JSX is unavailable); the Layout's `children` prop is typed
        // required. eslint-disable is the localized, intentional exception.
        // eslint-disable-next-line react/no-children-prop
        element = React.createElement(Layout, {
          preview: subject,
          brand,
          unsubscribeUrl,
          categoryLabel: unsubscribeUrl ? entry.category : undefined,
          children: paragraphs.map((p, i) =>
            React.createElement(
              Text,
              { key: i, style: { margin: "0 0 16px", fontSize: "15px", color: "#444444", lineHeight: 1.6 } },
              p,
            ),
          ),
        });
      }
    }
  } catch (err) {
    logServerError(`notifications.email.override:${entry.id}`, err);
    subject = cfg.subject(event, recipient);
    element = cfg.render({ event, recipient, brand, unsubscribeUrl });
  }

  const html = await renderEmailHtml(element);

  const result = await sendEmailResult({
    to: recipient.email,
    subject,
    html,
    headers,
    // Tenant-scoped notification: a tenant with white_label_email + a VERIFIED
    // sending domain sends from its own branded address (resolveTenantEmailFrom),
    // otherwise the platform default.
    tenantId: event.tenantId,
    tenantName: brand.accountName ?? null,
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
