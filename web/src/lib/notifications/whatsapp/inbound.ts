import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import { classifyInboundKeyword, e164FromWhatsAppAddress, HELP_REPLY, STOP_REPLY } from "./keywords";

/**
 * TUL-225 Phase 1: inbound WhatsApp keywords (design 4.4). STOP writes the do-not-send row,
 * then closes every open consent for that number (`revoked_via = 'keyword'`) and answers once.
 * The suppression goes first: if the second step fails, the number is already safe from sends.
 * A suppression is never auto-cleared here; re-opt-in is a fresh code in Settings.
 */

export type InboundResult =
  | { ok: true; action: "stop" | "help" | "ignored"; reply: string | null }
  | { ok: false; reason: "unavailable" };

const UNIQUE_VIOLATION = "23505";

async function insertSuppression(admin: SupabaseClient, phone: string, userId: string | null): Promise<boolean> {
  const { error } = await admin.from("whatsapp_suppressions").insert({ phone_e164: phone, user_id: userId, reason: "keyword" });
  // A second STOP from the same number is already honoured: that is success, not an error.
  if (error && (error as { code?: string }).code !== UNIQUE_VIOLATION) {
    logServerError("whatsapp.inbound.suppress", error);
    return false;
  }
  return true;
}

export async function handleInboundWhatsApp(admin: SupabaseClient, input: { from: string | null | undefined; body: string | null | undefined }): Promise<InboundResult> {
  const keyword = classifyInboundKeyword(input.body);
  if (!keyword) return { ok: true, action: "ignored", reply: null };
  if (keyword === "help") return { ok: true, action: "help", reply: HELP_REPLY };

  const phone = e164FromWhatsAppAddress(input.from);
  if (!phone) return { ok: true, action: "ignored", reply: null };

  const { data, error } = await admin.from("whatsapp_consents").select("user_id").eq("phone_e164", phone).is("revoked_at", null);
  if (error) {
    logServerError("whatsapp.inbound.consents", error);
    return { ok: false, reason: "unavailable" };
  }
  const userIds = [...new Set(((data as Array<{ user_id: string | null }> | null) ?? []).map((r) => r.user_id).filter((id): id is string => !!id))];

  // The number-wide row first (a guest STOP, and what the send gate checks), then one per account.
  for (const userId of [null, ...userIds]) {
    if (!(await insertSuppression(admin, phone, userId))) return { ok: false, reason: "unavailable" };
  }

  const { error: revokeError } = await admin
    .from("whatsapp_consents")
    .update({ revoked_at: new Date().toISOString(), revoked_via: "keyword" })
    .eq("phone_e164", phone)
    .is("revoked_at", null);
  if (revokeError) {
    logServerError("whatsapp.inbound.revoke", revokeError);
    return { ok: false, reason: "unavailable" };
  }
  return { ok: true, action: "stop", reply: STOP_REPLY };
}

/**
 * The send gate's question. Fails CLOSED, unlike the email helper: when we cannot tell, we do not
 * send, because a message after STOP is worse than a missed ping.
 */
export async function isWhatsAppSuppressed(admin: SupabaseClient, phoneE164: string): Promise<boolean> {
  try {
    const { count, error } = await admin.from("whatsapp_suppressions").select("id", { head: true, count: "exact" }).eq("phone_e164", phoneE164);
    if (error) {
      logServerError("whatsapp.suppression.check", error);
      return true;
    }
    return (count ?? 0) > 0;
  } catch (err) {
    logServerError("whatsapp.suppression.check", err instanceof Error ? err : new Error(String(err)));
    return true;
  }
}
