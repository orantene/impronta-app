"use server";

import { z } from "zod";

import { sendOffer } from "@/lib/inquiry/inquiry-engine-offers";
import { addLine, createDraftOrder } from "@/lib/pos/draft";
import { attachPaymentLinkInquiry, createPaymentLink } from "@/lib/payments/links";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logAssignment, logCloseLost, logConversationState } from "@/lib/messaging/action-log";
import { hasMessagingMoneyPermission } from "@/lib/messaging/money-permissions";
import { messagingChannel } from "@/lib/messaging/channels";
import { contactForChannel } from "@/lib/messaging/contact-for-channel";
import { renderCard } from "@/lib/messaging/cards";
import { loadMessagingEssentials } from "@/lib/messaging/essentials";
import { loadConversationHistory as loadConversationHistoryReader } from "@/lib/messaging/history";
import { loadMessagingInbox } from "@/lib/messaging/inbox";
import { insertMessage, recordDelivery } from "@/lib/messaging/insert-message";
import { matchCustomers } from "@/lib/messaging/match-customers";
import { mergeInquiries } from "@/lib/messaging/merge";
import { linkRecordToConversation } from "@/lib/messaging/link-record";
import { fail } from "@/lib/messaging/refusals";
import { renameInquiry } from "@/lib/messaging/rename";
import { searchMessaging } from "@/lib/messaging/search";
import { loadMessagingThread } from "@/lib/messaging/thread";
import { issueVisitorCode, verifyThreadToken } from "@/lib/messaging/thread-token";
import type { ActionResult, CardKind, ConversationHistoryEntry, InboxFilter, MessagingChannel, RecordKind } from "@/lib/messaging/types";
import { normalizeEmail, normalizePhoneE164 } from "@/lib/customers/customer-identity";

const uuid = z.string().uuid();
const version = z.number().int().nonnegative();
const scoped = tenantScopedQuery;

export async function staff() { // exported for messaging-offers.ts (L6)
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

export async function messagingRename(input: { inquiryId: string; name: string; expectedVersion: number }) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z
    .object({ inquiryId: uuid, name: z.string().trim().min(1).max(120), expectedVersion: version })
    .safeParse(input);
  if (!parsed.success) return fail("invalid");
  return renameInquiry(g.admin, {
    tenantId: g.tenantId,
    inquiryId: parsed.data.inquiryId,
    name: parsed.data.name,
    expectedVersion: parsed.data.expectedVersion,
    actorUserId: g.userId,
  });
}

export async function loadConversationHistory(
  input: { inquiryId: string },
): Promise<{ ok: true; entries: ConversationHistoryEntry[] } | { ok: false; reason: string }> {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z.object({ inquiryId: uuid }).safeParse(input);
  if (!parsed.success) return fail("invalid");
  return loadConversationHistoryReader(g.admin, { tenantId: g.tenantId, inquiryId: parsed.data.inquiryId });
}

export async function messagingMerge(input: { duplicateInquiryId: string; intoInquiryId: string; expectedVersion: number }) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z
    .object({ duplicateInquiryId: uuid, intoInquiryId: uuid, expectedVersion: version })
    .safeParse(input);
  if (!parsed.success) return fail("invalid");
  return mergeInquiries(g.admin, {
    tenantId: g.tenantId,
    duplicateInquiryId: parsed.data.duplicateInquiryId,
    intoInquiryId: parsed.data.intoInquiryId,
    expectedVersion: parsed.data.expectedVersion,
    actorUserId: g.userId,
  });
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
      to: await contactForChannel(g.admin, parsed.data.inquiryId, channelId),
    });
    await recordDelivery(g.admin, {
      tenantId: g.tenantId, messageId: inserted.messageId, channel: channelId,
      state: sent.ok ? (channelId === "whatsapp" ? "queued" : "sent") : sent.reason === "rate_limited" ? "queued" : "failed",
      providerRef: sent.ok ? sent.providerRef : null,
      lastError: sent.ok || sent.reason === "rate_limited" ? null : sent.reason,
    });
    // The reply is stored either way; a channel miss is a delivery state on
    // the bubble (Not delivered · retry), never a refusal that hides the row.
    if (!sent.ok && sent.reason !== "rate_limited") {
      return { ok: true as const, messageId: inserted.messageId, delivery: "failed" as const, reason: sent.reason };
    }
  }
  return { ok: true as const, messageId: inserted.messageId, delivery: "sent" as const };
}

export async function messagingInternalNote(input: { inquiryId: string; body: string }) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z.object({ inquiryId: uuid, body: z.string().trim().min(1).max(8000) }).safeParse(input);
  if (!parsed.success) return fail("invalid");
  // S6 (D-MSG-40, item 5): gates the whole internal-note feature area —
  // there is no separate `messages.notes.write` key, and notes.read is the
  // only notes-related key the brief asked for.
  if (!(await hasMessagingMoneyPermission(g.admin, { tenantId: g.tenantId, userId: g.userId, permission: "messages.notes.read" }))) {
    return fail("not_allowed");
  }
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
  return assignOwnerCore(input, false);
}

async function assignOwnerCore(
  input: { inquiryId: string; ownerUserId: string | null; expectedVersion: number },
  handover: boolean,
) {
  const g = await staff();
  if (!g.ok) return g;
  const parsed = z
    .object({ inquiryId: uuid, ownerUserId: uuid.nullable(), expectedVersion: version })
    .safeParse(input);
  if (!parsed.success) return fail("invalid");
  const result = await callRpc(g.admin, "messaging_assign_owner", {
    p_tenant_id: g.tenantId,
    p_inquiry_id: parsed.data.inquiryId,
    p_owner_user_id: parsed.data.ownerUserId,
    p_expected_version: parsed.data.expectedVersion,
  });
  if (result.ok) {
    await logAssignment(g.admin, {
      inquiryId: parsed.data.inquiryId,
      actorUserId: g.userId,
      ownerUserId: parsed.data.ownerUserId,
      handover,
    });
  }
  return result;
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
  const assigned = await assignOwnerCore(input, true);
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
  const result = await callRpc(g.admin, "messaging_set_conversation_state", {
    p_tenant_id: g.tenantId,
    p_inquiry_id: parsed.data.inquiryId,
    p_state: state,
    p_actor: g.userId,
    p_expected_version: parsed.data.expectedVersion,
  });
  if (result.ok && (state === "resolved" || state === "needs_reply")) {
    await logConversationState(g.admin, { inquiryId: parsed.data.inquiryId, actorUserId: g.userId, state });
  }
  return result;
}

export async function messagingMatchCustomers(input: {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
}) {
  const g = await staff();
  if (!g.ok) return g;
  // D-MSG-336: tenants can exceed 200 customers. An unordered `.limit(200)`
  // missed the fixture customer (446 on journeys) so Same person? never
  // fired. Prefer identity-key lookup when email/phone is present; keep a
  // capped scan only for name-only match.
  const email = normalizeEmail(input.email);
  const phone = normalizePhoneE164(input.phone);
  let query = scoped(g.admin, "customers", g.tenantId).select("id, display_name, email, phone_e164");
  if (email || phone) {
    const parts: string[] = [];
    if (email) parts.push(`email.eq.${email}`);
    if (phone) parts.push(`phone_e164.eq.${phone}`);
    query = query.or(parts.join(","));
  } else {
    query = query.order("updated_at", { ascending: false }).limit(200);
  }
  const { data, error } = await query;
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
      // Staff put this on the draft while sending the options (S5).
      proposedBy: "staff",
      actorId: g.userId,
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
  await linkRecordToConversation(g.admin, { tenantId: g.tenantId, inquiryId: parsed.data.inquiryId, kind: "order", recordId: created.orderId, linkedBy: g.userId });
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
    // A link minted before the order named its conversation still gets one
    // (D-150): the pay page's "Back to the conversation" reads it.
    await attachPaymentLinkInquiry(g.admin, {
      tenantId: g.tenantId,
      code: (existingLink as { code: string }).code,
      orderId: parsed.data.orderId,
      inquiryId: parsed.data.inquiryId,
    });
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
    // The mint itself names the conversation on the link and on the order
    // (D-145, D-150); nothing here has to remember to do it afterwards.
    inquiryId: parsed.data.inquiryId,
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
    .update({ basket_version: basketVersion })
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
  // S6 (D-MSG-40, item 5).
  if (!(await hasMessagingMoneyPermission(g.admin, { tenantId: g.tenantId, userId: g.userId, permission: "messages.close_lost" }))) {
    return fail("not_allowed");
  }
  const result = await callRpc(g.admin, "messaging_close_lost", {
    p_tenant_id: g.tenantId,
    p_inquiry_id: parsed.data.inquiryId,
    p_reason: parsed.data.reason,
    p_expected_version: parsed.data.expectedVersion,
  });
  if (result.ok) {
    await logCloseLost(g.admin, { inquiryId: parsed.data.inquiryId, actorUserId: g.userId, reason: parsed.data.reason });
  }
  return result;
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
    .select("version, total_client_price, currency_code, valid_until")
    .eq("id", parsed.data.offerId)
    .maybeSingle();
  const o = offer as { version?: number; total_client_price?: number | string | null; currency_code?: string | null; valid_until?: string | null } | null;
  const sent = await sendOffer(g.supabase, {
    inquiryId: parsed.data.inquiryId,
    tenantId: g.tenantId,
    offerId: parsed.data.offerId,
    actorUserId: g.userId,
    inquiryExpectedVersion: Number((inquiry as { version?: number } | null)?.version ?? 1),
    offerExpectedVersion: Number(o?.version ?? 1),
  });
  if (!sent.success) return fail("unavailable");
  // The offer card in the stream (D06): the client link renders it with
  // Accept / Ask for changes / Decline; the operator sees Sent → Viewed → ....
  await insertMessage(g.admin, {
    tenantId: g.tenantId,
    inquiryId: parsed.data.inquiryId,
    kind: "offer_review",
    body: `Offer v${Number(o?.version ?? 1)} sent`,
    payload: { state: "sent", offerId: parsed.data.offerId, version: Number(o?.version ?? 1), totalCents: Math.round(Number(o?.total_client_price ?? 0) * 100), currency: o?.currency_code ?? "USD", validUntil: o?.valid_until ?? null },
    senderUserId: g.userId,
  });
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
    // The client chose this from their link: the line is theirs until staff
    // confirm it (owner decision 3; S5).
    proposedBy: "client",
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

