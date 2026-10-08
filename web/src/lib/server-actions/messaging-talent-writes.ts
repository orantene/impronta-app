"use server";

import { z } from "zod";

import { createInquiryFromIntent } from "@/lib/inquiry/inquiry-intent-engine";
import type { InquiryIntent } from "@/lib/inquiry/inquiry-intent";
import { insertMessage } from "@/lib/messaging/insert-message";
import { fail } from "@/lib/messaging/refusals";
import { loadOwnedTalentInquiry, loadTalentActor } from "@/lib/messaging/talent-actor";
import { talentWriteRefusal } from "@/lib/messaging/talent-writes";
import { signThreadToken } from "@/lib/messaging/thread-token";
import type { MessagingChannel } from "@/lib/messaging/types";
import { loadTalentOfferingsForEditor } from "@/lib/talent/offerings-actions";
import { logServerError } from "@/lib/server/safe-error";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import { getPlatformHubTenant } from "@/lib/saas/platform-hub";
import { getRequestLocale } from "@/i18n/request-locale";
import { requireNotImpersonating } from "@/lib/impersonation/readonly-guard";

/** The stored quote line is written in the talent's language (e2e: "Quote:" leaked English). */
function quoteWord(locale: string): string {
  return locale === "es" ? "Cotización" : "Quote";
}

/**
 * F38: the talent's own Messages writers (mockup msg_d / msg_actions). A
 * solo talent sells on the platform hub, so she can start a conversation
 * with her own client, keep private notes and resolve / reopen her own
 * threads. On an agency sale the agency owns the thread and these refuse
 * (the seller-mode chrome does not show them there).
 *
 * New conversations go through the inquiry funnel (createInquiryFromIntent
 * → submitInquiry) on the hub tenant, as a `talent_self` initiator: the
 * permission gate admits a talent only for her own profile on the hub.
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
  /** Send quote panel: one of her own published offerings, priced from the catalog on the server. */
  quoteOfferingId?: string | null;
  quoteNote?: string | null;
}) {
  await requireNotImpersonating();
  const parsed = z
    .object({
      name: z.string().trim().min(1).max(200),
      email: z.string().trim().email().nullable().optional(),
      phone: z.string().trim().max(32).nullable().optional(),
      channel: z.enum(["web_chat", "whatsapp", "sms", "email", "counter"]),
      firstMessage: z.string().trim().max(4000).nullable().optional(),
      quoteOfferingId: uuid.nullable().optional(),
      quoteNote: z.string().trim().max(2000).nullable().optional(),
    })
    .safeParse(input);
  if (!parsed.success) return fail("invalid");
  if (parsed.data.channel === "web_chat") return fail("not_allowed");
  const email = parsed.data.email || null;
  const phone = parsed.data.phone || null;
  if (!email && !phone) return fail("invalid");
  const actor = await loadTalentActor();
  if (!actor.ok) return actor;
  const hub = await getPlatformHubTenant();
  if (!hub?.tenantId) return fail("unavailable");
  const tenantId = hub.tenantId;
  const admin = actor.admin;

  // A quote names one of HER published offerings. Title and price come from the
  // catalog row, never from the client, and a foreign offering id is refused.
  let quoteBrief: string | null = null;
  let quoteContext: Record<string, unknown> = {};
  if (parsed.data.quoteOfferingId) {
    const own = await loadTalentOfferingsForEditor(actor.talentProfileId);
    const o = own.ok ? own.items.find((x) => x.id === parsed.data.quoteOfferingId) : undefined;
    if (!o || o.status !== "published") return fail("not_found");
    const price = o.amountCents != null ? ` (${(o.amountCents / 100).toFixed(2)} ${o.currency})` : "";
    quoteBrief = [`${quoteWord(await getRequestLocale())}: ${o.title}${price}`, parsed.data.quoteNote].filter(Boolean).join("\n");
    quoteContext = { quote_offering_id: o.id };
  }

  // Inquiry funnel: the one creation path. `talent_self` lets the engine
  // admit her only for her own profile on the hub (talent-self-inquiry.ts).
  const intent: InquiryIntent = {
    source: "admin_created",
    source_context: { started_by: "talent", acting_talent_user_id: actor.userId, channel: parsed.data.channel, ...quoteContext },
    requester: { name: parsed.data.name, email: email ?? undefined, phone: phone ?? undefined },
    talent: { selected_ids: [actor.talentProfileId] },
    brief: { summary: parsed.data.firstMessage || quoteBrief || "Conversation started from Messages" },
    location: { status: "not_sure" },
    date: { status: "not_sure" },
  };
  const created = await createInquiryFromIntent(admin, intent, {
    tenant_id: tenantId,
    actor_user_id: actor.userId,
    client_user_id: null,
    talent_self: true,
  });
  if (!created.ok) return fail(created.reason === "forbidden" ? "not_allowed" : "unavailable");
  const inquiryId = created.inquiryId;
  // F99: these four writes are independent, so they run together instead of
  // one round trip after another. The version is read after they all land.
  const { ensureCustomer } = await import("@/lib/customers/ensure-customer");
  const [, , , customer] = await Promise.all([
    tenantScopedQuery(admin, "inquiries", tenantId)
      .update({ channel: parsed.data.channel, location_slug: "default", owner_user_id: actor.userId })
      .eq("id", inquiryId),
    // She started it: her own seat is active, not an invitation to accept.
    tenantScopedQuery(admin, "inquiry_participants", tenantId)
      .update({ status: "active" })
      .eq("inquiry_id", inquiryId)
      .eq("talent_profile_id", actor.talentProfileId)
      .eq("role", "talent"),
    parsed.data.firstMessage
      ? insertMessage(admin, { tenantId, inquiryId, kind: "text", body: parsed.data.firstMessage, senderUserId: actor.userId })
      : Promise.resolve(null),
    // She typed the phone or email: the client is known, so the thread starts
    // confirmed and linked to a customer row (her Clients list reads those).
    ensureCustomer({ tenantId, email, phone, displayName: parsed.data.name }, { admin }),
  ]);
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
  await requireNotImpersonating();
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
  await requireNotImpersonating();
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
