/**
 * TUL-1359 (code-first): staff talent lookups run on the SERVICE client, after
 * the caller's own authorization.
 *
 * The RLS policy behind `talent_profiles` is being narrowed to roster
 * membership (migration 20261231417600). A staff session then no longer sees a
 * talent that is not on its roster (an applicant, an unpublished profile), and
 * a user-session lookup returns no row. Each caller below has ALREADY
 * authorized the actor for the tenant and inquiry/booking, and keys the lookup
 * by the id that authorization covered, so reading that one row with elevated
 * rights discloses nothing the action was not entitled to.
 *
 * A missing row is reported as `found: false` and callers refuse: a NULL
 * participant `user_id` or an empty name snapshot must never be written because
 * a read was filtered.
 *
 * Fallback: when no service key is configured the user-session client is used
 * (the same fallback `inquiryWriteClient` has), so local setups keep working.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export async function staffTalentClient(fallback: SupabaseClient): Promise<SupabaseClient> {
  try {
    const { createServiceRoleClient } = await import("@/lib/supabase/admin");
    return createServiceRoleClient() ?? fallback;
  } catch {
    return fallback;
  }
}

export type TalentUserLookup = { found: false } | { found: true; userId: string | null };

/** The claimed account of ONE talent profile, keyed by the id the action authorized. */
export async function lookupTalentUserId(client: SupabaseClient, talentProfileId: string): Promise<TalentUserLookup> {
  const { data, error } = await client.from("talent_profiles").select("user_id").eq("id", talentProfileId).maybeSingle();
  if (error || !data) return { found: false };
  return { found: true, userId: ((data as { user_id: string | null }).user_id ?? null) };
}

export type TalentNameSnapshot = { found: false } | { found: true; displayName: string | null; profileCode: string | null };

/** The name + code snapshot of ONE talent profile; `found: false` means write nothing. */
export async function lookupTalentSnapshot(client: SupabaseClient, talentProfileId: string): Promise<TalentNameSnapshot> {
  const { data, error } = await client.from("talent_profiles").select("display_name, profile_code").eq("id", talentProfileId).maybeSingle();
  if (error || !data) return { found: false };
  const row = data as { display_name: string | null; profile_code: string | null };
  return { found: true, displayName: row.display_name ?? null, profileCode: row.profile_code ?? null };
}
