import type { ChannelSendInput, ChannelSendResult, MessagingChannelAdapter } from "./types";

function configured(): boolean {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM);
}

export const smsAdapter: MessagingChannelAdapter = {
  id: "sms",
  async send(input: ChannelSendInput): Promise<ChannelSendResult> {
    if (!configured()) return { ok: false, reason: "channel_unavailable" };
    if (!input.to) return { ok: false, reason: "channel_unavailable" };
    return { ok: false, reason: "channel_unavailable" };
  },
  async deliveryStatus() {
    return { ok: false, reason: "channel_unavailable" };
  },
};
