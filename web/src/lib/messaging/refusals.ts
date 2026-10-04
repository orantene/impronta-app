import type { MessagingRefusal } from "./types";

export const MESSAGING_REFUSAL_CODES = [
  "conflict",
  "not_found",
  "wrong_tenant",
  "invalid",
  "unavailable",
  "channel_unavailable",
  "template_required",
  "rate_limited",
  "checkout_locked",
  "already_resolved",
  "no_owner",
  "identity_unconfirmed",
  "already_linked",
  "version_stale",
  "payment_unknown",
  "already_paid",
  "hold_ended",
  "basket_changed",
  "not_allowed",
  "not_her_sale",
  "expired",
  "already",
  "deposit_required",
  "no_payout_receiver",
] as const satisfies readonly MessagingRefusal[];

export function refusalKey(code: MessagingRefusal): `dashboard.pos.messages.refusal.${MessagingRefusal}` {
  return `dashboard.pos.messages.refusal.${code}`;
}

export function isMessagingRefusal(value: string): value is MessagingRefusal {
  return (MESSAGING_REFUSAL_CODES as readonly string[]).includes(value);
}

export function fail(
  reason: MessagingRefusal,
  extra?: { nextFreeTimes?: string[] },
): { ok: false; reason: MessagingRefusal; nextFreeTimes?: string[] } {
  if (extra?.nextFreeTimes) return { ok: false, reason, nextFreeTimes: extra.nextFreeTimes };
  return { ok: false, reason };
}
