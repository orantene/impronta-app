"use server";

import { z } from "zod";

import { requireCapability, AccessDeniedError } from "@/lib/access/has-capability";
import { logPlatformAdminAction } from "@/lib/platform/audit";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { requireAdmin, requireSession } from "@/lib/server/action-guards";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { assertHqAccess, assertTicketAccess } from "../support-access";
import { supportFrom } from "../support-from";

const BUCKET = "support-replays";
const uuid = z.string().uuid();

function retentionDays(): number {
  const n = Number(process.env.SUPPORT_REPLAY_RETENTION_DAYS ?? 30);
  return Number.isFinite(n) && n > 0 ? n : 30;
}

export async function loadSupportReplayBufferSetting(): Promise<
  { ok: true; enabled: boolean } | { ok: false; error: string }
> {
  const auth = await requireWorkspaceStaffAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Not configured." };
  const { data, error } = await admin
    .from("agencies")
    .select("settings")
    .eq("id", auth.tenantId)
    .maybeSingle();
  if (error) return { ok: false, error: CLIENT_ERROR.generic };
  const settings = data?.settings && typeof data.settings === "object" ? (data.settings as Record<string, unknown>) : {};
  return { ok: true, enabled: settings.support_replay_buffer === true };
}

export async function saveSupportReplayBufferSetting(raw: {
  enabled: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = z.object({ enabled: z.boolean() }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const auth = await requireWorkspaceStaffAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  try {
    await requireCapability("manage_agency_settings", auth.tenantId);
  } catch (err) {
    if (err instanceof AccessDeniedError) return { ok: false, error: "You don't have permission to change this." };
    throw err;
  }
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Not configured." };
  const { data } = await admin.from("agencies").select("settings").eq("id", auth.tenantId).maybeSingle();
  const settings =
    data?.settings && typeof data.settings === "object" ? { ...(data.settings as Record<string, unknown>) } : {};
  settings.support_replay_buffer = parsed.data.enabled;
  const { error } = await admin.from("agencies").update({ settings }).eq("id", auth.tenantId);
  if (error) {
    logServerError("support.replay.setting", error);
    return { ok: false, error: CLIENT_ERROR.update };
  }
  return { ok: true };
}

export async function mintReplayUploadAction(raw: {
  ticketId: string;
  chunkCount: number;
  kind?: "buffer" | "live";
}): Promise<
  | {
      ok: true;
      sessionId: string;
      uploads: Array<{ index: number; path: string; signedUrl: string }>;
    }
  | { ok: false; error: string }
> {
  const parsed = z
    .object({
      ticketId: uuid,
      chunkCount: z.number().int().min(1).max(80),
      kind: z.enum(["buffer", "live"]).optional(),
    })
    .safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const session = await requireSession();
  if (!session.ok) return session;
  const access = await assertTicketAccess(parsed.data.ticketId, session.user.id);
  if (!access.ok) return access;
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Not configured." };

  const tenantKey = access.ticket.tenantId ?? "none";
  const expiresAt = new Date(Date.now() + retentionDays() * 86400_000).toISOString();
  const { data: inserted, error } = await supportFrom(admin, "support_replay_sessions")
    .insert({
      ticket_id: parsed.data.ticketId,
      tenant_id: access.ticket.tenantId,
      user_id: session.user.id,
      kind: parsed.data.kind ?? "buffer",
      status: "recording",
      consent: {
        grantedByUserId: session.user.id,
        grantedAt: new Date().toISOString(),
        scope: "last_few_minutes",
        userAgent: "",
      },
      expires_at: expiresAt,
    })
    .select("id")
    .single();
  if (error || !inserted?.id) {
    logServerError("support.replay.insert", error);
    return { ok: false, error: "Could not start replay upload." };
  }
  const sessionId = String(inserted.id);
  const prefix = `${tenantKey}/${sessionId}`;
  const uploads: Array<{ index: number; path: string; signedUrl: string }> = [];
  for (let i = 0; i < parsed.data.chunkCount; i += 1) {
    const path = `${prefix}/${i}.bin`;
    const signed = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
    if (signed.error || !signed.data) {
      logServerError("support.replay.sign", signed.error);
      return { ok: false, error: "Replay storage is not ready." };
    }
    uploads.push({ index: i, path, signedUrl: signed.data.signedUrl });
  }
  await supportFrom(admin, "support_replay_sessions")
    .update({ storage_prefix: prefix })
    .eq("id", sessionId);
  return { ok: true, sessionId, uploads };
}

/** Sign chunk uploads for an existing live session so the stream persists as a replay. */
export async function mintLiveSessionUploadAction(raw: {
  sessionId: string;
  chunkCount: number;
}): Promise<
  | { ok: true; sessionId: string; uploads: Array<{ index: number; path: string; signedUrl: string }> }
  | { ok: false; error: string }
> {
  const parsed = z
    .object({ sessionId: uuid, chunkCount: z.number().int().min(1).max(80) })
    .safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const session = await requireSession();
  if (!session.ok) return session;
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Not configured." };
  const { data: row } = await supportFrom(admin, "support_replay_sessions")
    .select("id, user_id, ticket_id, tenant_id, kind, status")
    .eq("id", parsed.data.sessionId)
    .maybeSingle();
  if (!row) return { ok: false, error: "Session not found." };
  if (session.user.id !== String(row.user_id)) return { ok: false, error: "Not authorized." };
  if (row.kind !== "live" || row.status !== "recording") {
    return { ok: false, error: "Live session is not recording." };
  }
  const tenantKey = typeof row.tenant_id === "string" ? row.tenant_id : "none";
  const prefix = `${tenantKey}/${parsed.data.sessionId}`;
  const uploads: Array<{ index: number; path: string; signedUrl: string }> = [];
  for (let i = 0; i < parsed.data.chunkCount; i += 1) {
    const path = `${prefix}/${i}.bin`;
    const signed = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
    if (signed.error || !signed.data) {
      logServerError("support.replay.signLive", signed.error);
      return { ok: false, error: "Replay storage is not ready." };
    }
    uploads.push({ index: i, path, signedUrl: signed.data.signedUrl });
  }
  await supportFrom(admin, "support_replay_sessions")
    .update({ storage_prefix: prefix })
    .eq("id", parsed.data.sessionId);
  return { ok: true, sessionId: parsed.data.sessionId, uploads };
}

export async function completeReplayUploadAction(raw: {
  sessionId: string;
  chunks: Array<{ index: number; path: string; bytes: number }>;
  durationMs: number;
  eventCount: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = z
    .object({
      sessionId: uuid,
      chunks: z.array(z.object({ index: z.number().int(), path: z.string().max(400), bytes: z.number().int().min(0) })).max(80),
      durationMs: z.number().int().min(0),
      eventCount: z.number().int().min(0),
    })
    .safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const hq = await requireAdmin();
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Not configured." };
  const { data: row } = await supportFrom(admin, "support_replay_sessions")
    .select("id, user_id, ticket_id, storage_prefix")
    .eq("id", parsed.data.sessionId)
    .maybeSingle();
  if (!row) return { ok: false, error: "Session not found." };
  const session = await requireSession();
  if (!session.ok) return session;
  if (!hq.ok) {
    const access = await assertTicketAccess(String(row.ticket_id), session.user.id);
    if (!access.ok) return access;
    if (session.user.id !== String(row.user_id)) return { ok: false, error: "Not authorized." };
  }
  // Chunk paths are client-echoed; never store one outside this session's own
  // server-minted prefix — HQ later mints signed READ urls for these exact
  // paths, so a foreign path here would exfiltrate another session's replay.
  const prefix = typeof row.storage_prefix === "string" ? row.storage_prefix : null;
  if (!prefix) return { ok: false, error: "Session has no storage prefix." };
  const pathOk = (c: { index: number; path: string }) => c.path === `${prefix}/${c.index}.bin`;
  if (!parsed.data.chunks.every(pathOk)) {
    return { ok: false, error: "Invalid chunk paths." };
  }
  const totalBytes = parsed.data.chunks.reduce((n, c) => n + c.bytes, 0);
  const { error } = await supportFrom(admin, "support_replay_sessions")
    .update({
      status: "uploaded",
      ended_at: new Date().toISOString(),
      duration_ms: parsed.data.durationMs,
      event_count: parsed.data.eventCount,
      chunk_count: parsed.data.chunks.length,
      total_bytes: totalBytes,
      chunks: parsed.data.chunks,
    })
    .eq("id", parsed.data.sessionId);
  if (error) return { ok: false, error: "Could not finish replay upload." };
  return { ok: true };
}

export async function hqListReplaySessionsAction(raw: { ticketId: string }): Promise<
  | {
      ok: true;
      sessions: Array<{
        id: string;
        kind: string;
        status: string;
        durationMs: number | null;
        createdAt: string;
      }>;
    }
  | { ok: false; error: string }
> {
  const parsed = z.object({ ticketId: uuid }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const hq = await assertHqAccess();
  if (!hq.ok) return hq;
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Not configured." };
  const { data } = await supportFrom(admin, "support_replay_sessions")
    .select("id, kind, status, duration_ms, created_at")
    .eq("ticket_id", parsed.data.ticketId)
    .order("created_at", { ascending: false });
  return {
    ok: true,
    sessions: (data ?? []).map((row: Record<string, unknown>) => ({
      id: String(row.id),
      kind: String(row.kind ?? ""),
      status: String(row.status ?? ""),
      durationMs: typeof row.duration_ms === "number" ? row.duration_ms : null,
      createdAt: String(row.created_at ?? ""),
    })),
  };
}

export async function hqViewReplayAction(raw: { sessionId: string }): Promise<
  | { ok: true; urls: string[] }
  | { ok: false; error: string }
> {
  const parsed = z.object({ sessionId: uuid }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const hq = await assertHqAccess();
  if (!hq.ok) return hq;
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Not configured." };
  const { data: row } = await supportFrom(admin, "support_replay_sessions")
    .select("id, ticket_id, tenant_id, status, chunks, storage_prefix")
    .eq("id", parsed.data.sessionId)
    .maybeSingle();
  if (!row || row.status !== "uploaded") return { ok: false, error: "Replay is not ready." };
  await logPlatformAdminAction({
    actorUserId: hq.userId,
    targetKind: "workspace",
    targetId: typeof row.tenant_id === "string" ? row.tenant_id : hq.userId,
    action: "support.replay.viewed",
    supportMode: "read_only",
    context: { sessionId: parsed.data.sessionId, ticketId: row.ticket_id, support_mode: "read_only" },
  });
  const chunks = Array.isArray(row.chunks) ? (row.chunks as Array<{ path?: string }>) : [];
  const urls: string[] = [];
  for (const chunk of chunks) {
    if (!chunk.path) continue;
    const signed = await admin.storage.from(BUCKET).createSignedUrl(chunk.path, 60 * 10);
    if (signed.data?.signedUrl) urls.push(signed.data.signedUrl);
  }
  return { ok: true, urls };
}
