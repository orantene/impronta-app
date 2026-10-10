import "server-only";

/**
 * The one seam between Tulala and a WhatsApp Business provider (TUL-225, design
 * docs/plans/whatsapp-channel-design.md section 5.2). Twilio first; a Meta Cloud API
 * adapter can replace it behind the same shape. Only adapters import a provider SDK
 * (pinned by provider.test.ts).
 *
 * Business-initiated messages to a talent must use a provider-approved template
 * (`sendTemplate`); free text (`sendText`) only reaches the platform owner's own
 * number, the existing support alert.
 */

export type WhatsAppSendResult = { ok: true; providerReference: string } | { ok: false; reason: "not_configured" | "invalid_input" };

/** Delivery states we keep, in the order a message moves through them. */
export const WHATSAPP_STATUS_ORDER = ["queued", "sent", "delivered", "read"] as const;
export type WhatsAppDeliveryStatus = (typeof WHATSAPP_STATUS_ORDER)[number] | "failed";

export type WhatsAppStatusUpdate = {
  providerReference: string;
  status: WhatsAppDeliveryStatus;
  errorCode: string | null;
  to: string | null;
};

export interface WhatsAppProvider {
  readonly name: "twilio";
  /** A pre-approved template (Twilio Content SID) with its numbered variables, e.g. {"1": "Valeria"}. */
  sendTemplate(input: { to: string; templateId: string; variables: Record<string, string>; statusCallbackUrl?: string | null }): Promise<WhatsAppSendResult>;
  /** Free text. Owner alert only: WhatsApp refuses free text outside a 24-hour customer window. */
  sendText(input: { to: string; body: string }): Promise<WhatsAppSendResult>;
  /** True when the callback really came from the provider for this exact URL and form body. */
  verifySignature(input: { url: string; signature: string | null; params: Record<string, string> }): Promise<boolean>;
  /** A status callback's form body as our status, or null when it is not a message status. */
  parseStatus(params: Record<string, string>): WhatsAppStatusUpdate | null;
}

/**
 * A status update may only move a message forward: a late "delivered" after "read"
 * is ignored, and "failed" is final (design 5.4, replay-safe webhooks).
 */
export function isStatusAdvance(current: WhatsAppDeliveryStatus | null, next: WhatsAppDeliveryStatus): boolean {
  if (current === null) return true;
  if (current === "failed") return false;
  if (next === "failed") return true;
  const rank = (s: WhatsAppDeliveryStatus) => WHATSAPP_STATUS_ORDER.indexOf(s as (typeof WHATSAPP_STATUS_ORDER)[number]);
  return rank(next) > rank(current);
}

/** Twilio addresses WhatsApp numbers as `whatsapp:+<E.164>`; a value that already has the prefix is kept. */
export function whatsappAddress(raw: string): string | null {
  const v = raw.trim();
  const number = v.toLowerCase().startsWith("whatsapp:") ? v.slice("whatsapp:".length).trim() : v;
  if (!/^\+[1-9]\d{6,14}$/.test(number)) return null;
  return `whatsapp:${number}`;
}
