import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The address a channel adapter needs for an outbound reply: the inquiry's
 * contact email for `email`, its contact phone for `sms` / `whatsapp`, nothing
 * for the in-app channels. Before this the engine sent `to: null` and the
 * email adapter refused every reply as `channel_unavailable`.
 */
export async function contactForChannel(
  admin: SupabaseClient,
  inquiryId: string,
  channel: string,
): Promise<string | null> {
  if (channel !== "email" && channel !== "sms" && channel !== "whatsapp") return null;
  const { data, error } = await admin
    .from("inquiries")
    .select("contact_email, contact_phone")
    .eq("id", inquiryId)
    .maybeSingle();
  // A denied policy or a bad column must not read as "no address": the send
  // then refuses loudly (channel_unavailable) instead of silently skipping.
  if (error) return null;
  const row = (data ?? null) as { contact_email: string | null; contact_phone: string | null } | null;
  if (!row) return null;
  const value = channel === "email" ? row.contact_email : row.contact_phone;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
