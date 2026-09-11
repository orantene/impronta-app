"use server";

import { z } from "zod";

import { emitNotificationToUsers } from "@/lib/notifications/emit";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { getAdminWorkspaceScope } from "@/lib/saas/admin-workspace-scope";
import { createServiceRoleClient } from "@/lib/supabase/admin";

import { isMessagingChannelsEnabled } from "./flag";
import { canPairWhatsApp, type WhatsAppConnectionPublic } from "./types";
import { callChannelWorker } from "./worker-client";
import {
  countWhatsAppUnread,
  loadOwnerFirstName,
  loadWhatsAppConnectionRow,
  mapPublicRow,
} from "./whatsapp-connection";

const uuid = z.string().uuid();

async function staff() {
  const guard = await requireWorkspaceStaffAction();
  if (!guard.ok) return { ok: false as const, reason: "not_allowed" as const };
  const scope = await getAdminWorkspaceScope();
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false as const, reason: "unavailable" as const };
  const role = scope?.membership.role ?? null;
  return {
    ok: true as const,
    tenantId: guard.tenantId,
    userId: guard.user.id,
    role,
    tenantName: scope?.membership.display_name ?? "",
    admin,
  };
}

export async function loadWhatsAppConnection(): Promise<
  | { ok: true; connection: WhatsAppConnectionPublic; enabled: true }
  | { ok: true; enabled: false }
  | { ok: false; reason: "not_allowed" | "unavailable" }
> {
  if (!(await isMessagingChannelsEnabled())) return { ok: true, enabled: false };
  const g = await staff();
  if (!g.ok) return g;
  const [row, unread, ownerFirstName] = await Promise.all([
    loadWhatsAppConnectionRow(g.admin, g.tenantId),
    countWhatsAppUnread(g.admin, g.tenantId, g.userId),
    loadOwnerFirstName(g.admin, g.tenantId),
  ]);
  let pairingQr: string | null = null;
  let pairingCode: string | null = null;
  if (row?.state === "pairing" && canPairWhatsApp(g.role)) {
    const secret = await g.admin
      .from("channel_connections")
      .select("pairing_qr, last_error")
      .eq("tenant_id", g.tenantId)
      .eq("channel", "whatsapp")
      .maybeSingle();
    const secretRow = secret.data as { pairing_qr?: string | null; last_error?: string | null } | null;
    pairingQr = secretRow?.pairing_qr ?? null;
    const err = secretRow?.last_error ?? null;
    if (err && err.startsWith("pairing_code:")) pairingCode = err.slice("pairing_code:".length);
  }
  return {
    ok: true,
    enabled: true,
    connection: mapPublicRow(row, {
      tenantId: g.tenantId,
      unread,
      canPair: canPairWhatsApp(g.role),
      ownerFirstName,
      tenantName: g.tenantName,
      pairingQr,
      pairingCode,
    }),
  };
}

export async function startWhatsAppPairing(input: { consented: boolean }) {
  if (!(await isMessagingChannelsEnabled())) return { ok: false as const, reason: "unavailable" as const };
  const g = await staff();
  if (!g.ok) return g;
  if (!canPairWhatsApp(g.role)) return { ok: false as const, reason: "not_allowed" as const };
  if (!input.consented) return { ok: false as const, reason: "invalid" as const };
  const now = new Date().toISOString();
  const { error } = await g.admin.from("channel_connections").upsert(
    {
      tenant_id: g.tenantId,
      channel: "whatsapp",
      state: "pairing",
      pairing_qr: null,
      pairing_expires_at: null,
      last_error: null,
      consented_by: g.userId,
      consented_at: now,
      updated_at: now,
    },
    { onConflict: "tenant_id,channel" },
  );
  if (error) return { ok: false as const, reason: "unavailable" as const };
  await callChannelWorker("pair", { tenantId: g.tenantId });
  return { ok: true as const };
}

export async function requestWhatsAppPairingCode(input: { phone: string }) {
  if (!(await isMessagingChannelsEnabled())) return { ok: false as const, reason: "unavailable" as const };
  const g = await staff();
  if (!g.ok) return g;
  if (!canPairWhatsApp(g.role)) return { ok: false as const, reason: "not_allowed" as const };
  const phone = input.phone.trim();
  if (!/^\+[1-9]\d{6,14}$/.test(phone)) return { ok: false as const, reason: "invalid" as const };
  const { error } = await g.admin
    .from("channel_connections")
    .update({
      state: "pairing",
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", g.tenantId)
    .eq("channel", "whatsapp");
  if (error) return { ok: false as const, reason: "unavailable" as const };
  await callChannelWorker("pairing-code", { tenantId: g.tenantId, phone });
  return { ok: true as const };
}

export async function unlinkWhatsApp() {
  if (!(await isMessagingChannelsEnabled())) return { ok: false as const, reason: "unavailable" as const };
  const g = await staff();
  if (!g.ok) return g;
  if (!canPairWhatsApp(g.role)) return { ok: false as const, reason: "not_allowed" as const };
  const { error } = await g.admin
    .from("channel_connections")
    .update({
      state: "unlinked",
      session_ciphertext: null,
      pairing_qr: null,
      pairing_expires_at: null,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", g.tenantId)
    .eq("channel", "whatsapp");
  if (error) return { ok: false as const, reason: "unavailable" as const };
  await callChannelWorker("logout", { tenantId: g.tenantId });
  return { ok: true as const };
}

export async function askOwnerToConnectWhatsApp() {
  if (!(await isMessagingChannelsEnabled())) return { ok: false as const, reason: "unavailable" as const };
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z.object({ tenantId: uuid.optional() }).safeParse({});
  void parsed;
  const { data, error } = await g.admin
    .from("agency_memberships")
    .select("user_id")
    .eq("tenant_id", g.tenantId)
    .eq("status", "active")
    .in("role", ["owner", "admin"]);
  if (error) return { ok: false as const, reason: "unavailable" as const };
  const userIds = ((data ?? []) as { user_id: string }[]).map((row) => row.user_id);
  try {
    await emitNotificationToUsers(userIds, {
      tenantId: g.tenantId,
      kind: "system",
      surface: "workspace",
      title: "Connect WhatsApp",
      body: "A teammate asked you to link the business WhatsApp so messages arrive in Tulala.",
      actorUserId: g.userId,
      originKind: "channels.whatsapp.ask_owner",
      targetDrawer: "whatsapp",
    });
  } catch {
    return { ok: false as const, reason: "unavailable" as const };
  }
  return { ok: true as const };
}
