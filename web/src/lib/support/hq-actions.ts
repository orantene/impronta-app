"use server";

import { z } from "zod";

import { assertHqAccess } from "./support-access";
import { supportEngine } from "./support-engine";
import { auditHq } from "./support-engine-emit";
import type { SupportPriority } from "./support-types";

const uuid = z.string().uuid();

type Ok = { ok: true };
type Fail = { ok: false; error: string };

export async function hqReplySupportTicketAction(raw: {
  ticketId: string;
  body: string;
  asInternalNote?: boolean;
}): Promise<Ok | Fail> {
  const parsed = z
    .object({
      ticketId: uuid,
      body: z.string().trim().min(1).max(8000),
      asInternalNote: z.boolean().optional(),
    })
    .safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const hq = await assertHqAccess();
  if (!hq.ok) return hq;

  await supportEngine.claimIfUnassigned(parsed.data.ticketId, hq.userId);

  const result = await supportEngine.appendMessage({
    ticketId: parsed.data.ticketId,
    authorKind: "agent",
    authorUserId: hq.userId,
    body: parsed.data.body,
    messageKind: parsed.data.asInternalNote ? "note" : "text",
    skipNotify: parsed.data.asInternalNote === true,
    asHq: true,
  });
  if (!result.ok) return result;
  return { ok: true };
}

export async function hqChangeStatusAction(raw: {
  ticketId: string;
  status: "open" | "resolved" | "closed";
}): Promise<Ok | Fail> {
  const parsed = z
    .object({
      ticketId: uuid,
      status: z.enum(["open", "resolved", "closed"]),
    })
    .safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const hq = await assertHqAccess();
  if (!hq.ok) return hq;
  const result = await supportEngine.changeStatus({
    ticketId: parsed.data.ticketId,
    status: parsed.data.status,
    actorUserId: hq.userId,
    actorKind: "agent",
    asHq: true,
  });
  if (!result.ok) return result;
  return { ok: true };
}

export async function hqAssignTicketAction(raw: {
  ticketId: string;
  assigneeUserId: string | null;
}): Promise<Ok | Fail> {
  const parsed = z
    .object({
      ticketId: uuid,
      assigneeUserId: z.string().uuid().nullable(),
    })
    .safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const hq = await assertHqAccess();
  if (!hq.ok) return hq;
  const result = await supportEngine.assignTicket({
    ticketId: parsed.data.ticketId,
    assigneeUserId: parsed.data.assigneeUserId,
    actorUserId: hq.userId,
  });
  if (!result.ok) return result;
  return { ok: true };
}

export async function hqSetPriorityAction(raw: {
  ticketId: string;
  priority: SupportPriority;
}): Promise<Ok | Fail> {
  const parsed = z
    .object({
      ticketId: uuid,
      priority: z.enum(["low", "normal", "high", "urgent"]),
    })
    .safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const hq = await assertHqAccess();
  if (!hq.ok) return hq;
  const result = await supportEngine.setPriority({
    ticketId: parsed.data.ticketId,
    priority: parsed.data.priority,
    actorUserId: hq.userId,
  });
  if (!result.ok) return result;
  return { ok: true };
}

export async function hqSetCategoryAction(raw: {
  ticketId: string;
  category: string | null;
}): Promise<Ok | Fail> {
  const parsed = z
    .object({
      ticketId: uuid,
      category: z.string().trim().max(80).nullable(),
    })
    .safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const hq = await assertHqAccess();
  if (!hq.ok) return hq;
  const result = await supportEngine.setCategory({
    ticketId: parsed.data.ticketId,
    category: parsed.data.category,
    actorUserId: hq.userId,
    actorKind: "agent",
  });
  if (!result.ok) return result;
  return { ok: true };
}

export async function hqEscalateOverrideAction(raw: {
  ticketId: string;
}): Promise<Ok | Fail> {
  const parsed = z.object({ ticketId: uuid }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const hq = await assertHqAccess();
  if (!hq.ok) return hq;
  const result = await supportEngine.escalateTicket({
    ticketId: parsed.data.ticketId,
    reason: "staff_initiated",
    actorUserId: hq.userId,
  });
  if (!result.ok) return result;
  return { ok: true };
}

/**
 * "Still working on it."
 *
 * There was no way to tell a customer their case is taking longer. A ticket
 * could sit past its target with the customer hearing nothing, and silence
 * after a handoff is what people actually complain about — more than the delay.
 *
 * Sent as a card rather than a typed reply so it renders consistently, carries
 * the agent's face, and can be counted later. It deliberately does NOT change
 * `waiting_on`: the case is still with support, and pretending otherwise would
 * hide it from the "needs you" queue.
 */
export async function hqSendDelayUpdateAction(raw: {
  ticketId: string;
  note?: string;
  nextUpdate?: string;
}): Promise<Ok | Fail> {
  const parsed = z
    .object({
      ticketId: uuid,
      note: z.string().trim().max(600).optional(),
      nextUpdate: z.string().trim().max(80).optional(),
    })
    .safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const hq = await assertHqAccess();
  if (!hq.ok) return hq;

  const result = await supportEngine.appendMessage({
    ticketId: parsed.data.ticketId,
    authorKind: "agent",
    authorUserId: hq.userId,
    // Body doubles as the plain-text fallback in email and any surface that
    // does not render cards.
    body: parsed.data.note?.trim() || "Still working on this. You have not been forgotten.",
    messageKind: "card",
    cardPayload: {
      kind: "delay",
      note: parsed.data.note?.trim() || null,
      nextUpdate: parsed.data.nextUpdate?.trim() || null,
    },
    asHq: true,
  });
  if (!result.ok) return result;

  await auditHq(hq.userId, parsed.data.ticketId, "support.delay_update.sent", {
    hasNote: Boolean(parsed.data.note?.trim()),
    nextUpdate: parsed.data.nextUpdate?.trim() || null,
  });
  return { ok: true };
}

export async function hqClaimSelfAction(raw: { ticketId: string }): Promise<Ok | Fail> {
  const parsed = z.object({ ticketId: uuid }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const hq = await assertHqAccess();
  if (!hq.ok) return hq;
  const result = await supportEngine.assignTicket({
    ticketId: parsed.data.ticketId,
    assigneeUserId: hq.userId,
    actorUserId: hq.userId,
  });
  if (!result.ok) return result;
  return { ok: true };
}

export async function hqLoadTicketDetailAction(raw: { ticketId: string }): Promise<
  | { ok: true; data: NonNullable<Awaited<ReturnType<typeof import("./load-hq").loadHqTicketDetail>>> }
  | Fail
> {
  const parsed = z.object({ ticketId: uuid }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const hq = await assertHqAccess();
  if (!hq.ok) return hq;
  const { loadHqTicketDetail } = await import("./load-hq");
  const data = await loadHqTicketDetail(parsed.data.ticketId);
  if (!data) return { ok: false, error: "Ticket not found." };
  // Opening a ticket returns the full thread INCLUDING platform-only internal
  // notes, the requester's email, their client diagnostics (URLs, console
  // errors, user agent) and their past tickets. Replies and status changes were
  // already audited; the read that exposes all of this was not, so "who looked
  // at my data, and when" had no answer. Best-effort — a failed audit write must
  // not block support, but it is no longer simply absent.
  await auditHq(hq.userId, parsed.data.ticketId, "support.ticket.viewed", {
    surface: data.ticket.surface,
    tenantId: data.ticket.tenantId,
    messageCount: data.messages.length,
    hasDiagnostics: Boolean(data.context.diagnostics),
    pastTicketCount: data.context.pastTickets.length,
  });
  return { ok: true, data };
}

export async function hqSaveInvestigationFindingsAction(raw: {
  ticketId: string;
  markdown: string;
}): Promise<Ok | Fail> {
  const parsed = z
    .object({ ticketId: uuid, markdown: z.string().max(80_000) })
    .safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const hq = await assertHqAccess();
  if (!hq.ok) return hq;
  const { parseInvestigationFindings } = await import("./investigation/bundle");
  const { createServiceRoleClient } = await import("@/lib/supabase/admin");
  const { supportFrom } = await import("./support-from");
  const parsedMd = parseInvestigationFindings(parsed.data.markdown);
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Not configured." };
  const { error } = await supportFrom(admin, "support_tickets")
    .update({
      root_cause: parsedMd.rootCause,
      long_term_fix: parsedMd.longTermFix,
    })
    .eq("id", parsed.data.ticketId);
  if (error) return { ok: false, error: "Could not save findings." };
  return { ok: true };
}

export async function hqSaveCannedRepliesAction(raw: {
  entries: Array<{ id: string; title: string; body: string }>;
}): Promise<Ok | Fail> {
  const parsed = z
    .object({
      entries: z
        .array(
          z.object({
            id: z.string().trim().min(1).max(80),
            title: z.string().trim().min(1).max(60),
            body: z.string().trim().min(1).max(2000),
          }),
        )
        .max(30),
    })
    .safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const hq = await assertHqAccess();
  if (!hq.ok) return hq;
  const { writeSupportCannedReplies } = await import("@/lib/platform/support-canned");
  const { logPlatformAdminAction } = await import("@/lib/platform/audit");
  const written = await writeSupportCannedReplies(hq.userId, parsed.data.entries);
  if (!written.ok) return written;
  await logPlatformAdminAction({
    actorUserId: hq.userId,
    targetKind: "workspace",
    targetId: "platform_settings",
    action: "support.canned_replies.save",
    after: { count: parsed.data.entries.length },
    supportMode: "read_only",
  });
  return { ok: true };
}

export async function hqSummarizeDiagnosticsAction(raw: {
  ticketId: string;
}): Promise<{ ok: true; summary: string } | Fail> {
  const parsed = z.object({ ticketId: uuid }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const hq = await assertHqAccess();
  if (!hq.ok) return hq;

  const { isResolvedAiChatConfigured, resolveAiChatAdapter } = await import("@/lib/ai/resolve-provider");
  const { assertAiInvocationAllowed, recordAiUsageEstimate } = await import("@/lib/ai/ai-usage-gate");
  const { DEFAULT_AI_TENANT_ID } = await import("@/lib/ai/ai-tenant-constants");
  const { getAiFeatureFlags } = await import("@/lib/settings/ai-feature-flags");
  const { createServiceRoleClient } = await import("@/lib/supabase/admin");
  const { supportFrom } = await import("./support-from");
  const { logServerError } = await import("@/lib/server/safe-error");

  const flags = await getAiFeatureFlags();
  if (!flags.ai_master_enabled || !flags.ai_support_enabled || !(await isResolvedAiChatConfigured())) {
    return { ok: false, error: "AI is not available." };
  }
  const gate = await assertAiInvocationAllowed(DEFAULT_AI_TENANT_ID);
  if (!gate.ok) return { ok: false, error: "AI is not available." };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Not configured." };
  const { data: diag } = await supportFrom(admin, "support_ticket_diagnostics")
    .select("console_events, network_failures, route_history, route, url, app_version")
    .eq("ticket_id", parsed.data.ticketId)
    .maybeSingle();
  if (!diag) return { ok: false, error: "No diagnostics on this ticket." };

  const adapter = await resolveAiChatAdapter();
  const timeout = new Promise<null>((resolve) => {
    setTimeout(() => resolve(null), 15_000);
  });
  const completion = await Promise.race([
    adapter.chatCompletion({
      model: "claude-haiku-4-5",
      systemPrompt:
        "You summarize in-app support diagnostics for Tulala HQ. At most 3 short plain-language bullets on what looks broken. Ground only in the JSON. No em dashes. No preamble.",
      userMessage: JSON.stringify({
        route: diag.route ?? null,
        url: diag.url ?? null,
        app_version: diag.app_version ?? null,
        console: diag.console_events ?? [],
        network: diag.network_failures ?? [],
        routes: diag.route_history ?? [],
      }),
      temperature: 0.2,
      maxTokens: 280,
    }),
    timeout,
  ]);
  if (!completion?.ok) {
    return { ok: false, error: "Could not summarize." };
  }
  const summary = completion.text.trim().slice(0, 2000);
  if (!summary) return { ok: false, error: "Could not summarize." };

  const { error } = await supportFrom(admin, "support_ticket_diagnostics")
    .update({ ai_summary: summary })
    .eq("ticket_id", parsed.data.ticketId);
  if (error) {
    logServerError("support.diagnostics.summarize", error);
    return { ok: false, error: "Could not save summary." };
  }
  void recordAiUsageEstimate(DEFAULT_AI_TENANT_ID);
  return { ok: true, summary };
}
