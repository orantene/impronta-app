import type { CapabilityKey } from "@/lib/access";

/**
 * TUL-1708 (messaging extras): the capability each remaining Messages WRITE requires. The default guard capability is
 * `agency.workspace.view`, which the `viewer` role holds. Reads keep the default. The conversation / offer / payment
 * writers in messaging-engine.ts have their own map (`write-capabilities.ts`, #4288). The money writers
 * (refund, discount, cancel record) are already gated by `requirePermission` and are not listed here.
 */
export const MESSAGING_EXTRAS_WRITE_CAPABILITY = {
  startConversation: "create_inquiry",
  createClientForThread: "create_inquiry",
  confirmRecord: "coordinate_inquiry",
  retryDelivery: "coordinate_inquiry",
  reviseOffer: "send_client_offer",
  cancelPaymentLink: "booking.payment.request",
  cancelBooking: "cancel_inquiry",
} as const satisfies Record<string, CapabilityKey>;

export type MessagingExtrasWriteAction = keyof typeof MESSAGING_EXTRAS_WRITE_CAPABILITY;
