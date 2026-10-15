import "server-only";

import type { WhatsAppDeliveryStatus, WhatsAppProvider, WhatsAppSendResult } from "./provider";
import { whatsappAddress } from "./provider";

type TwilioMessageCreate = (input: {
  from: string;
  to: string;
  body?: string;
  contentSid?: string;
  contentVariables?: string;
  statusCallback?: string;
}) => Promise<{ sid?: string | null }>;

type TwilioDeps = {
  /** Tests inject a fake; production loads the SDK lazily on the first send. */
  createMessage?: TwilioMessageCreate;
  validateRequest?: (authToken: string, signature: string, url: string, params: Record<string, string>) => boolean;
};

export type TwilioWhatsAppConfig = { accountSid: string; authToken: string; from: string };

/** The env the existing owner alert already uses; null when any value is missing. */
export function twilioWhatsAppConfigFromEnv(env: Readonly<Record<string, string | undefined>> = process.env): TwilioWhatsAppConfig | null {
  const accountSid = env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = env.TWILIO_AUTH_TOKEN?.trim();
  const from = env.TWILIO_WHATSAPP_FROM?.trim();
  if (!accountSid || !authToken || !from) return null;
  return { accountSid, authToken, from };
}

const TWILIO_STATUS: Record<string, WhatsAppDeliveryStatus> = {
  accepted: "queued",
  scheduled: "queued",
  queued: "queued",
  sending: "queued",
  sent: "sent",
  delivered: "delivered",
  read: "read",
  failed: "failed",
  undelivered: "failed",
  canceled: "failed",
};

export function createTwilioWhatsAppProvider(config: TwilioWhatsAppConfig, deps: TwilioDeps = {}): WhatsAppProvider {
  let createMessage = deps.createMessage ?? null;
  const send: TwilioMessageCreate = async (input) => {
    if (!createMessage) {
      const twilio = (await import("twilio")).default;
      const client = twilio(config.accountSid, config.authToken);
      createMessage = (i) => client.messages.create(i);
    }
    return createMessage(input);
  };

  return {
    name: "twilio",

    async sendTemplate({ to, templateId, variables, statusCallbackUrl }): Promise<WhatsAppSendResult> {
      const address = whatsappAddress(to);
      if (!address || !/^HX[0-9a-f]{32}$/i.test(templateId.trim())) return { ok: false, reason: "invalid_input" };
      const msg = await send({
        from: config.from,
        to: address,
        contentSid: templateId.trim(),
        contentVariables: JSON.stringify(variables),
        ...(statusCallbackUrl ? { statusCallback: statusCallbackUrl } : {}),
      });
      return { ok: true, providerReference: msg.sid ?? "sent" };
    },

    async sendText({ to, body }): Promise<WhatsAppSendResult> {
      // The owner alert's number is passed exactly as configured, as it always was.
      if (!to.trim() || !body.trim()) return { ok: false, reason: "invalid_input" };
      const msg = await send({ from: config.from, to: to.trim(), body });
      return { ok: true, providerReference: msg.sid ?? "sent" };
    },

    async verifySignature({ url, signature, params }): Promise<boolean> {
      if (!signature) return false;
      const validate = deps.validateRequest ?? (await import("twilio")).default.validateRequest;
      return validate(config.authToken, signature, url, params);
    },

    parseStatus(params) {
      const sid = params.MessageSid?.trim();
      const raw = (params.MessageStatus ?? params.SmsStatus ?? "").trim().toLowerCase();
      const status = TWILIO_STATUS[raw];
      if (!sid || !status) return null;
      return { providerReference: sid, status, errorCode: params.ErrorCode?.trim() || null, to: params.To?.trim() || null };
    },
  };
}
