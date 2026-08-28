"use server";

import { z } from "zod";

import { dispatchEventNotifications } from "@/lib/notifications/dispatcher";
import { requireSession } from "@/lib/server/action-guards";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { assertHqAccess } from "../support-access";
import { loadTicketById, supportEngine } from "../support-engine";
import { supportFrom } from "../support-from";
import { loadTicketFixLinks, loadTicketInsight } from "./load";
import type { FixLinkKind, SupportFixLinkRow, SupportInsightRow } from "./types";

const uuid = z.string().uuid();

export async function hqLoadTicketInsightAction(raw: { ticketId: string }): Promise<
  { ok: true; insight: SupportInsightRow | null; links: SupportFixLinkRow[] } | { ok: false; error: string }
> {
  const parsed = z.object({ ticketId: uuid }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const hq = await assertHqAccess();
  if (!hq.ok) return hq;
  return {
    ok: true,
    insight: await loadTicketInsight(parsed.data.ticketId),
    links: await loadTicketFixLinks(parsed.data.ticketId),
  };
}

export async function hqConfirmInsightAction(raw: {
  insightId: string;
  productArea?: string;
  tags?: string[];
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = z
    .object({
      insightId: uuid,
      productArea: z.string().trim().max(80).optional(),
      tags: z.array(z.string().trim().max(40)).max(12).optional(),
    })
    .safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const hq = await assertHqAccess();
  if (!hq.ok) return hq;
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Not configured." };
  const patch: Record<string, unknown> = {
    confirmed_at: new Date().toISOString(),
    confirmed_by: hq.userId,
  };
  if (parsed.data.productArea !== undefined) patch.product_area = parsed.data.productArea;
  if (parsed.data.tags !== undefined) patch.tags = parsed.data.tags;
  const { error } = await supportFrom(admin, "support_ticket_insights").update(patch).eq("id", parsed.data.insightId);
  if (error) {
    logServerError("support.insight.confirm", error);
    return { ok: false, error: "Could not confirm this insight." };
  }
  return { ok: true };
}

export async function hqAddFixLinkAction(raw: {
  ticketId: string;
  kind: FixLinkKind;
  url: string;
  note?: string;
  notifyRequester?: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = z
    .object({
      ticketId: uuid,
      kind: z.enum(["commit", "pr", "release", "doc"]),
      url: z
        .string()
        .url()
        .max(800)
        .refine((u) => /^https?:\/\//i.test(u), "http(s) links only"),
      note: z.string().trim().max(200).optional(),
      notifyRequester: z.boolean().optional(),
    })
    .safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const hq = await assertHqAccess();
  if (!hq.ok) return hq;
  const session = await requireSession();
  if (!session.ok) return session;
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Not configured." };
  const { error } = await supportFrom(admin, "support_ticket_fix_links").insert({
    ticket_id: parsed.data.ticketId,
    kind: parsed.data.kind,
    url: parsed.data.url,
    note: parsed.data.note ?? null,
  });
  if (error) {
    logServerError("support.fix_link.insert", error);
    return { ok: false, error: "Could not add this link." };
  }
  if (parsed.data.notifyRequester) {
    const ticket = await loadTicketById(parsed.data.ticketId, admin);
    if (ticket) {
      const card = await supportEngine.appendMessage({
        ticketId: ticket.id,
        authorKind: "system",
        authorUserId: hq.userId,
        messageKind: "card",
        skipNotify: true,
        body: parsed.data.note?.trim() || "The issue you reported is fixed",
        cardPayload: { kind: "issue-fixed", note: parsed.data.note ?? "" },
      });
      await dispatchEventNotifications({
        type: "support.ticket.fixed",
        tenantId: ticket.tenantId,
        eventId: card.ok ? card.data.message.id : crypto.randomUUID(),
        userId: ticket.requesterUserId,
        payload: {
          ticketId: ticket.id,
          ticketNumber: ticket.ticketNumber,
          subject: ticket.subject,
          surface: ticket.surface,
          note: parsed.data.note ?? "",
          platformFrom: true,
        },
      }).catch(() => undefined);
    }
  }
  return { ok: true };
}
