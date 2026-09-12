import { createServiceRoleClient } from "@/lib/supabase/admin";

import type { ChannelSendInput, ChannelSendResult, MessagingChannelAdapter } from "./types";

const HOUR_MS = 60 * 60 * 1000;
const HOURLY_CEILING = 60;
const PACE_MS = 2000;

type Admin = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

function e164FromTo(to: string | null): string | null {
  if (!to) return null;
  const trimmed = to.trim();
  if (/^\+[1-9]\d{6,14}$/.test(trimmed)) return trimmed;
  const digits = trimmed.replace(/\D/g, "");
  return digits ? `+${digits}` : null;
}

async function resolveTo(admin: Admin, input: ChannelSendInput): Promise<string | null> {
  const direct = e164FromTo(input.to);
  if (direct) return direct;
  const { data, error } = await admin
    .from("inquiries")
    .select("contact_phone, external_thread_ref")
    .eq("id", input.inquiryId)
    .eq("tenant_id", input.tenantId)
    .maybeSingle();
  if (error) return null;
  const row = data as { contact_phone?: string | null; external_thread_ref?: string | null } | null;
  const fromPhone = e164FromTo(row?.contact_phone ?? null);
  if (fromPhone) return fromPhone;
  const ref = row?.external_thread_ref ?? "";
  const match = /^whatsapp:(\d+)@c\.us$/.exec(ref);
  return match ? `+${match[1]}` : null;
}

async function nextNotBefore(admin: Admin, tenantId: string): Promise<string> {
  const since = new Date(Date.now() - HOUR_MS).toISOString();
  const { data, error } = await admin
    .from("channel_outbox")
    .select("created_at, not_before")
    .eq("tenant_id", tenantId)
    .eq("channel", "whatsapp")
    .gte("created_at", since)
    .order("not_before", { ascending: false })
    .limit(HOUR_MS);
  if (error) return new Date().toISOString();
  const rows = (data ?? []) as { created_at: string; not_before: string }[];
  const last = rows[0]?.not_before ? new Date(rows[0].not_before).getTime() : 0;
  const paced = Math.max(Date.now(), last + PACE_MS);
  if (rows.length >= HOURLY_CEILING) {
    const oldest = rows.reduce(
      (min, row) => Math.min(min, new Date(row.created_at).getTime()),
      Date.now(),
    );
    return new Date(Math.max(paced, oldest + HOUR_MS)).toISOString();
  }
  return new Date(paced).toISOString();
}

async function enqueue(admin: Admin, input: ChannelSendInput): Promise<ChannelSendResult> {
  const to = await resolveTo(admin, input);
  if (!to) return { ok: false, reason: "channel_unavailable" };
  const notBefore = await nextNotBefore(admin, input.tenantId);
  const { data, error } = await admin
    .from("channel_outbox")
    .upsert(
      {
        tenant_id: input.tenantId,
        channel: "whatsapp",
        message_id: input.messageId,
        to_e164: to,
        body: input.body,
        state: "queued",
        not_before: notBefore,
      },
      { onConflict: "message_id,channel" },
    )
    .select("id")
    .single();
  if (error || !data) return { ok: false, reason: "channel_unavailable" };
  return { ok: true, providerRef: (data as { id: string }).id };
}

export const whatsappAdapter: MessagingChannelAdapter = {
  id: "whatsapp",
  async send(input: ChannelSendInput): Promise<ChannelSendResult> {
    try {
      const admin = createServiceRoleClient();
      if (!admin) return { ok: false, reason: "channel_unavailable" };
      return await enqueue(admin, input);
    } catch {
      return { ok: false, reason: "channel_unavailable" };
    }
  },
  async deliveryStatus(providerRef: string) {
    try {
      const admin = createServiceRoleClient();
      if (!admin) return { ok: false as const, reason: "channel_unavailable" as const };
      const { data, error } = await admin
        .from("channel_outbox")
        .select("state")
        .eq("id", providerRef)
        .maybeSingle();
      if (error) return { ok: false as const, reason: "channel_unavailable" as const };
      const state = (data as { state?: string } | null)?.state;
      if (state === "sent") return { ok: true as const, state: "sent" as const };
      if (state === "failed") return { ok: true as const, state: "failed" as const };
      if (state === "queued" || state === "sending") return { ok: true as const, state: "queued" as const };
    } catch {
      /* experimental table may be absent */
    }
    return { ok: false as const, reason: "channel_unavailable" as const };
  },
};

export const __test__ = { e164FromTo, nextNotBefore };
