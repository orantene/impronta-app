import type { ChannelSendInput, ChannelSendResult, MessagingChannelAdapter } from "./types";

export const webChatAdapter: MessagingChannelAdapter = {
  id: "web_chat",
  async send(input: ChannelSendInput): Promise<ChannelSendResult> {
    if (!input.messageId) return { ok: false, reason: "channel_unavailable" };
    return { ok: true, providerRef: `web:${input.messageId}` };
  },
  async deliveryStatus(providerRef: string) {
    if (!providerRef.startsWith("web:")) return { ok: false, reason: "channel_unavailable" };
    return { ok: true, state: "delivered" };
  },
};
