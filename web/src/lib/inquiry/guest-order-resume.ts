/**
 * Guest front-door `?order=` cold load — pure helpers.
 *
 * Staff Messages already resolves `/admin/messages?order=`; the guest dock
 * needs the same deep link on a talent site, gated by guest_session ownership.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Accept only a bare uuid (reject empty / injection / short codes). */
export function parseGuestOrderQuery(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const id = raw.trim();
  return UUID_RE.test(id) ? id : null;
}

export type OrderResumeDecision = "open" | "fallback";

/**
 * PURE: the ONE gate for `?order=` cold load. An order opens its conversation
 * only for the guest session that owns that exact inquiry; everything else
 * (bad code, no session, other session, unlinked order) is the safe fallback
 * (fresh dock, no data about any thread).
 */
export function decideOrderResume(input: {
  parsedOrderId: string | null;
  guestSessionId: string | null;
  inquiryId: string | null;
  inquiryGuestSessionId: string | null;
}): OrderResumeDecision {
  if (!input.parsedOrderId || !input.guestSessionId || !input.inquiryId) return "fallback";
  return input.inquiryGuestSessionId === input.guestSessionId ? "open" : "fallback";
}

export type TokenResumeDecision = "redirect" | "fallback";

/**
 * PURE: the ONE gate for a fresh-browser resume (`?t=<signed thread token>`).
 * The signed token (`/c/t/<token>`, verified server-side) is the only
 * credential; a bare order id never is. It resolves only when the token is
 * valid, minted for THIS host's tenant, and, when an `?order=` rides along,
 * that order belongs to the token's own inquiry. Anything else is the safe
 * fallback (a fresh dock, no data about any thread).
 */
export function decideTokenResume(input: {
  tokenInquiryId: string | null;
  tokenTenantId: string | null;
  hostTenantId: string | null;
  /** Parsed `?order=` when present; null when the link carries only the token. */
  orderId: string | null;
  /** The inquiry that order belongs to on this tenant (null when unknown). */
  orderInquiryId: string | null;
}): TokenResumeDecision {
  if (!input.tokenInquiryId || !input.tokenTenantId || !input.hostTenantId) return "fallback";
  if (input.tokenTenantId !== input.hostTenantId) return "fallback";
  if (input.orderId && input.orderInquiryId !== input.tokenInquiryId) return "fallback";
  return "redirect";
}
