import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import {
  signGuestEmailUnsubscribeToken,
  verifyGuestEmailUnsubscribeToken,
} from "./guest-unsubscribe-token";

export { signGuestEmailUnsubscribeToken, verifyGuestEmailUnsubscribeToken };

/** Mirror getUnsubscribeToken: HMAC over email. No write on send. */
export async function getGuestUnsubscribeToken(
  _admin: SupabaseClient,
  email: string,
): Promise<string | null> {
  return signGuestEmailUnsubscribeToken(email);
}

export async function isGuestEmailUnsubscribed(
  admin: SupabaseClient,
  email: string,
): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  try {
    const { data, error } = await admin
      .from("guest_email_unsubscribes")
      .select("unsubscribed_at")
      .eq("email_normalized", normalized)
      .maybeSingle();
    if (error) {
      const code = (error as { code?: string }).code;
      if (code !== "PGRST205" && code !== "42P01") {
        logServerError("notifications.guestUnsub.lookup", error);
      }
      return false;
    }
    return Boolean((data as { unsubscribed_at?: string | null } | null)?.unsubscribed_at);
  } catch {
    return false;
  }
}

export function resolveGuestUnsubscribeRecipient(
  token: string,
): { email: string } | null {
  const verified = verifyGuestEmailUnsubscribeToken(token);
  if (!verified.ok) return null;
  return { email: verified.email };
}

export async function applyGuestEmailUnsubscribe(
  admin: SupabaseClient,
  token: string,
): Promise<{ ok: true; email: string } | { ok: false; reason: "invalid_token" | "write_failed" }> {
  const verified = verifyGuestEmailUnsubscribeToken(token);
  if (!verified.ok) return { ok: false, reason: "invalid_token" };
  try {
    const { error } = await admin.from("guest_email_unsubscribes").upsert(
      {
        email_normalized: verified.email,
        token,
        unsubscribed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "email_normalized" },
    );
    if (error) {
      logServerError("notifications.guestUnsub.apply", error);
      return { ok: false, reason: "write_failed" };
    }
    return { ok: true, email: verified.email };
  } catch (err) {
    logServerError("notifications.guestUnsub.apply", err);
    return { ok: false, reason: "write_failed" };
  }
}
