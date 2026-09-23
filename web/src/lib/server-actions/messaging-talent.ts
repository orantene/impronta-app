"use server";

import { headers } from "next/headers";
import { z } from "zod";

import {
  markTalentInquiryThreadRead,
  sendTalentInquiryMessage,
} from "@/app/(workspace)/[tenantSlug]/talent/inbox/[id]/actions";
import { acceptTalentInvitation, declineTalentInvitation } from "@/lib/inquiry/inquiry-engine-roster";
import { loadMessagingEssentials } from "@/lib/messaging/essentials";
import { loadMessagingInbox } from "@/lib/messaging/inbox";
import { insertMessage } from "@/lib/messaging/insert-message";
import { fail } from "@/lib/messaging/refusals";
import { conversationHostKind, threadLinkUrl } from "@/lib/messaging/thread-link";
import { refreshThreadToken } from "@/lib/messaging/thread-token";
import { listTalentInquiryIds, loadOwnedTalentInquiry, loadTalentActor, loadTalentSale } from "@/lib/messaging/talent-actor";
import {
  messagesForTalent,
  projectTalentLines,
  projectTalentMoney,
  talentReplyThread,
} from "@/lib/messaging/talent-pov";
import { loadMessagingThread } from "@/lib/messaging/thread";
import type { InboxFilter } from "@/lib/messaging/types";

const uuid = z.string().uuid();

async function owned(inquiryId: string) {
  const actor = await loadTalentActor();
  if (!actor.ok) return actor;
  const row = await loadOwnedTalentInquiry(actor.admin, actor.talentProfileId, inquiryId);
  if (!row.ok) return row;
  return { ok: true as const, actor, row };
}

export async function messagingTalentLoadInbox(input: { locationSlug: string; filter: InboxFilter }) {
  const actor = await loadTalentActor();
  if (!actor.ok) return actor;
  const listed = await listTalentInquiryIds(actor.admin, actor.talentProfileId);
  if (!listed.ok) return listed;
  return loadMessagingInbox(actor.admin, {
    tenantId: "",
    locationSlug: "all",
    filter: input.filter,
    actorUserId: actor.userId,
    onlyInquiryIds: listed.ids,
  });
}

export async function messagingTalentLoadThread(input: { inquiryId: string }) {
  const parsed = z.object({ inquiryId: uuid }).safeParse(input);
  if (!parsed.success) return fail("invalid");
  const gate = await owned(parsed.data.inquiryId);
  if (!gate.ok) return gate;
  const thread = await loadMessagingThread(gate.actor.admin, {
    tenantId: gate.row.tenantId,
    inquiryId: parsed.data.inquiryId,
  });
  if (!thread.ok) return thread;
  return { ok: true as const, messages: messagesForTalent(thread.messages, gate.row.isSeller) };
}

export async function messagingTalentLoadEssentials(input: { inquiryId: string }) {
  const parsed = z.object({ inquiryId: uuid }).safeParse(input);
  if (!parsed.success) return fail("invalid");
  const gate = await owned(parsed.data.inquiryId);
  if (!gate.ok) return gate;
  const essentials = await loadMessagingEssentials(gate.actor.admin, {
    tenantId: gate.row.tenantId,
    inquiryId: parsed.data.inquiryId,
  });
  if (!essentials.ok || gate.row.isSeller) return essentials;
  return { ok: true as const, essentials: { ...essentials.essentials, notes: [] } };
}

export async function messagingTalentLoadContextLines(input: { inquiryId: string }) {
  const parsed = z.object({ inquiryId: uuid }).safeParse(input);
  if (!parsed.success) return fail("invalid");
  const gate = await owned(parsed.data.inquiryId);
  if (!gate.ok) return gate;
  const sale = await loadTalentSale(
    gate.actor.admin,
    gate.actor.talentProfileId,
    parsed.data.inquiryId,
    gate.row.tenantId,
  );
  if (!sale.ok) return sale;
  if ("empty" in sale) return { ok: true as const, lines: null, money: null };
  const projected = projectTalentLines(sale.lines, gate.actor.talentProfileId, gate.row.isSeller, sale.herNetCents);
  const money = projectTalentMoney({
    isSeller: gate.row.isSeller,
    currency: sale.currency,
    clientTotalCents: sale.clientTotalCents,
    paidCents: sale.paidCents,
    herNetCents: sale.herNetCents,
  });
  const byId = new Map(sale.lines.map((line) => [line.id, line]));
  const lines = projected.map((line) => {
    const src = byId.get(line.id);
    return {
      id: line.id,
      label: line.label,
      units: line.units,
      unitCents: line.unitCents,
      proposedBy: src?.proposedBy ?? null,
      confirmed: src?.confirmed ?? false,
    };
  });
  return { ok: true as const, lines: lines.length > 0 ? lines : null, money };
}

export async function messagingTalentReply(input: {
  inquiryId: string;
  body: string;
  expectedVersion: number;
}) {
  const parsed = z
    .object({ inquiryId: uuid, body: z.string().trim().min(1).max(8000), expectedVersion: z.number() })
    .safeParse(input);
  if (!parsed.success) return fail("invalid");
  const gate = await owned(parsed.data.inquiryId);
  if (!gate.ok) return gate;
  if (talentReplyThread(gate.row.isSeller) === "private") {
    return insertMessage(gate.actor.admin, {
      tenantId: gate.row.tenantId,
      inquiryId: parsed.data.inquiryId,
      kind: "text",
      body: parsed.data.body,
      senderUserId: gate.actor.userId,
    });
  }
  const sent = await sendTalentInquiryMessage("talent", parsed.data.inquiryId, parsed.data.body, "group");
  if (!sent.ok) return fail("not_allowed");
  return { ok: true as const, messageId: sent.data.id };
}

export async function messagingTalentThreadLink(input: { inquiryId: string }) {
  const parsed = z.object({ inquiryId: uuid }).safeParse(input);
  if (!parsed.success) return fail("invalid");
  const gate = await owned(parsed.data.inquiryId);
  if (!gate.ok) return gate;
  if (!gate.row.isSeller) return fail("not_her_sale");
  const token = await refreshThreadToken(gate.actor.admin, parsed.data.inquiryId, gate.row.tenantId);
  if (!token) return fail("unavailable");
  let requestOrigin = "";
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host")?.split(",")[0]?.trim() || h.get("host")?.trim() || "";
    const proto = h.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
    if (host) requestOrigin = `${proto}://${host}`;
  } catch {
    requestOrigin = "";
  }
  const url = threadLinkUrl({
    token,
    requestOrigin,
    conversationHostKind: conversationHostKind(gate.row.sourceContext),
  });
  return { ok: true as const, token, url };
}

export async function messagingTalentNote() {
  return fail("not_allowed");
}

export async function messagingTalentInvitation(input: { inquiryId: string }) {
  const parsed = z.object({ inquiryId: uuid }).safeParse(input);
  if (!parsed.success) return fail("invalid");
  const gate = await owned(parsed.data.inquiryId);
  if (!gate.ok) return gate;
  const status = gate.row.participantStatus;
  const decision = status === "invited" || status === "active" || status === "declined" ? status : "other";
  return { ok: true as const, status: decision };
}

export async function messagingTalentDecide(input: { inquiryId: string; decision: "accept" | "decline" }) {
  const parsed = z.object({ inquiryId: uuid, decision: z.enum(["accept", "decline"]) }).safeParse(input);
  if (!parsed.success) return fail("invalid");
  const gate = await owned(parsed.data.inquiryId);
  if (!gate.ok) return gate;
  if (!gate.row.participantId) return fail("not_allowed");
  if (gate.row.participantStatus !== "invited") return fail("already");
  const ctx = {
    inquiryId: parsed.data.inquiryId,
    tenantId: gate.row.tenantId,
    actorUserId: gate.actor.userId,
    expectedVersion: gate.row.version,
  };
  const result =
    parsed.data.decision === "accept"
      ? await acceptTalentInvitation(gate.actor.supabase, ctx)
      : await declineTalentInvitation(gate.actor.supabase, ctx);
  if (!result.success) return fail(result.forbidden ? "not_allowed" : "unavailable");
  return { ok: true as const };
}

export async function messagingTalentMarkRead(input: { inquiryId: string }) {
  const parsed = z.object({ inquiryId: uuid }).safeParse(input);
  if (!parsed.success) return;
  await markTalentInquiryThreadRead("talent", parsed.data.inquiryId);
}
