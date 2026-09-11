import "server-only";

import { sendEmailResult } from "@/lib/email";

import type { ChannelSendInput, ChannelSendResult, MessagingChannelAdapter } from "./types";

export const emailAdapter: MessagingChannelAdapter = {
  id: "email",
  async send(input: ChannelSendInput): Promise<ChannelSendResult> {
    if (!input.to) return { ok: false, reason: "channel_unavailable" };
    const sent = await sendEmailResult({
      to: input.to,
      subject: "A message from your conversation",
      html: `<p>${escapeHtml(input.body)}</p>`,
    });
    if (sent.status !== "sent") return { ok: false, reason: "channel_unavailable" };
    return { ok: true, providerRef: sent.id ?? `email:${input.messageId}` };
  },
  async deliveryStatus(providerRef: string) {
    if (!providerRef) return { ok: false, reason: "channel_unavailable" };
    return { ok: true, state: "sent" };
  },
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
