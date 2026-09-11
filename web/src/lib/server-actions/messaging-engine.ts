"use server";

import { z } from "zod";

import { createInquiryFromIntent } from "@/lib/inquiry/inquiry-intent-engine";
import type { InquiryIntent } from "@/lib/inquiry/inquiry-intent";
import { sendOffer } from "@/lib/inquiry/inquiry-engine-offers";
import { addLine, createDraftOrder } from "@/lib/pos/draft";
import { createPaymentLink } from "@/lib/payments/links";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { messagingChannel } from "@/lib/messaging/channels";
import { renderCard } from "@/lib/messaging/cards";
import { loadMessagingEssentials } from "@/lib/messaging/essentials";
import { loadMessagingInbox } from "@/lib/messaging/inbox";
import { matchCustomers } from "@/lib/messaging/match-customers";
import { fail } from "@/lib/messaging/refusals";
import { searchMessaging } from "@/lib/messaging/search";
import { loadMessagingThread } from "@/lib/messaging/thread";
import { issueVisitorCode, signThreadToken, verifyThreadToken } from "@/lib/messaging/thread-token";
import type { ActionResult, CardKind, InboxFilter, MessagingChannel, RecordKind } from "@/lib/messaging/types";

const uuid = z.string().uuid();
const version = z.number().int().nonnegative();

function scoped(admin: SupabaseClient, table: string, tenantId: string) {
  return tenantScopedQuery(admin, table, tenantId);
}

async function staff() {
  const guard = await requireWorkspaceStaffAction();
  if (!guard.ok) return { ok: false as const, reason: "not_allowed" as const };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false as const, reason: "unavailable" as const };
  return { ok: true as const, tenantId: guard.tenantId, userId: guard.user.id, admin, supabase: guard.supabase };
}

function parseRpc(data: unknown): ActionResult<{ version?: number; extra?: Record<string, unknown> }> {
  const row = data as { ok?: boolean; reason?: string; version?: number } | null;
  if (!row) return fail("unavailable");
  if (row.ok) return { ok: true, version: row.version };
  if (row.reason === "conflict") return fail("conflict");
  if (row.reason === "not_found") return fail("not_found");
  if (row.reason === "wrong_tenant") return fail("wrong_tenant");
  if (row.reason === "already_linked") return fail("already_linked");
  return fail("invalid");
}

async function callRpc(
  admin: SupabaseClient,
  name: string,
  args: Record<string, unknown>,
): Promise<ActionResult<{ version?: number; extra?: Record<string, unknown> }>> {
  const { data, error } = await admin.rpc(name, args);
  if (error) return fail("unavailable");
  return parseRpc(data);
}

export async function messagingLoadInbox(input: { locationSlug: string; filter: InboxFilter }) {
  const g = await staff();
  if (!g.ok) return g;
  const locationSlug = input.locationSlug.trim() || "default";
  return loadMessagingInbox(g.admin, {
    tenantId: g.tenantId,
    locationSlug,
    filter: input.filter,
    actorUserId: g.userId,
  });
}

export async function messagingLoadThread(input: { inquiryId: string }) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z.object({ inquiryId: uuid }).safeParse(input);
  if (!parsed.success) return fail("invalid");
  return loadMessagingThread(g.admin, { tenantId: g.tenantId, inquiryId: parsed.data.inquiryId });
}

export async function messagingLoadEssentials(input: { inquiryId: string }) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z.object({ inquiryId: uuid }).safeParse(input);
  if (!parsed.success) return fail("invalid");
  return loadMessagingEssentials(g.admin, { tenantId: g.tenantId, inquiryId: parsed.data.inquiryId });
}

export async function messagingReply(input: {
  inquiryId: string;
  body: string;
  expectedVersion: number;
  channel?: MessagingChannel;
}) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z
    .object({ inquiryId: uuid, body: z.string().trim().min(1).max(8000), expectedVersion: version })
    .safeParse(input);
  if (!parsed.success) return fail("invalid");
  const inserted = await insertMessage(g.admin, {
    tenantId: g.tenantId,
    inquiryId: parsed.data.inquiryId,
    kind: "text",
    body: parsed.data.body,
    senderUserId: g.userId,
  });
  if (!inserted.ok) return inserted;
  const channelId = input.channel && input.channel !== "counter" ? input.channel : "web_chat";
  const adapter = messagingChannel(channelId);
  if (adapter) {
    const sent = await adapter.send({
      tenantId: g.tenantId,
      inquiryId: parsed.data.inquiryId,
      messageId: inserted.messageId,
      body: parsed.data.body,
      smsText: parsed.data.body,
      to: null,
    });
    await recordDelivery(g.admin, {
      tenantId: g.tenantId,
      messageId: inserted.messageId,
      channel: channelId,
      state: sent.ok ? "sent" : "failed",
      providerRef: sent.ok ? sent.providerRef : null,
      lastError: sent.ok ? null : sent.reason,
    });
    if (!sent.ok && channelId !== "web_chat") return { ok: false as const, reason: sent.reason };
  }
  return { ok: true as const, messageId: inserted.messageId };
}

export async function messagingInternalNote(input: { inquiryId: string; body: string }) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z.object({ inquiryId: uuid, body: z.string().trim().min(1).max(8000) }).safeParse(input);
  if (!parsed.success) return fail("invalid");
  return insertMessage(g.admin, {
    tenantId: g.tenantId,
    inquiryId: parsed.data.inquiryId,
    kind: "internal_note",
    body: parsed.data.body,
    senderUserId: g.userId,
  });
}

export async function messagingAssignOwner(input: {
  inquiryId: string;
  ownerUserId: string | null;
  expectedVersion: number;
}) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z
    .object({ inquiryId: uuid, ownerUserId: uuid.nullable(), expectedVersion: version })
    .safeParse(input);
  if (!parsed.success) return fail("invalid");
  return callRpc(g.admin, "messaging_assign_owner", {
    p_tenant_id: g.tenantId,
    p_inquiry_id: parsed.data.inquiryId,
    p_owner_user_id: parsed.data.ownerUserId,
    p_expected_version: parsed.data.expectedVersion,
  });
}

export async function messagingResolve(input: { inquiryId: string; expectedVersion: number }) {
  return setConversationState(input, "resolved");
}

export async function messagingReopen(input: { inquiryId: string; expectedVersion: number }) {
  return setConversationState(input, "needs_reply");
}

export async function messagingHandOver(input: {
  inquiryId: string;
  ownerUserId: string;
  expectedVersion: number;
}) {
  const assigned = await messagingAssignOwner(input);
  if (!assigned.ok) return assigned;
  return { ok: true as const };
}

async function setConversationState(
  input: { inquiryId: string; expectedVersion: number },
  state: "needs_reply" | "awaiting_customer" | "resolved",
) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z.object({ inquiryId: uuid, expectedVersion: version }).safeParse(input);
  if (!parsed.success) return fail("invalid");
  return callRpc(g.admin, "messaging_set_conversation_state", {
    p_tenant_id: g.tenantId,
    p_inquiry_id: parsed.data.inquiryId,
    p_state: state,
    p_actor: g.userId,
    p_expected_version: parsed.data.expectedVersion,
  });
}

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
  const token = signThreadToken(created.inquiryId, g.tenantId);
  return { ok: true as const, inquiryId: created.inquiryId, token };
}

export async function messagingMatchCustomers(input: {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
}) {
  const g = await staff();
  if (!g.ok) return g;
  const { data, error } = await scoped(g.admin, "customers", g.tenantId)
    .select("id, display_name, email, phone_e164")
    .limit(200);
  if (error) return fail("unavailable");
  return {
    ok: true as const,
    matches: matchCustomers({
      name: input.name,
      email: input.email,
      phone: input.phone,
      customers: (data ?? []) as { id: string; display_name: string | null; email: string | null; phone_e164: string | null }[],
    }),
  };
}

export async function messagingCaptureIdentity(input: {
  inquiryId: string;
  level: "linked" | "confirmed" | "granted";
  method: "phone" | "email" | "sms_code" | "name_only" | "staff";
  customerId: string | null;
  expectedVersion: number;
}) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z
    .object({
      inquiryId: uuid,
      level: z.enum(["linked", "confirmed", "granted"]),
      method: z.enum(["phone", "email", "sms_code", "name_only", "staff"]),
      customerId: uuid.nullable(),
      expectedVersion: version,
    })
    .safeParse(input);
  if (!parsed.success) return fail("invalid");
  return callRpc(g.admin, "messaging_set_identity", {
    p_tenant_id: g.tenantId,
    p_inquiry_id: parsed.data.inquiryId,
    p_level: parsed.data.level,
    p_method: parsed.data.method,
    p_customer_id: parsed.data.customerId,
    p_expected_version: parsed.data.expectedVersion,
  });
}

export async function messagingLinkRecord(input: {
  inquiryId: string;
  recordKind: RecordKind;
  recordId: string;
  expectedVersion: number;
}) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z
    .object({
      inquiryId: uuid,
      recordKind: z.enum(["order", "appointment", "reservation", "class_enrolment", "tickets", "project", "offer"]),
      recordId: uuid,
      expectedVersion: version,
    })
    .safeParse(input);
  if (!parsed.success) return fail("invalid");
  return callRpc(g.admin, "messaging_link_record", {
    p_tenant_id: g.tenantId,
    p_inquiry_id: parsed.data.inquiryId,
    p_record_kind: parsed.data.recordKind,
    p_record_id: parsed.data.recordId,
    p_linked_by: g.userId,
    p_expected_version: parsed.data.expectedVersion,
  });
}

export async function messagingUnlinkRecord(input: {
  inquiryId: string;
  linkId: string;
  expectedVersion: number;
}) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z.object({ inquiryId: uuid, linkId: uuid, expectedVersion: version }).safeParse(input);
  if (!parsed.success) return fail("invalid");
  return callRpc(g.admin, "messaging_unlink_record", {
    p_tenant_id: g.tenantId,
    p_inquiry_id: parsed.data.inquiryId,
    p_link_id: parsed.data.linkId,
    p_expected_version: parsed.data.expectedVersion,
  });
}

export async function messagingRelinkImpact(input: { inquiryId: string; recordKind: RecordKind; recordId: string }) {
  const g = await staff();
  if (!g.ok) return g;
  const essentials = await loadMessagingEssentials(g.admin, { tenantId: g.tenantId, inquiryId: input.inquiryId });
  if (!essentials.ok) return essentials;
  return {
    ok: true as const,
    impact: {
      currentLinks: essentials.essentials.linked,
      next: { kind: input.recordKind, recordId: input.recordId },
    },
  };
}

export async function messagingSendOptions(input: {
  inquiryId: string;
  kind: Extract<
    CardKind,
    "menu_options" | "service_card" | "professional_times" | "class_card" | "tickets_card"
  >;
  payload: Record<string, unknown>;
  addToDraft?: { orderId: string; offeringId: string; units: number; expectedVersion: number };
}) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z.object({ inquiryId: uuid, kind: z.string().min(3) }).safeParse(input);
  if (!parsed.success) return fail("invalid");
  const card = renderCard(input.kind, { ...input.payload, state: "sent" }, "operator");
  const inserted = await insertMessage(g.admin, {
    tenantId: g.tenantId,
    inquiryId: parsed.data.inquiryId,
    kind: input.kind,
    body: card.summary || card.title,
    payload: { ...input.payload, state: "sent" },
    senderUserId: g.userId,
  });
  if (!inserted.ok) return inserted;
  if (input.addToDraft) {
    const added = await addLine(g.admin, {
      tenantId: g.tenantId,
      orderId: input.addToDraft.orderId,
      expectedVersion: input.addToDraft.expectedVersion,
      line: { offeringId: input.addToDraft.offeringId, units: input.addToDraft.units },
    });
    if (!added.ok) return fail(added.reason === "conflict" ? "conflict" : "unavailable");
  }
  return { ok: true as const, messageId: inserted.messageId };
}

export async function messagingEnsureSharedDraft(input: { inquiryId: string; currency?: string }) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z.object({ inquiryId: uuid, currency: z.string().length(3).optional() }).safeParse(input);
  if (!parsed.success) return fail("invalid");
  const { data: existing } = await scoped(g.admin, "orders", g.tenantId)
    .select("id, version")
    .eq("inquiry_id", parsed.data.inquiryId)
    .eq("status", "draft")
    .eq("source_channel", "messages")
    .maybeSingle();
  if (existing) {
    return { ok: true as const, orderId: (existing as { id: string }).id, version: (existing as { version: number }).version };
  }
  const created = await createDraftOrder(g.admin, {
    tenantId: g.tenantId,
    actorUserId: g.userId,
    currency: parsed.data.currency,
    context: "messages",
  });
  if (!created.ok) return fail("unavailable");
  await scoped(g.admin, "orders", g.tenantId)
    .update({ inquiry_id: parsed.data.inquiryId, source_channel: "messages" })
    .eq("id", created.orderId);
  return { ok: true as const, orderId: created.orderId, version: 1 };
}

export async function messagingRequestPayment(input: {
  inquiryId: string;
  orderId: string;
  amountKind: "deposit" | "full" | "none";
  amountCents: number;
  idempotencyKey: string;
  publicOrigin: string;
  expectedVersion: number;
}) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z
    .object({
      inquiryId: uuid,
      orderId: uuid,
      amountKind: z.enum(["deposit", "full", "none"]),
      amountCents: z.number().int().nonnegative(),
      idempotencyKey: z.string().trim().min(8).max(200),
      publicOrigin: z.string().url(),
      expectedVersion: version,
    })
    .safeParse(input);
  if (!parsed.success) return fail("invalid");
  if (parsed.data.amountKind === "none") {
    return { ok: true as const, amountKind: "none" as const };
  }
  // `expectedVersion` is the CONVERSATION's version, the one number the
  // Messages surface holds (a record chip carries no order version). It used
  // to be compared with the order's version, so every request from the shell
  // answered `conflict` unless the two counters happened to coincide
  // (D-row, live run 2026-09-11). The basket snapshot takes the order's own
  // current version, which is what a later "basket changed" check needs.
  const { data: inquiry } = await scoped(g.admin, "inquiries", g.tenantId)
    .select("id, version")
    .eq("id", parsed.data.inquiryId)
    .maybeSingle();
  if (!inquiry) return fail("not_found");
  if ((inquiry as { version: number }).version !== parsed.data.expectedVersion) return fail("conflict");
  const { data: order } = await scoped(g.admin, "orders", g.tenantId)
    .select("id, version, status, total_cents")
    .eq("id", parsed.data.orderId)
    .maybeSingle();
  if (!order) return fail("not_found");
  const basketVersion = (order as { version: number }).version;
  // "Full amount" with no figure from the surface means the order's total;
  // `createPaymentLink` still refuses anything above what is outstanding.
  const amountCents =
    parsed.data.amountCents > 0 ? parsed.data.amountCents : parsed.data.amountKind === "full" ? Number((order as { total_cents: number | string }).total_cents) : 0;
  if (amountCents <= 0) return fail("invalid");

  const { data: existingLink } = await scoped(g.admin, "payment_links", g.tenantId)
    .select("id, code, status")
    .eq("operation_key", parsed.data.idempotencyKey)
    .maybeSingle();
  if (existingLink && (existingLink as { status: string }).status === "open") {
    return {
      ok: true as const,
      code: (existingLink as { code: string }).code,
      reused: true,
    };
  }

  const { data: lines } = await scoped(g.admin, "order_lines", g.tenantId)
    .select("id, label, units, unit_cents")
    .eq("order_id", parsed.data.orderId);
  const snapshot = await scoped(g.admin, "checkout_snapshots", g.tenantId).insert({
    inquiry_id: parsed.data.inquiryId,
    basket: { lines: lines ?? [], version: basketVersion },
    customer: {},
    basket_version: basketVersion,
  }).select("id").single();
  if (snapshot.error || !snapshot.data) return fail("unavailable");

  const minted = await createPaymentLink(g.admin, {
    tenantId: g.tenantId,
    orderId: parsed.data.orderId,
    amountCents,
    idempotencyKey: parsed.data.idempotencyKey,
    actorUserId: g.userId,
    publicOrigin: parsed.data.publicOrigin,
  });
  if (!minted.ok) {
    if (minted.reason === "exceeds_outstanding") return fail("invalid");
    if (minted.reason === "provider_unavailable") return fail("channel_unavailable");
    return fail(minted.reason);
  }
  const { data: linkRow } = await scoped(g.admin, "payment_links", g.tenantId)
    .select("id")
    .eq("code", minted.code)
    .maybeSingle();
  await scoped(g.admin, "payment_links", g.tenantId)
    .update({ inquiry_id: parsed.data.inquiryId, basket_version: basketVersion })
    .eq("code", minted.code);
  await scoped(g.admin, "checkout_snapshots", g.tenantId)
    .update({ payment_link_id: (linkRow as { id: string } | null)?.id ?? null })
    .eq("id", (snapshot.data as { id: string }).id);
  const card = await insertMessage(g.admin, {
    tenantId: g.tenantId,
    inquiryId: parsed.data.inquiryId,
    kind: "payment_request",
    body: "",
    payload: {
      state: "sent",
      paymentLinkCode: minted.code,
      amountCents: minted.amountCents,
      amountKind: parsed.data.amountKind,
      expiresAt: minted.expiresAt,
    },
    senderUserId: g.userId,
  });
  if (!card.ok) return card;
  return { ok: true as const, code: minted.code, url: minted.url, messageId: card.messageId };
}

export async function messagingCloseLost(input: { inquiryId: string; reason: string; expectedVersion: number }) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z
    .object({ inquiryId: uuid, reason: z.string().trim().min(2).max(400), expectedVersion: version })
    .safeParse(input);
  if (!parsed.success) return fail("invalid");
  return callRpc(g.admin, "messaging_close_lost", {
    p_tenant_id: g.tenantId,
    p_inquiry_id: parsed.data.inquiryId,
    p_reason: parsed.data.reason,
    p_expected_version: parsed.data.expectedVersion,
  });
}

export async function messagingScheduleReminder(input: {
  inquiryId: string;
  sendAt: string;
  body: string;
  recordKind?: RecordKind | null;
  recordId?: string | null;
}) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z
    .object({
      inquiryId: uuid,
      sendAt: z.string().min(8),
      body: z.string().trim().min(1).max(2000),
      recordKind: z.string().nullable().optional(),
      recordId: uuid.nullable().optional(),
    })
    .safeParse(input);
  if (!parsed.success) return fail("invalid");
  const { error } = await scoped(g.admin, "scheduled_messages", g.tenantId).insert({
    inquiry_id: parsed.data.inquiryId,
    record_kind: parsed.data.recordKind ?? null,
    record_id: parsed.data.recordId ?? null,
    send_at: parsed.data.sendAt,
    body: parsed.data.body,
    card_kind: "reminder",
    state: "scheduled",
    created_by: g.userId,
  });
  if (error) return fail("unavailable");
  return { ok: true as const };
}

export async function messagingCancelReminder(input: { reminderId: string }) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z.object({ reminderId: uuid }).safeParse(input);
  if (!parsed.success) return fail("invalid");
  const { error } = await scoped(g.admin, "scheduled_messages", g.tenantId)
    .update({ state: "cancelled" })
    .eq("id", parsed.data.reminderId)
    .eq("state", "scheduled");
  if (error) return fail("unavailable");
  return { ok: true as const };
}

export async function messagingSearch(input: { query: string }) {
  const g = await staff();
  if (!g.ok) return g;
  return searchMessaging(g.admin, { tenantId: g.tenantId, query: input.query });
}

export async function messagingRecoverSnapshot(input: { snapshotId: string; orderId: string }) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z.object({ snapshotId: uuid, orderId: uuid }).safeParse(input);
  if (!parsed.success) return fail("invalid");
  return callRpc(g.admin, "messaging_recover_from_snapshot", {
    p_tenant_id: g.tenantId,
    p_snapshot_id: parsed.data.snapshotId,
    p_order_id: parsed.data.orderId,
  });
}

export async function messagingSendOffer(input: { inquiryId: string; offerId: string }) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z.object({ inquiryId: uuid, offerId: uuid }).safeParse(input);
  if (!parsed.success) return fail("invalid");
  const { data: inquiry } = await scoped(g.admin, "inquiries", g.tenantId)
    .select("version")
    .eq("id", parsed.data.inquiryId)
    .maybeSingle();
  const { data: offer } = await scoped(g.admin, "inquiry_offers", g.tenantId)
    .select("version")
    .eq("id", parsed.data.offerId)
    .maybeSingle();
  const sent = await sendOffer(g.supabase, {
    inquiryId: parsed.data.inquiryId,
    tenantId: g.tenantId,
    offerId: parsed.data.offerId,
    actorUserId: g.userId,
    inquiryExpectedVersion: Number((inquiry as { version?: number } | null)?.version ?? 1),
    offerExpectedVersion: Number((offer as { version?: number } | null)?.version ?? 1),
  });
  if (!sent.success) return fail("unavailable");
  return { ok: true as const };
}

export async function messagingGuestDraftAdd(input: {
  token: string;
  orderId: string;
  offeringId: string;
  units: number;
  expectedVersion: number;
}) {
  const token = verifyThreadToken(input.token);
  if (!token.ok) return fail("not_allowed");
  const admin = createServiceRoleClient();
  if (!admin) return fail("unavailable");
  const { data: order } = await scoped(admin, "orders", token.tenantId)
    .select("id, inquiry_id, version")
    .eq("id", input.orderId)
    .maybeSingle();
  if (!order || (order as { inquiry_id: string | null }).inquiry_id !== token.inquiryId) {
    return fail("not_found");
  }
  const added = await addLine(admin, {
    tenantId: token.tenantId,
    orderId: input.orderId,
    expectedVersion: input.expectedVersion,
    line: { offeringId: input.offeringId, units: input.units },
  });
  if (!added.ok) return fail(added.reason === "conflict" ? "conflict" : "unavailable");
  return { ok: true as const };
}

export async function messagingIssueVisitorCode(input: { token: string; phone: string }) {
  const token = verifyThreadToken(input.token);
  if (!token.ok) return fail("not_allowed");
  const admin = createServiceRoleClient();
  if (!admin) return fail("unavailable");
  const code = issueVisitorCode();
  void code;
  const sms = messagingChannel("sms");
  if (!sms) return fail("channel_unavailable");
  const sent = await sms.send({
    tenantId: token.tenantId,
    inquiryId: token.inquiryId,
    messageId: token.inquiryId,
    body: code,
    smsText: code,
    to: input.phone,
  });
  if (!sent.ok) return { ok: false as const, reason: sent.reason };
  return { ok: true as const };
}

async function insertMessage(
  admin: SupabaseClient,
  input: {
    tenantId: string;
    inquiryId: string;
    kind: string;
    body: string;
    payload?: Record<string, unknown>;
    senderUserId: string | null;
  },
): Promise<ActionResult<{ messageId: string }>> {
  const { data, error } = await scoped(admin, "inquiry_messages", input.tenantId)
    .insert({
      inquiry_id: input.inquiryId,
      thread_type: input.kind === "internal_note" ? "private" : "group",
      message_kind: input.kind,
      body: input.body,
      card_payload: input.payload ?? null,
      sender_user_id: input.senderUserId,
    })
    .select("id")
    .single();
  if (error || !data) return fail("unavailable");
  return { ok: true, messageId: (data as { id: string }).id };
}

async function recordDelivery(
  admin: SupabaseClient,
  input: {
    tenantId: string;
    messageId: string;
    channel: string;
    state: string;
    providerRef: string | null;
    lastError: string | null;
  },
) {
  await tenantScopedQuery(admin, "message_delivery", input.tenantId).upsert({
    message_id: input.messageId,
    channel: input.channel,
    state: input.state,
    provider_ref: input.providerRef,
    attempts: 1,
    last_error: input.lastError,
    updated_at: new Date().toISOString(),
  }, { onConflict: "message_id,channel" });
}
