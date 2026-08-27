"use server";

/**
 * Per-conversation email-mirror mute — the POST target for the confirm form
 * on `/unsubscribe/conversation` (inquiry email loop, 2026-08-20).
 *
 * Verifies the HMAC-signed mute token (no auth, no expiry — refusing an old
 * unsubscribe would keep mailing someone who asked to stop) and stamps
 * `inquiries.email_mirror_muted_at`. Idempotent: muting an already-muted
 * conversation re-renders the done state. Runs under the service-role client;
 * the signed token in the form body is the only credential an unauthenticated
 * email click carries.
 */

import { redirect } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { improntaLog } from "@/lib/server/structured-log";
import { verifyConversationToken } from "@/lib/inquiry/conversation-email-tokens";

export async function confirmConversationMuteAction(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "").trim();
  const lang = String(formData.get("lang") ?? "en") === "es" ? "es" : "en";

  const back = (status: string) =>
    `/unsubscribe/conversation?token=${encodeURIComponent(token)}&lang=${lang}&status=${status}`;

  const verified = verifyConversationToken(token, "mute", null);
  if (!verified.ok) redirect(back("invalid_token"));

  const admin = createServiceRoleClient();
  if (!admin) redirect(back("write_failed"));

  const { error } = await admin
    .from("inquiries")
    .update({ email_mirror_muted_at: new Date().toISOString() })
    .eq("id", verified.inquiryId);
  if (error) {
    logServerError("unsubscribe-conversation/mute", error);
    redirect(back("write_failed"));
  }

  void improntaLog("conversation_mute.applied", { inquiryId: verified.inquiryId });
  redirect(back("done"));
}
