"use server";

import { z } from "zod";

import { insertMessage } from "@/lib/messaging/insert-message";
import { fail } from "@/lib/messaging/refusals";
import { loadOwnedTalentInquiry, loadTalentActor } from "@/lib/messaging/talent-actor";
import { talentWriteRefusal } from "@/lib/messaging/talent-writes";
import { signThreadToken } from "@/lib/messaging/thread-token";
import type { MessagingChannel } from "@/lib/messaging/types";
import { logServerError } from "@/lib/server/safe-error";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import { resolveTalentOwnWorkTenant } from "@/lib/talent-agenda/own-work-tenant";

/**
 * F38: the talent's own Messages writers (mockup msg_d / msg_actions). A
 * solo talent sells on the platform hub, so she can start a conversation
 * with her own client, keep private notes and resolve / reopen her own
 * threads. On an agency sale the agency owns the thread and these refuse
 * (the seller-mode chrome does not show them there).
 *
 * New conversations follow the talent Agenda writers (create-quote,
 * convert-hold): the hub tenant from `resolveTalentOwnWorkTenant`, rows
 * written with the service client after the actor is resolved from the
 * session. `submitInquiry` refuses a talent actor (`submit_inquiry` is
 * client/staff only), so the funnel cannot seat her own conversation.
 */

const uuid = z.string().uuid();

async function ownedSeller(inquiryId: string) {
  const actor = await loadTalentActor();
  if (!actor.ok) return actor;
  const row = await loadOwnedTalentInquiry(actor.admin, actor.talentProfileId, inquiryId);
  if (!row.ok) return row;
  const refusal = talentWriteRefusal(row.isSeller);
  if (refusal) return fail(refusal);
  return { ok: true as const, actor, row };
}

export async function messagingTalentStartConversation(input: {
  name: string;
  email?: string | null;
  phone?: string | null;
  channel: MessagingChannel;
  firstMessage?: string | null;
}) {
  const parsed = z
    .object({
      name: z.string().trim().min(1).max(200),
      email: z.string().trim().email().nullable().optional(),
      phone: z.string().trim().max(32).nullable().optional(),
      channel: z.enum(["web_chat", "whatsapp", "sms", "email", "counter"]),
      firstMessage: z.string().trim().max(4000).nullable().optional(),
    })
    .safeParse(input);
  if (!parsed.success) return fail("invalid");
  if (parsed.data.channel === "web_chat") return fail("not_allowed");
  const email = parsed.data.email || null;
  const phone = parsed.data.phone || null;
  if (!email && !phone) return fail("invalid");
  const actor = await loadTalentActor();
  if (!actor.ok) return actor;
  const hub = await resolveTalentOwnWorkTenant();
  if (!hub.ok) return fail("unavailable");
  const tenantId = hub.tenantId;
  const admin = actor.admin;

  const { data: inquiry, error } = await tenantScopedQuery(admin, "inquiries", tenantId)
    .insert({
      tenant_id: tenantId,
      owner_user_id: actor.userId,
      contact_name: parsed.data.name,
      contact_email: email,
      contact_phone: phone,
      message: parsed.data.firstMessage || "Conversation started from Messages",
      source_type: "manual",
      status: "coordination",
      uses_new_engine: true,
      channel: parsed.data.channel,
      location_slug: "default",
      source_context: {
        talent_ids: [actor.talentProfileId],
        channel: parsed.data.channel,
        started_by: "talent",
        acting_talent_user_id: actor.userId,
      },
    })
    .select("id, version")
    .single();
  if (error || !inquiry) {
    logServerError("messaging-talent.start.inquiry", error);
    return fail("unavailable");
  }
  const inquiryId = (inquiry as { id: string }).id;

  // The participant row is what the attachment pipeline and the thread
  // readers key on; the default requirement group must exist first (M5.6 trigger).
  const { data: group, error: groupErr } = await tenantScopedQuery(admin, "inquiry_requirement_groups", tenantId)
    .insert({ inquiry_id: inquiryId, tenant_id: tenantId, role_key: "talent", quantity_required: 1, sort_order: 0 })
    .select("id")
    .single();
  if (groupErr) logServerError("messaging-talent.start.group", groupErr);
  const { error: partErr } = await tenantScopedQuery(admin, "inquiry_participants", tenantId).insert({
    inquiry_id: inquiryId,
    tenant_id: tenantId,
    user_id: actor.userId,
    talent_profile_id: actor.talentProfileId,
    role: "talent",
    status: "active",
    sort_order: 0,
    added_by_user_id: actor.userId,
    requirement_group_id: (group as { id?: string } | null)?.id ?? null,
  });
  if (partErr) logServerError("messaging-talent.start.participant", partErr);

  if (parsed.data.firstMessage) {
    await insertMessage(admin, {
      tenantId,
      inquiryId,
      kind: "text",
      body: parsed.data.firstMessage,
      senderUserId: actor.userId,
    });
  }

  // She typed the phone or email: the client is known, so the thread starts
  // confirmed and linked to a customer row (her Clients list reads those).
  const { ensureCustomer } = await import("@/lib/customers/ensure-customer");
  const customer = await ensureCustomer({ tenantId, email, phone, displayName: parsed.data.name }, { admin });
  const { data: fresh, error: freshErr } = await tenantScopedQuery(admin, "inquiries", tenantId).select("version").eq("id", inquiryId).maybeSingle();
  if (freshErr) logServerError("messaging-talent.start.version", freshErr);
  const version = (fresh as { version?: number } | null)?.version;
  if (typeof version === "number") {
    await admin.rpc("messaging_set_identity", {
      p_tenant_id: tenantId,
      p_inquiry_id: inquiryId,
      p_level: "confirmed",
      p_method: "staff",
      p_customer_id: customer.ok ? customer.customerId : null,
      p_expected_version: version,
    });
  }
  const token = signThreadToken(inquiryId, tenantId);
  return { ok: true as const, inquiryId, token };
}

export async function messagingTalentPrivateNote(input: { inquiryId: string; body: string }) {
  const parsed = z.object({ inquiryId: uuid, body: z.string().trim().min(1).max(8000) }).safeParse(input);
  if (!parsed.success) return fail("invalid");
  const gate = await ownedSeller(parsed.data.inquiryId);
  if (!gate.ok) return gate;
  return insertMessage(gate.actor.admin, {
    tenantId: gate.row.tenantId,
    inquiryId: parsed.data.inquiryId,
    kind: "internal_note",
    body: parsed.data.body,
    senderUserId: gate.actor.userId,
  });
}

export async function messagingTalentSetState(input: {
  inquiryId: string;
  expectedVersion: number;
  state: "resolved" | "needs_reply";
}) {
  const parsed = z
    .object({ inquiryId: uuid, expectedVersion: z.number().int().nonnegative(), state: z.enum(["resolved", "needs_reply"]) })
    .safeParse(input);
  if (!parsed.success) return fail("invalid");
  const gate = await ownedSeller(parsed.data.inquiryId);
  if (!gate.ok) return gate;
  const { data, error } = await gate.actor.admin.rpc("messaging_set_conversation_state", {
    p_tenant_id: gate.row.tenantId,
    p_inquiry_id: parsed.data.inquiryId,
    p_state: parsed.data.state,
    p_actor: gate.actor.userId,
    p_expected_version: parsed.data.expectedVersion,
  });
  if (error) return fail("unavailable");
  const row = data as { ok?: boolean; reason?: string; version?: number } | null;
  if (!row?.ok) return fail(row?.reason === "conflict" ? "conflict" : row?.reason === "not_found" ? "not_found" : "unavailable");
  return { ok: true as const, version: row.version };
}
