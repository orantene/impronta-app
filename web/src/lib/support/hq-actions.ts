"use server";

import { z } from "zod";

import { assertHqAccess } from "./support-access";
import { supportEngine } from "./support-engine";
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
