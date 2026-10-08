/**
 * Pure rules for a client replying from `/account/messages/<thread>` (TUL-62).
 * No I/O: who may reply and what a reply body may be.
 */

import { isClientAccountEligible } from "./pure";

/** Same cap as the guest chat (`MAX_BODY` in guest-chat-actions). */
export const MAX_REPLY_CHARS = 10_000;

export type ReplyFacts = { inquiryTenantId: string | null; inquiryClientUserId: string | null };

export type ReplyDecision =
  | { ok: true; body: string }
  | { ok: false; reason: "not_signed_in" | "not_client" | "wrong_tenant" | "not_owner" | "empty" | "too_long" };

/** Plain text only: strips control characters (keeps newline and tab), trims. */
export function normalizeReplyBody(raw: string): string {
  // eslint-disable-next-line no-control-regex
  return raw.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
}

/**
 * Owner of the thread (the session user is the inquiry's client), a client
 * account (never talent or staff), and the thread belongs to the tenant the
 * server resolved from the host. Everything else is a refusal with ONE reason.
 */
export function canReplyToThread(input: {
  sessionUserId: string | null | undefined;
  appRole: string | null | undefined;
  siteTenantId: string | null | undefined;
  inquiry: ReplyFacts;
  body: string;
}): ReplyDecision {
  if (!input.sessionUserId) return { ok: false, reason: "not_signed_in" };
  if (!isClientAccountEligible(input.appRole)) return { ok: false, reason: "not_client" };
  const q = input.inquiry;
  if (!input.siteTenantId || !q.inquiryTenantId || q.inquiryTenantId !== input.siteTenantId) {
    return { ok: false, reason: "wrong_tenant" };
  }
  if (!q.inquiryClientUserId || q.inquiryClientUserId !== input.sessionUserId) {
    return { ok: false, reason: "not_owner" };
  }
  const body = normalizeReplyBody(input.body);
  if (!body) return { ok: false, reason: "empty" };
  if (body.length > MAX_REPLY_CHARS) return { ok: false, reason: "too_long" };
  return { ok: true, body };
}
