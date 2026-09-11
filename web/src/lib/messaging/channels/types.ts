export type ChannelSendInput = {
  tenantId: string;
  inquiryId: string;
  messageId: string;
  body: string;
  smsText: string;
  to: string | null;
  templateName?: string | null;
};

export type ChannelSendOk = { ok: true; providerRef: string };
export type ChannelSendFail = {
  ok: false;
  reason: "channel_unavailable" | "template_required" | "rate_limited";
};
export type ChannelSendResult = ChannelSendOk | ChannelSendFail;

export type ChannelDeliveryState = "queued" | "sent" | "delivered" | "read" | "failed";

export type MessagingChannelAdapter = {
  id: "web_chat" | "email" | "whatsapp" | "sms";
  send(input: ChannelSendInput): Promise<ChannelSendResult>;
  deliveryStatus(providerRef: string): Promise<{ ok: true; state: ChannelDeliveryState } | ChannelSendFail>;
};
