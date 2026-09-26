"use server";

import { z } from "zod";

import { createInquiryFromIntent } from "@/lib/inquiry/inquiry-intent-engine";
import type { InquiryIntent } from "@/lib/inquiry/inquiry-intent";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import { insertMessage } from "@/lib/messaging/insert-message";
import { fail } from "@/lib/messaging/refusals";
import { signThreadToken } from "@/lib/messaging/thread-token";
import type { MessagingChannel } from "@/lib/messaging/types";

import { messagingInquiryManager } from "@/lib/messaging/staff-guard";

import { staff } from "./messaging-engine";

const scoped = tenantScopedQuery;

/**
 * Staff start a conversation from the inbox (workspace New, POS New
 * conversation). Moved out of messaging-engine.ts at its 800-line cap; the
 * engine re-exports nothing, callers import from here.
 */
export async function messagingStartConversation(input: {
  name: string;
  email?: string | null;
  phone?: string | null;
  channel: MessagingChannel;
  locationSlug?: string;
  firstMessage?: string | null;
}) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z
    .object({
      name: z.string().trim().min(1).max(200),
      email: z.string().email().nullable().optional(),
      phone: z.string().trim().max(32).nullable().optional(),
      channel: z.enum(["web_chat", "whatsapp", "sms", "email", "counter"]),
      locationSlug: z.string().trim().min(1).max(80).optional(),
      firstMessage: z.string().trim().max(4000).nullable().optional(),
    })
    .safeParse(input);
  if (!parsed.success) return fail("invalid");
  if (parsed.data.channel === "web_chat") {
    return fail("not_allowed");
  }
  if (!parsed.data.email && !parsed.data.phone) return fail("invalid");
  const intent: InquiryIntent = {
    source: "admin_created",
    source_context: { acting_staff_user_id: g.userId, channel: parsed.data.channel },
    requester: {
      name: parsed.data.name,
      email: parsed.data.email ?? undefined,
      phone: parsed.data.phone ?? undefined,
    },
    brief: { summary: parsed.data.firstMessage || "POS conversation" },
    location: { status: "not_sure" },
    date: { status: "not_sure" },
  };
  const created = await createInquiryFromIntent(g.supabase, intent, {
    tenant_id: g.tenantId,
    actor_user_id: g.userId,
  });
  if (!created.ok) return fail("unavailable");
  await scoped(g.admin, "inquiries", g.tenantId)
    .update({
      channel: parsed.data.channel,
      location_slug: parsed.data.locationSlug ?? "default",
      owner_user_id: g.userId,
    })
    .eq("id", created.inquiryId);
  if (parsed.data.firstMessage) {
    await insertMessage(g.admin, {
      tenantId: g.tenantId,
      inquiryId: created.inquiryId,
      kind: "text",
      body: parsed.data.firstMessage,
      senderUserId: g.userId,
    });
  }
  // Staff typed a phone or email: the conversation starts confirmed (method
  // staff), so the header never reads "no identity yet" on a conversation the
  // operator opened themselves. Read the fresh version; the RPC guards it.
  if (parsed.data.email || parsed.data.phone) {
    const { data: row } = await scoped(g.admin, "inquiries", g.tenantId).select("version").eq("id", created.inquiryId).maybeSingle();
    const current = (row as { version?: number } | null)?.version;
    if (typeof current === "number") {
      await g.admin.rpc("messaging_set_identity", { p_tenant_id: g.tenantId, p_inquiry_id: created.inquiryId, p_level: "confirmed", p_method: "staff", p_customer_id: null, p_expected_version: current });
    }
  }
  const token = signThreadToken(created.inquiryId, g.tenantId);
  return { ok: true as const, inquiryId: created.inquiryId, token };
}

/**
 * Identity capture › "Create a new client" (boards D04 / M07, seam D-MSG-75
 * closed): the customer row comes from the same idempotent writer every
 * checkout uses (`ensureCustomer`, keyed by email or phone), then the thread
 * is linked to it through `messaging_set_identity`. Also updates the inquiry
 * contact so the header stops reading "Visitor".
 *
 * Auth: inquiry managers (staff OR active coordinator). Talent inbox is not
 * an admin surface — `staff()` alone refused Jorgelina's Capture identity Save
 * with `not_allowed` / "You cannot do that from here." (Ana Pagado, 2026-09-26).
 */
export async function messagingCreateClientForThread(input: {
  inquiryId: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  expectedVersion: number;
}) {
  const parsed = z
    .object({
      inquiryId: z.string().uuid(),
      name: z.string().trim().min(1).max(200),
      phone: z.string().trim().max(32).nullable().optional(),
      email: z.string().trim().email().nullable().optional(),
      expectedVersion: z.number().int().nonnegative(),
    })
    .safeParse(input);
  if (!parsed.success) return fail("invalid");
  if (!parsed.data.email && !parsed.data.phone) return fail("invalid");
  const g = await messagingInquiryManager(parsed.data.inquiryId);
  if (!g.ok) return g;
  const { ensureCustomer } = await import("@/lib/customers/ensure-customer");
  const customer = await ensureCustomer(
    { tenantId: g.tenantId, email: parsed.data.email ?? null, phone: parsed.data.phone ?? null, displayName: parsed.data.name },
    { admin: g.admin },
  );
  if (!customer.ok) return fail(customer.reason === "unavailable" ? "unavailable" : "invalid");
  await scoped(g.admin, "inquiries", g.tenantId)
    .update({ contact_name: parsed.data.name, contact_email: parsed.data.email ?? null, contact_phone: parsed.data.phone ?? null })
    .eq("id", parsed.data.inquiryId);
  const { data, error } = await g.admin.rpc("messaging_set_identity", {
    p_tenant_id: g.tenantId,
    p_inquiry_id: parsed.data.inquiryId,
    p_level: "confirmed",
    p_method: parsed.data.phone ? "phone" : "email",
    p_customer_id: customer.customerId,
    p_expected_version: parsed.data.expectedVersion,
  });
  if (error) return fail("unavailable");
  const row = data as { ok?: boolean; reason?: string; version?: number } | null;
  if (!row?.ok) return fail(row?.reason === "conflict" ? "conflict" : "unavailable");
  return { ok: true as const, customerId: customer.customerId, version: row.version };
}
