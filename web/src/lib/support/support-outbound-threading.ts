import { buildSupportThreading } from "./support-inbound-match";

/**
 * Reply-To plus-token + Message-ID/References for requester-facing support
 * mail. Returns null (no behaviour change) unless BOTH SUPPORT_INBOUND_DOMAIN
 * (a Resend-receiving domain) and GUEST_COOKIE_SECRET are set.
 */
export function supportOutboundThreading(
  entryId: string,
  payload: Record<string, unknown> | null | undefined,
  uniq: string,
  env: Record<string, string | undefined> = process.env,
): { replyTo: string; headers: Record<string, string> } | null {
  if (!entryId.startsWith("support.") || payload?.platformFrom !== true) return null;
  const ticketId = payload.ticketId;
  const domain = env.SUPPORT_INBOUND_DOMAIN?.trim();
  const secret = env.GUEST_COOKIE_SECRET?.trim();
  if (typeof ticketId !== "string" || !domain || !secret) return null;
  try {
    return buildSupportThreading({ ticketId, secret, domain, uniq });
  } catch {
    return null; // non-uuid ticketId: leave the mail untouched
  }
}
