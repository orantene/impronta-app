import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { dispatchEventNotifications } from "@/lib/notifications/dispatcher";
import { logServerError } from "@/lib/server/safe-error";
import { afterResponse } from "@/lib/server/after-response";

/**
 * TUL-1464: bells for match-me. Fire-and-forget, deduped by eventId (request + person + kind),
 * never throws. The client's name, phone and email are never in a payload.
 */
async function userIds(admin: SupabaseClient, talentIds: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (talentIds.length === 0) return out;
  const { data, error } = await admin.from("talent_profiles").select("id, user_id").in("id", [...talentIds]);
  if (error) {
    logServerError("notifyMatch.users", error);
    return out;
  }
  for (const r of (data ?? []) as Array<{ id: string; user_id: string | null }>) if (r.user_id) out.set(r.id, r.user_id);
  return out;
}

function send(type: string, tenantId: string, eventId: string, userId: string, payload: Record<string, unknown>) {
  afterResponse(() =>
    dispatchEventNotifications({ type, tenantId, eventId, userId, payload }).catch((err) => logServerError(`notifyMatch.${type}`, err)),
  );
}

export async function notifyMatchOffered(p: { admin: SupabaseClient; tenantId: string; requestId: string; talentIds: readonly string[]; summary: string }): Promise<void> {
  try {
    const users = await userIds(p.admin, p.talentIds);
    const summary = p.summary.replace(/\s+/g, " ").trim().slice(0, 140);
    for (const [talentId, userId] of users) send("match.offered", p.tenantId, `match-offered:${p.requestId}:${talentId}`, userId, { requestId: p.requestId, summary });
  } catch (err) {
    logServerError("notifyMatchOffered", err);
  }
}

export async function notifyMatchTaken(p: { admin: SupabaseClient; tenantId: string; requestId: string; talentIds: readonly string[] }): Promise<void> {
  try {
    const users = await userIds(p.admin, p.talentIds);
    for (const [talentId, userId] of users) send("match.taken", p.tenantId, `match-taken:${p.requestId}:${talentId}`, userId, { requestId: p.requestId });
  } catch (err) {
    logServerError("notifyMatchTaken", err);
  }
}

export async function notifyMatchAccepted(p: { admin: SupabaseClient; tenantId: string; requestId: string; clientUserId: string; proTalentId: string }): Promise<void> {
  try {
    const { data, error } = await p.admin.from("talent_profiles").select("display_name").eq("id", p.proTalentId).maybeSingle();
    if (error) logServerError("notifyMatchAccepted.pro", error);
    const proName = (data as { display_name?: string | null } | null)?.display_name ?? null;
    send("match.accepted", p.tenantId, `match-accepted:${p.requestId}`, p.clientUserId, { requestId: p.requestId, proName });
  } catch (err) {
    logServerError("notifyMatchAccepted", err);
  }
}
