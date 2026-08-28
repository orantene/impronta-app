"use server";

import { z } from "zod";

import { logPlatformAdminAction } from "@/lib/platform/audit";
import { requireSession } from "@/lib/server/action-guards";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { assertHqAccess, assertTicketAccess } from "../support-access";
import { supportEngine } from "../support-engine";
import { supportFrom } from "../support-from";

const uuid = z.string().uuid();

export async function hqRequestLiveViewAction(raw: { ticketId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = z.object({ ticketId: uuid }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const hq = await assertHqAccess();
  if (!hq.ok) return hq;
  const result = await supportEngine.appendMessage({
    ticketId: parsed.data.ticketId,
    authorKind: "agent",
    authorUserId: hq.userId,
    body: "Live view requested",
    messageKind: "card",
    cardPayload: {
      kind: "live-view",
      ticketId: parsed.data.ticketId,
      title: "Oran would like to view your screen",
      description: "This tab only. Inputs stay hidden. You can stop any time.",
    },
    asHq: true,
  });
  if (!result.ok) return result;
  await logPlatformAdminAction({
    actorUserId: hq.userId,
    targetKind: "workspace",
    targetId: hq.userId,
    action: "support.live.requested",
    supportMode: "read_only",
    context: { ticketId: parsed.data.ticketId, support_mode: "read_only" },
  });
  return { ok: true };
}

export async function acceptLiveViewAction(raw: { ticketId: string }): Promise<
  { ok: true; sessionId: string } | { ok: false; error: string }
> {
  const parsed = z.object({ ticketId: uuid }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const session = await requireSession();
  if (!session.ok) return session;
  const access = await assertTicketAccess(parsed.data.ticketId, session.user.id);
  if (!access.ok) return access;
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Not configured." };
  const days = Number(process.env.SUPPORT_REPLAY_RETENTION_DAYS ?? 30);
  const expiresAt = new Date(Date.now() + (Number.isFinite(days) && days > 0 ? days : 30) * 86400_000).toISOString();
  const { data, error } = await supportFrom(admin, "support_replay_sessions")
    .insert({
      ticket_id: parsed.data.ticketId,
      tenant_id: access.ticket.tenantId,
      user_id: session.user.id,
      kind: "live",
      status: "recording",
      consent: {
        grantedByUserId: session.user.id,
        grantedAt: new Date().toISOString(),
        scope: "this_tab",
        userAgent: "",
      },
      expires_at: expiresAt,
    })
    .select("id")
    .single();
  if (error || !data?.id) {
    logServerError("support.live.insert", error);
    return { ok: false, error: "Could not start live view." };
  }
  await logPlatformAdminAction({
    actorUserId: session.user.id,
    targetKind: "workspace",
    targetId: access.ticket.tenantId ?? session.user.id,
    action: "support.live.started",
    supportMode: "read_only",
    context: { ticketId: parsed.data.ticketId, sessionId: data.id, support_mode: "read_only" },
  });
  return { ok: true, sessionId: String(data.id) };
}

export async function declineLiveViewAction(raw: { ticketId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = z.object({ ticketId: uuid }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const session = await requireSession();
  if (!session.ok) return session;
  const access = await assertTicketAccess(parsed.data.ticketId, session.user.id);
  if (!access.ok) return access;
  const result = await supportEngine.appendMessage({
    ticketId: parsed.data.ticketId,
    authorKind: "requester",
    authorUserId: session.user.id,
    body: "Live view declined",
  });
  if (!result.ok) return result;
  return { ok: true };
}

export async function stopLiveViewAction(raw: { sessionId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = z.object({ sessionId: uuid }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const session = await requireSession();
  if (!session.ok) return session;
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Not configured." };
  const { data: row } = await supportFrom(admin, "support_replay_sessions")
    .select("id, user_id, ticket_id, tenant_id")
    .eq("id", parsed.data.sessionId)
    .maybeSingle();
  if (!row) return { ok: false, error: "Session not found." };
  const hq = await assertHqAccess();
  if (!hq.ok && session.user.id !== String(row.user_id)) {
    return { ok: false, error: "Not authorized." };
  }
  await supportFrom(admin, "support_replay_sessions")
    .update({ status: "ended", ended_at: new Date().toISOString() })
    .eq("id", parsed.data.sessionId)
    .eq("status", "recording");
  await logPlatformAdminAction({
    actorUserId: session.user.id,
    targetKind: "workspace",
    targetId: typeof row.tenant_id === "string" ? row.tenant_id : session.user.id,
    action: "support.live.stopped",
    supportMode: "read_only",
    context: { sessionId: parsed.data.sessionId, ticketId: row.ticket_id, support_mode: "read_only" },
  });
  return { ok: true };
}
