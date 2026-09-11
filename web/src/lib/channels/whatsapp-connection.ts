import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

import {
  canPairWhatsApp,
  type WhatsAppConnectionPublic,
  type WhatsAppConnectionState,
} from "./types";

type Admin = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

type PublicRow = {
  tenant_id: string;
  state: string;
  phone_e164: string | null;
  display_name: string | null;
  pairing_expires_at: string | null;
  paired_at: string | null;
  last_seen_at: string | null;
  last_error: string | null;
};

const EMPTY: Omit<WhatsAppConnectionPublic, "canPair" | "ownerFirstName" | "unread" | "tenantName"> = {
  tenantId: "",
  state: "disconnected",
  phoneE164: null,
  displayName: null,
  pairingExpiresAt: null,
  pairingQr: null,
  pairingCode: null,
  pairedAt: null,
  lastSeenAt: null,
  lastError: null,
};

export async function loadWhatsAppConnectionRow(
  admin: Admin,
  tenantId: string,
): Promise<PublicRow | null> {
  const { data, error } = await admin
    .from("channel_connections_public")
    .select(
      "tenant_id, state, phone_e164, display_name, pairing_expires_at, paired_at, last_seen_at, last_error",
    )
    .eq("tenant_id", tenantId)
    .eq("channel", "whatsapp")
    .maybeSingle();
  if (error) {
    logServerError("channels.whatsapp.load", error);
    return null;
  }
  return (data as PublicRow | null) ?? null;
}

export async function countWhatsAppUnread(
  admin: Admin,
  tenantId: string,
  actorUserId: string,
): Promise<number> {
  const { data, error } = await admin
    .from("inquiries")
    .select("id, last_customer_message_at")
    .eq("tenant_id", tenantId)
    .eq("channel", "whatsapp");
  if (error || !data) return 0;
  const rows = data as { id: string; last_customer_message_at: string | null }[];
  const ids = rows.map((row) => row.id);
  if (ids.length === 0) return 0;
  const { data: reads, error: readsError } = await admin
    .from("inquiry_message_reads")
    .select("inquiry_id, last_read_at")
    .eq("user_id", actorUserId)
    .in("inquiry_id", ids);
  if (readsError) return 0;
  const lastRead = new Map<string, string>();
  for (const row of (reads ?? []) as { inquiry_id: string; last_read_at: string }[]) {
    lastRead.set(row.inquiry_id, row.last_read_at);
  }
  let unread = 0;
  for (const row of rows) {
    if (!row.last_customer_message_at) continue;
    const seen = lastRead.get(row.id);
    if (!seen || row.last_customer_message_at > seen) unread += 1;
  }
  return unread;
}

export async function loadOwnerFirstName(admin: Admin, tenantId: string): Promise<string | null> {
  const { data: membership, error: membershipError } = await admin
    .from("agency_memberships")
    .select("user_id")
    .eq("tenant_id", tenantId)
    .eq("role", "owner")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (membershipError) return null;
  const userId = (membership as { user_id?: string } | null)?.user_id;
  if (!userId) return null;
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("display_name")
    .eq("id", userId)
    .maybeSingle();
  if (profileError) return null;
  const name = (profile as { display_name?: string | null } | null)?.display_name?.trim();
  if (!name) return null;
  return name.split(/\s+/)[0] ?? null;
}

export function mapPublicRow(
  row: PublicRow | null,
  extras: {
    tenantId: string;
    unread: number;
    canPair: boolean;
    ownerFirstName: string | null;
    tenantName?: string;
    pairingQr?: string | null;
    pairingCode?: string | null;
  },
): WhatsAppConnectionPublic {
  const state = (row?.state as WhatsAppConnectionState | undefined) ?? "disconnected";
  return {
    ...(row
      ? {
          tenantId: extras.tenantId,
          state,
          phoneE164: row.phone_e164,
          displayName: row.display_name,
          pairingExpiresAt: row.pairing_expires_at,
          pairingQr: extras.pairingQr ?? null,
          pairingCode: extras.pairingCode ?? null,
          pairedAt: row.paired_at,
          lastSeenAt: row.last_seen_at,
          lastError: row.last_error,
        }
      : { ...EMPTY, tenantId: extras.tenantId, state: "disconnected" }),
    unread: extras.unread,
    canPair: extras.canPair,
    ownerFirstName: extras.ownerFirstName,
    tenantName: extras.tenantName ?? "",
  };
}

export async function loadWhatsAppBridge(
  tenantId: string,
  actorUserId: string,
  role: string | null,
): Promise<WhatsAppConnectionPublic> {
  const admin = createServiceRoleClient();
  if (!admin) {
    return mapPublicRow(null, {
      tenantId,
      unread: 0,
      canPair: canPairWhatsApp(role),
      ownerFirstName: null,
    });
  }
  const [row, unread, ownerFirstName] = await Promise.all([
    loadWhatsAppConnectionRow(admin, tenantId),
    countWhatsAppUnread(admin, tenantId, actorUserId),
    loadOwnerFirstName(admin, tenantId),
  ]);
  return mapPublicRow(row, {
    tenantId,
    unread,
    canPair: canPairWhatsApp(role),
    ownerFirstName,
  });
}
