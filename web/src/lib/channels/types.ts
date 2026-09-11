export const WHATSAPP_CONNECTION_STATES = [
  "disconnected",
  "pairing",
  "connected",
  "phone_offline",
  "reconnecting",
  "unlinked",
  "blocked",
] as const;

export type WhatsAppConnectionState = (typeof WHATSAPP_CONNECTION_STATES)[number];

export const WHATSAPP_PAIR_ROLES = ["owner", "admin", "manager"] as const;
export type WhatsAppPairRole = (typeof WHATSAPP_PAIR_ROLES)[number];

export function canPairWhatsApp(role: string | null | undefined): boolean {
  return role === "owner" || role === "admin" || role === "manager";
}

export function isLiveWhatsAppState(state: WhatsAppConnectionState): boolean {
  return state === "connected" || state === "phone_offline" || state === "reconnecting";
}

export function needsPairingWhatsApp(state: WhatsAppConnectionState): boolean {
  return state === "disconnected" || state === "unlinked" || state === "blocked";
}

export type WhatsAppConnectionPublic = {
  tenantId: string;
  state: WhatsAppConnectionState;
  phoneE164: string | null;
  displayName: string | null;
  pairingExpiresAt: string | null;
  pairingQr: string | null;
  pairingCode: string | null;
  pairedAt: string | null;
  lastSeenAt: string | null;
  lastError: string | null;
  unread: number;
  canPair: boolean;
  ownerFirstName: string | null;
  /** Workspace name for the drawer title. Empty when unknown. */
  tenantName: string;
};

export type WhatsAppBridgeSnapshot = {
  state: WhatsAppConnectionState;
  phone: string | null;
  unread: number;
};

export type WhatsAppWebhookMessage = {
  kind: "message";
  tenantId: string;
  chatId: string;
  from: string;
  pushName?: string | null;
  providerRef: string;
  text?: string | null;
  media?: { url: string; mime: string } | null;
  sentAt?: string | null;
  fromMe?: boolean;
};

export type WhatsAppWebhookAck = {
  kind: "ack";
  tenantId: string;
  providerRef: string;
  state: "sent" | "delivered" | "read" | "failed";
};

export type WhatsAppWebhookSession = {
  kind: "session";
  tenantId: string;
  state: Exclude<WhatsAppConnectionState, "disconnected"> | "disconnected";
  phone?: string | null;
  displayName?: string | null;
  qr?: string | null;
  pairingCode?: string | null;
  error?: string | null;
};

export type WhatsAppWebhookBody =
  | WhatsAppWebhookMessage
  | WhatsAppWebhookAck
  | WhatsAppWebhookSession
  | {
      inquiryId?: string;
      tenantId?: string;
      text?: string;
      providerRef?: string;
    };

export function isWhatsAppConnectionState(value: string): value is WhatsAppConnectionState {
  return (WHATSAPP_CONNECTION_STATES as readonly string[]).includes(value);
}
