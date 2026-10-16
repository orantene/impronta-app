"use server";

import { assertNotImpersonating } from "@/lib/impersonation/readonly-guard";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { joinPayoutWaitlist, listPayoutWaitlist } from "@/lib/payments/payout-waitlist";

async function resolveOwner(): Promise<
  { ok: true; talentProfileId: string; userId: string } | { ok: false; error: string }
> {
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false, error: "Sign in required." };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, error: "Database unavailable." };
  const { data: tp, error } = await supabase
    .from("talent_profiles")
    .select("id")
    .eq("user_id", session.user.id)
    .maybeSingle();
  if (error || !tp) return { ok: false, error: "No talent profile linked to this account." };
  return { ok: true, talentProfileId: tp.id as string, userId: session.user.id };
}

/** "Notify me when it's available" for a coming-soon country (ISO-2) or "USDC". */
export async function joinPayoutCountryWaitlist(
  country: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const readOnly = await assertNotImpersonating();
  if (!readOnly.ok) return { ok: false, error: readOnly.error };
  const owner = await resolveOwner();
  if (!owner.ok) return owner;
  return joinPayoutWaitlist({ talentProfileId: owner.talentProfileId, userId: owner.userId, country });
}

/** Which coming-soon rows the signed-in talent already joined. */
export async function loadPayoutWaitlist(): Promise<
  { ok: true; countries: string[] } | { ok: false; error: string }
> {
  const owner = await resolveOwner();
  if (!owner.ok) return owner;
  return listPayoutWaitlist(owner.talentProfileId);
}
