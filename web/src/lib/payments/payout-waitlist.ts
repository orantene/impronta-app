import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { isWaitlistKey } from "./payout-countries";

export type WaitlistResult = { ok: true } | { ok: false; error: string };

/** Join the waitlist for a coming-soon country (ISO-2) or "USDC". Idempotent. */
export async function joinPayoutWaitlist(
  input: { talentProfileId: string; userId: string | null; country: string },
  sb: SupabaseClient | null = createServiceRoleClient(),
): Promise<WaitlistResult> {
  const country = input.country.trim().toUpperCase();
  if (!isWaitlistKey(country)) return { ok: false, error: "Unknown country." };
  if (!sb) return { ok: false, error: "Database unavailable." };
  const { error } = await sb.from("payout_country_waitlist").upsert(
    { talent_profile_id: input.talentProfileId, user_id: input.userId, country },
    { onConflict: "talent_profile_id,country", ignoreDuplicates: true },
  );
  if (error) {
    logServerError("payments.payout-waitlist.join", error);
    return { ok: false, error: "Could not join the waitlist. Please try again." };
  }
  return { ok: true };
}

/** Countries (and "USDC") this talent is already waitlisted for. */
export async function listPayoutWaitlist(
  talentProfileId: string,
  sb: SupabaseClient | null = createServiceRoleClient(),
): Promise<{ ok: true; countries: string[] } | { ok: false; error: string }> {
  if (!sb) return { ok: false, error: "Database unavailable." };
  const { data, error } = await sb
    .from("payout_country_waitlist")
    .select("country")
    .eq("talent_profile_id", talentProfileId);
  if (error) {
    logServerError("payments.payout-waitlist.list", error);
    return { ok: false, error: "Could not load the waitlist." };
  }
  return { ok: true, countries: (data ?? []).map((r) => String(r.country)) };
}
