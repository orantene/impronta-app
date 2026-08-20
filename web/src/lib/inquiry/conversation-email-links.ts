import "server-only";

import { getAppUrl } from "@/lib/auth-flow";
import { PLATFORM_BRAND } from "@/lib/platform/brand";
import { signConversationToken } from "./conversation-email-tokens";

/**
 * conversation-email-links.ts — URL builders for the inquiry email loop's two
 * unauthenticated links. Kept apart from the pure token module so the token
 * sign/verify contract stays env-URL-free and unit-testable.
 *
 * Both return null when the signing secret is unset — callers omit the link
 * (the email degrades to the cookie-based /c/{id} CTA and the category
 * unsubscribe footer).
 */

function platformSiteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ?? `https://${PLATFORM_BRAND.domain}`
  ).replace(/\/$/, "");
}

/**
 * The "Log in to continue the conversation" CTA. Lands on the APP host (auth
 * is host-local and the client dashboard lives there); the route exchanges the
 * signed token for a fresh Supabase magic link at click time — no sign-in
 * credential is ever at rest in the email.
 */
export function buildConversationContinueUrl(inquiryId: string): string | null {
  const token = signConversationToken("continue", inquiryId);
  if (!token) return null;
  return `${getAppUrl().replace(/\/$/, "")}/api/conversation/continue?token=${encodeURIComponent(token)}`;
}

/**
 * The "stop email notifications for this conversation" link. Platform host
 * (same convention as the category unsubscribe — the page carries no tenant
 * data and must never 404). `lang` picks the page copy (en/es) so the
 * unsubscribe flow matches the email's language.
 */
export function buildConversationMuteUrl(
  inquiryId: string,
  locale: string | null | undefined,
): string | null {
  const token = signConversationToken("mute", inquiryId);
  if (!token) return null;
  const lang = locale === "es" ? "es" : "en";
  return `${platformSiteUrl()}/unsubscribe/conversation?token=${encodeURIComponent(token)}&lang=${lang}`;
}
