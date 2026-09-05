import "server-only";

import * as React from "react";
import { Text } from "@react-email/components";
import { resolveTenantBrand } from "@/lib/brand/resolve-tenant-brand";
import { renderEmailHtml } from "@/lib/email/render";
import { sendEmailResult } from "@/lib/email";
import { resolveTenantReplyTo } from "@/lib/email/resend-client";
import { Layout } from "../../../../emails/components/Layout";
import {
  buildUnsubscribeApiUrl,
  buildUnsubscribeUrl,
  getUnsubscribeToken,
} from "../unsubscribe";
import {
  getGuestUnsubscribeToken,
  isGuestEmailUnsubscribed,
} from "../guest-unsubscribe";
import {
  loadTemplateOverrides,
  getTemplateOverride,
  interpolateOverride,
} from "../overlay";
import { getEmailSubject, interpolate } from "../email-copy";
import type { EmailBrand } from "@/lib/brand/resolve-tenant-brand";
import { logServerError } from "@/lib/server/safe-error";
/**
 * What this channel reports back: the provider message id plus the envelope it
 * actually sent with, so the dispatcher can record `from` / `replyTo` on the
 * dispatch row. Structurally identical to the dispatcher's ChannelSendOutcome;
 * declared here to avoid a circular import between channel and dispatcher.
 */
export type EmailSendOutcome = {
  providerRef: string | null;
  from: string;
  replyTo: string | null;
};

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
): Promise<EmailSendOutcome | null> {
  const cfg = entry.email;
  if (!cfg || !recipient.email) return null;

  // payload.platformFrom: platform-service mail (e.g. support) must send under
  // the PLATFORM identity even for a tenant-scoped event — a white-label
  // tenant's branded from-address on "Oran replied [Tulala #N]" both leaks
  // the platform through the white-label and misattributes the sender.
  const platformSend = event.payload?.platformFrom === true;
  const brand = await resolveTenantBrand(platformSend ? null : event.tenantId);

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
  } else if (!entry.required && !recipient.userId && recipient.email) {
    if (await isGuestEmailUnsubscribed(ctx.admin, recipient.email)) return null;
    const token = await getGuestUnsubscribeToken(ctx.admin, recipient.email);
    if (token) {
      unsubscribeUrl = buildUnsubscribeUrl(token, entry.category);
      headers = {
        "List-Unsubscribe": `<${buildUnsubscribeApiUrl(token, entry.category)}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      };
    }
  }

  // Code defaults — the source of truth and the fallback.
  // Subject: a baked-in localized subject (EN/ES) when this templateId is
  // translated in email-copy, else the catalog entry's English subject() fn.
  // Body: the template renders EN/ES off brand.locale internally.
  let subject = resolveLocalizedSubject(cfg, event, recipient, brand);
  // The footer used to tell every recipient they had an account with us,
  // including guests and invitees who have none. The channel already knows:
  // it branches on this exact field a few lines up to pick between an account
  // unsubscribe token and a guest one.
  const brandForRecipient = { ...brand, recipientHasAccount: Boolean(recipient.userId) };
  let element = cfg.render({ event, recipient, brand: brandForRecipient, unsubscribeUrl });

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
    subject = resolveLocalizedSubject(cfg, event, recipient, brand);
    element = cfg.render({ event, recipient, brand, unsubscribeUrl });
  }

  const html = await renderEmailHtml(element);

  // Reply-To = the tenant's public contact address, so a customer who hits
  // Reply reaches a mailbox that RECEIVES. Without it the reply goes to the
  // From address (noreply@tulala.digital for any tenant without a verified
  // white-label domain), and tulala.digital has no MX record — so the reply
  // bounces and nobody learns it happened. Undefined for a tenant with no
  // contact email, which leaves the header unset rather than inventing one.
  // Platform sends (no tenant) never carry a tenant's address.
  const replyTo = await resolveTenantReplyTo(platformSend ? null : event.tenantId);

  const result = await sendEmailResult({
    to: recipient.email,
    subject,
    html,
    headers,
    replyTo,
    // Tenant-scoped notification: a tenant with white_label_email + a VERIFIED
    // sending domain sends from its own branded address (resolveTenantEmailFrom),
    // otherwise the platform default. platformFrom payloads always send platform.
    tenantId: platformSend ? null : event.tenantId,
    tenantName: brand.accountName ?? null,
  });
  // Surface a real provider failure so the dispatcher records THIS dispatch_log
  // row as `failed` (its try/catch calls markDispatchLogFailed) instead of
  // masking the lost email as `sent`. A skipped send (no RESEND_API_KEY — dev/
  // test only) returns null; the dispatcher marks that row `skipped`.
  if (result.status === "failed") {
    throw new Error(`Resend send failed for ${entry.id}: ${result.error}`);
  }
  if (result.status !== "sent") return null;
  // Report the envelope we actually sent with. The dispatcher records it on
  // the dispatch_log row, so a later "did that email carry a Reply-To?" is a
  // SQL read rather than a request to open someone's inbox — the exact
  // question we could not answer on 2026-09-05.
  return {
    providerRef: result.id,
    from: result.from,
    replyTo: result.replyTo ?? null,
  };
}

/** String-only vars for subject interpolation: recipient/brand + flat payload. */
function subjectVars(
  event: NotificationEvent,
  recipient: ResolvedRecipient,
  brand: EmailBrand,
): Record<string, string> {
  const vars: Record<string, string> = {
    name: recipient.displayName ?? "",
    brand: brand.accountName ?? "",
  };
  for (const [k, v] of Object.entries(event.payload ?? {})) {
    if (typeof v === "string" || typeof v === "number") vars[k] = String(v);
  }
  return vars;
}

/**
 * Localized subject: the baked-in EN/ES subject for this templateId (with
 * `{placeholder}` interpolation from the event payload), or the catalog entry's
 * English `subject()` fn when the templateId isn't translated yet.
 */
function resolveLocalizedSubject(
  cfg: NonNullable<CatalogEntry["email"]>,
  event: NotificationEvent,
  recipient: ResolvedRecipient,
  brand: EmailBrand,
): string {
  const localized = getEmailSubject(brand.locale, cfg.templateId);
  if (localized) return interpolate(localized, subjectVars(event, recipient, brand));
  return cfg.subject(event, recipient);
}
