import "server-only";

import { emailAdapter } from "./email";
import { smsAdapter } from "./sms";
import type { MessagingChannelAdapter } from "./types";
import { webChatAdapter } from "./web-chat";
import { whatsappAdapter } from "./whatsapp";

export type { ChannelSendResult, MessagingChannelAdapter } from "./types";

const ADAPTERS: Record<string, MessagingChannelAdapter> = {
  web_chat: webChatAdapter,
  email: emailAdapter,
  whatsapp: whatsappAdapter,
  sms: smsAdapter,
};

export function messagingChannel(id: string): MessagingChannelAdapter | null {
  return ADAPTERS[id] ?? null;
}
