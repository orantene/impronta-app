import "server-only";

import { matchCustomers } from "@/lib/messaging/match-customers";
import { logServerError } from "@/lib/server/safe-error";

import {
  isWhatsAppConnectionState,
  type WhatsAppWebhookAck,
  type WhatsAppWebhookBody,
  type WhatsAppWebhookMessage,
  type WhatsAppWebhookSession,
} from "./types";

type Admin = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

export type WebhookResult =
  | { ok: true; messageId?: string; inquiryId?: string }
  | { ok: false; reason: "invalid" | "unavailable" | "wrong_tenant" };

function threadRef(chatId: string): string {
  return `whatsapp:${chatId}`;
}

function e164FromChatId(chatId: string, from?: string | null): string {
  if (from && from.startsWith("+")) return from;
  const digits = chatId.replace(/@c\.us$/, "").replace(/\D/g, "");
  return digits ? `+${digits}` : "";
}

async function assertTenantOwnsChat(
  admin: Admin,
  tenantId: string,
  chatId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from("channel_connections")
    .select("tenant_id, phone_e164")
    .eq("tenant_id", tenantId)
    .eq("channel", "whatsapp")
    .maybeSingle();
  if (error || !data) return false;
  const row = data as { tenant_id: string; phone_e164: string | null };
  if (row.tenant_id !== tenantId) return false;
  void chatId;
  return true;
}

async function resolveInquiry(
  admin: Admin,
  input: { tenantId: string; chatId: string; from: string; pushName: string | null; text: string },
): Promise<{ id: string } | null> {
  const ref = threadRef(input.chatId);
  const { data: existing, error: existingError } = await admin
    .from("inquiries")
    .select("id")
    .eq("tenant_id", input.tenantId)
    .eq("external_thread_ref", ref)
    .maybeSingle();
  if (existingError) return null;
  if (existing) return existing as { id: string };

  const phone = e164FromChatId(input.chatId, input.from);
  const { data: created, error } = await admin
    .from("inquiries")
    .insert({
      tenant_id: input.tenantId,
      contact_name: input.pushName?.trim() || phone || "WhatsApp",
      contact_email: "",
      contact_phone: phone || null,
      message: input.text || null,
      channel: "whatsapp",
      source_channel: "directory_guest",
      source_workspace_id: input.tenantId,
      conversation_state: "needs_reply",
      last_customer_message_at: new Date().toISOString(),
      external_thread_ref: ref,
      location_slug: "default",
      status: "new",
    })
    .select("id")
    .single();
  if (error || !created) {
    logServerError("channels.whatsapp.inquiry", error);
    return null;
  }

  const { data: customers, error: customersError } = await admin
    .from("customers")
    .select("id, display_name, email, phone_e164")
    .eq("tenant_id", input.tenantId)
    .limit(80);
  if (customersError) return created as { id: string };
  matchCustomers({
    name: input.pushName,
    phone,
    customers: (customers ?? []) as {
      id: string;
      display_name: string | null;
      email: string | null;
      phone_e164: string | null;
    }[],
  });
  return created as { id: string };
}

async function alreadyDelivered(admin: Admin, providerRef: string): Promise<boolean> {
  const { data, error } = await admin
    .from("message_delivery")
    .select("id")
    .eq("channel", "whatsapp")
    .eq("provider_ref", providerRef)
    .maybeSingle();
  if (error) return true;
  return Boolean(data);
}

async function handleMessage(admin: Admin, body: WhatsAppWebhookMessage): Promise<WebhookResult> {
  if (!body.tenantId || !body.chatId || !body.providerRef) {
    return { ok: false, reason: "invalid" };
  }
  if (body.chatId.endsWith("@g.us") || body.chatId === "status@broadcast") {
    return { ok: true };
  }
  if (!(await assertTenantOwnsChat(admin, body.tenantId, body.chatId))) {
    return { ok: false, reason: "wrong_tenant" };
  }
  if (await alreadyDelivered(admin, body.providerRef)) {
    return { ok: true };
  }

  const fromMe = body.fromMe === true;
  if (fromMe) {
    const { data: existing, error: existingError } = await admin
      .from("inquiries")
      .select("id")
      .eq("tenant_id", body.tenantId)
      .eq("external_thread_ref", threadRef(body.chatId))
      .maybeSingle();
    if (existingError || !existing) return { ok: true };
  }

  const inquiry = fromMe
    ? ((
        await admin
          .from("inquiries")
          .select("id")
          .eq("tenant_id", body.tenantId)
          .eq("external_thread_ref", threadRef(body.chatId))
          .maybeSingle()
      ).data as { id: string } | null)
    : await resolveInquiry(admin, {
        tenantId: body.tenantId,
        chatId: body.chatId,
        from: body.from,
        pushName: body.pushName ?? null,
        text: body.text ?? "",
      });
  if (!inquiry) return { ok: false, reason: "unavailable" };

  const kind = body.media ? "media" : "text";
  const { data: inserted, error } = await admin
    .from("inquiry_messages")
    .insert({
      inquiry_id: inquiry.id,
      tenant_id: body.tenantId,
      thread_type: "group",
      message_kind: kind,
      body: body.text ?? (body.media ? body.media.url : ""),
      sender_user_id: null,
      card_payload: fromMe ? { via: "phone" } : body.media ? { media: body.media } : null,
    })
    .select("id")
    .single();
  if (error || !inserted) return { ok: false, reason: "unavailable" };

  await admin.from("message_delivery").upsert(
    {
      message_id: (inserted as { id: string }).id,
      tenant_id: body.tenantId,
      channel: "whatsapp",
      state: "delivered",
      provider_ref: body.providerRef,
      attempts: 1,
    },
    { onConflict: "message_id,channel" },
  );

  const now = body.sentAt ?? new Date().toISOString();
  await admin
    .from("inquiries")
    .update(
      fromMe
        ? { last_staff_message_at: now, conversation_state: "awaiting_customer" }
        : { last_customer_message_at: now, conversation_state: "needs_reply" },
    )
    .eq("id", inquiry.id)
    .eq("tenant_id", body.tenantId);

  return { ok: true, messageId: (inserted as { id: string }).id, inquiryId: inquiry.id };
}

async function handleAck(admin: Admin, body: WhatsAppWebhookAck): Promise<WebhookResult> {
  if (!body.tenantId || !body.providerRef || !body.state) return { ok: false, reason: "invalid" };
  const { data, error } = await admin
    .from("message_delivery")
    .update({
      state: body.state,
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", body.tenantId)
    .eq("channel", "whatsapp")
    .eq("provider_ref", body.providerRef)
    .select("id")
    .maybeSingle();
  if (error || !data) return { ok: true };
  return { ok: true };
}

async function handleSession(admin: Admin, body: WhatsAppWebhookSession): Promise<WebhookResult> {
  if (!body.tenantId || !body.state || !isWhatsAppConnectionState(body.state)) {
    return { ok: false, reason: "invalid" };
  }
  const now = new Date().toISOString();
  const pairingExpiresAt =
    body.state === "pairing" && body.qr
      ? new Date(Date.now() + 20_000).toISOString()
      : null;
  const patch: Record<string, unknown> = {
    tenant_id: body.tenantId,
    channel: "whatsapp",
    state: body.state,
    updated_at: now,
    last_error: body.error ?? (body.pairingCode ? `pairing_code:${body.pairingCode}` : null),
    pairing_qr: body.state === "pairing" ? body.qr ?? null : null,
    pairing_expires_at: pairingExpiresAt,
  };
  if (body.phone) patch.phone_e164 = body.phone;
  if (body.displayName) patch.display_name = body.displayName;
  if (body.state === "connected") {
    patch.paired_at = now;
    patch.last_seen_at = now;
    patch.pairing_qr = null;
  }
  if (body.state === "unlinked" || body.state === "blocked") {
    patch.session_ciphertext = null;
    patch.pairing_qr = null;
  }
  const { error } = await admin.from("channel_connections").upsert(patch, {
    onConflict: "tenant_id,channel",
  });
  if (error) {
    logServerError("channels.whatsapp.session", error);
    return { ok: false, reason: "unavailable" };
  }
  return { ok: true };
}

export async function handleWhatsAppWebhook(
  admin: Admin,
  raw: WhatsAppWebhookBody,
): Promise<WebhookResult> {
  if ("kind" in raw && raw.kind === "message") return handleMessage(admin, raw);
  if ("kind" in raw && raw.kind === "ack") return handleAck(admin, raw);
  if ("kind" in raw && raw.kind === "session") return handleSession(admin, raw);
  if ("inquiryId" in raw && raw.inquiryId && raw.tenantId && raw.text) {
    const { data, error } = await admin
      .from("inquiry_messages")
      .insert({
        inquiry_id: raw.inquiryId,
        tenant_id: raw.tenantId,
        thread_type: "group",
        message_kind: "text",
        body: raw.text,
        sender_user_id: null,
      })
      .select("id")
      .single();
    if (error || !data) return { ok: false, reason: "unavailable" };
    if (raw.providerRef) {
      await admin.from("message_delivery").upsert(
        {
          message_id: (data as { id: string }).id,
          tenant_id: raw.tenantId,
          channel: "whatsapp",
          state: "delivered",
          provider_ref: raw.providerRef,
          attempts: 1,
        },
        { onConflict: "message_id,channel" },
      );
    }
    return { ok: true, messageId: (data as { id: string }).id };
  }
  return { ok: false, reason: "invalid" };
}
