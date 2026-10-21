import type { CapabilityKey } from "@/lib/access";

/**
 * TUL-1629: the capability each Messages WRITE requires. The default guard capability is
 * `agency.workspace.view`, which the `viewer` role holds, so a viewer could reply to clients, send offers
 * and request payments. Reads (inbox, thread, search...) keep the default; every writer passes one of these.
 * `coordinate_inquiry`, `send_client_offer` and `booking.payment.request` are manager+ capabilities.
 */
export const MESSAGING_WRITE_CAPABILITY = {
  reply: "coordinate_inquiry",
  internalNote: "coordinate_inquiry",
  rename: "coordinate_inquiry",
  merge: "coordinate_inquiry",
  assignOwner: "coordinate_inquiry",
  handOver: "coordinate_inquiry",
  linkRecord: "coordinate_inquiry",
  unlinkRecord: "coordinate_inquiry",
  closeLost: "coordinate_inquiry",
  scheduleReminder: "coordinate_inquiry",
  cancelReminder: "coordinate_inquiry",
  sendOptions: "send_client_offer",
  sendOffer: "send_client_offer",
  ensureSharedDraft: "send_client_offer",
  offerDraft: "send_client_offer",
  requestPayment: "booking.payment.request",
} as const satisfies Record<string, CapabilityKey>;

export type MessagingWriteAction = keyof typeof MESSAGING_WRITE_CAPABILITY;
