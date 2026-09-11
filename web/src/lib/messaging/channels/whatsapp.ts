import type { ChannelSendInput, ChannelSendResult, MessagingChannelAdapter } from "./types";

function configured(): boolean {
  return Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID);
}

export const whatsappAdapter: MessagingChannelAdapter = {
  id: "whatsapp",
  async send(input: ChannelSendInput): Promise<ChannelSendResult> {
    if (!configured()) return { ok: false, reason: "channel_unavailable" };
    if (!input.templateName) return { ok: false, reason: "template_required" };
    if (!input.to) return { ok: false, reason: "channel_unavailable" };
    return { ok: false, reason: "channel_unavailable" };
  },
  async deliveryStatus() {
    return { ok: false, reason: "channel_unavailable" };
  },
};
