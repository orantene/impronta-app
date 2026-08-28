"use server";

import { z } from "zod";

import { logPlatformAdminAction } from "@/lib/platform/audit";
import { requireSession } from "@/lib/server/action-guards";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { assertHqAccess, assertTicketAccess } from "../support-access";
import { supportEngine } from "../support-engine";
import { supportFrom } from "../support-from";
import { applyApprovedAction } from "./apply";
import { pickWhitelistedPatch, type ProposedActionKind } from "./kinds";

const uuid = z.string().uuid();

function previewFromPayload(kind: ProposedActionKind, payload: Record<string, unknown>): Record<string, unknown> {
  if (kind === "settings_patch") {
    return { changes: payload };
  }
  return payload;
}

export async function hqProposeFixAction(raw: {
  ticketId: string;
  kind: ProposedActionKind;
  title: string;
  description: string;
  payload: Record<string, unknown>;
}): Promise<{ ok: true; actionId: string } | { ok: false; error: string }> {
  const parsed = z
    .object({
      ticketId: uuid,
      kind: z.enum(["settings_patch", "builder_draft_revision", "instruction"]),
      title: z.string().trim().min(1).max(160),
      description: z.string().trim().min(1).max(2000),
      payload: z.record(z.string(), z.unknown()),
    })
    .safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const hq = await assertHqAccess();
  if (!hq.ok) return hq;
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Not configured." };

  let payload = parsed.data.payload;
  if (parsed.data.kind === "settings_patch") {
    const picked = pickWhitelistedPatch(payload);
    if (!picked.ok) return picked;
    payload = picked.patch;
  }

  const expiresAt = new Date(Date.now() + 7 * 86400_000).toISOString();
  const preview = previewFromPayload(parsed.data.kind, payload);
  const { data, error } = await supportFrom(admin, "support_proposed_actions")
    .insert({
      ticket_id: parsed.data.ticketId,
      proposed_by: hq.userId,
      kind: parsed.data.kind,
      title: parsed.data.title,
      description: parsed.data.description,
      payload,
      preview,
      status: "proposed",
      expires_at: expiresAt,
    })
    .select("id, tenant_id")
    .single();
  if (error || !data?.id) {
    logServerError("support.proposed.insert", error);
    return { ok: false, error: "Could not propose this fix." };
  }

  const card = await supportEngine.appendMessage({
    ticketId: parsed.data.ticketId,
    authorKind: "agent",
    authorUserId: hq.userId,
    body: parsed.data.title,
    messageKind: "card",
    cardPayload: {
      kind: "proposed-action",
      actionId: data.id,
      title: parsed.data.title,
      description: parsed.data.description,
      preview,
      actionKind: parsed.data.kind,
    },
    asHq: true,
  });
  if (!card.ok) return card;

  await logPlatformAdminAction({
    actorUserId: hq.userId,
    targetKind: "workspace",
    targetId: typeof data.tenant_id === "string" ? data.tenant_id : parsed.data.ticketId,
    action: "support.proposed_action.proposed",
    supportMode: "assisted_edit",
    after: { kind: parsed.data.kind, title: parsed.data.title, payload },
    context: {
      proposed_action_id: data.id,
      ticket_id: parsed.data.ticketId,
      support_mode: "assisted_edit",
    },
  });

  return { ok: true, actionId: String(data.id) };
}

async function loadActionForRequester(actionId: string, userId: string) {
  const accessProbe = await requireSession();
  if (!accessProbe.ok) return accessProbe;
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false as const, error: "Not configured." };
  const { data: row } = await supportFrom(admin, "support_proposed_actions")
    .select("id, ticket_id, tenant_id, status, kind, title")
    .eq("id", actionId)
    .maybeSingle();
  if (!row) return { ok: false as const, error: "Action not found." };
  const access = await assertTicketAccess(String(row.ticket_id), userId);
  if (!access.ok) return access;
  if (access.ticket.requesterUserId !== userId) {
    return { ok: false as const, error: "The workspace must approve this change." };
  }
  return { ok: true as const, row, ticket: access.ticket, admin, userId };
}

export async function approveProposedActionAction(raw: {
  actionId: string;
}): Promise<{ ok: true; status: "applied" | "failed" } | { ok: false; error: string }> {
  const parsed = z.object({ actionId: uuid }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const session = await requireSession();
  if (!session.ok) return session;
  const loaded = await loadActionForRequester(parsed.data.actionId, session.user.id);
  if (!loaded.ok) return loaded;
  if (loaded.row.status !== "proposed") return { ok: false, error: "This proposal is no longer open." };

  const { data: claimed, error } = await supportFrom(loaded.admin, "support_proposed_actions")
    .update({
      status: "approved",
      approved_by: loaded.userId,
      approved_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.actionId)
    .eq("status", "proposed")
    .select("id");
  if (error) {
    logServerError("support.proposed.approve", error);
    return { ok: false, error: "Could not approve this change." };
  }
  // Zero rows = a concurrent approve won the conditional UPDATE; without this
  // check both callers would run applyApprovedAction (double settings write).
  if (!claimed || claimed.length === 0) {
    return { ok: false, error: "This proposal is no longer open." };
  }

  const applied = await applyApprovedAction({
    actionId: parsed.data.actionId,
    approvedBy: loaded.userId,
    ticketId: String(loaded.row.ticket_id),
    tenantId: typeof loaded.row.tenant_id === "string" ? loaded.row.tenant_id : loaded.ticket.tenantId,
  });
  return { ok: true, status: applied.status };
}

export async function declineProposedActionAction(raw: {
  actionId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = z.object({ actionId: uuid }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const session = await requireSession();
  if (!session.ok) return session;
  const loaded = await loadActionForRequester(parsed.data.actionId, session.user.id);
  if (!loaded.ok) return loaded;
  if (loaded.row.status !== "proposed") return { ok: false, error: "This proposal is no longer open." };

  const { error } = await supportFrom(loaded.admin, "support_proposed_actions")
    .update({ status: "declined" })
    .eq("id", parsed.data.actionId)
    .eq("status", "proposed");
  if (error) {
    logServerError("support.proposed.decline", error);
    return { ok: false, error: "Could not decline this change." };
  }
  await supportEngine.appendMessage({
    ticketId: String(loaded.row.ticket_id),
    authorKind: "requester",
    authorUserId: loaded.userId,
    body: "Proposed fix declined",
  });
  return { ok: true };
}
