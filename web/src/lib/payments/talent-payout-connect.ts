/**
 * talent-payout-connect.ts — a talent connects their own payout account in a workspace.
 *
 * `payout_accounts` has staff-only row policies (read and write), so the old insert on the
 * talent's own session was refused by row-level security, and the "already connected" lookup on
 * that session could never see a row. Everything here runs on the SERVICE ROLE, after proving in
 * code, with explicit predicates, that the caller IS the talent (talent_profiles.user_id equals the
 * signed-in user) and is rostered in THIS workspace. Row shape matches what the readers expect:
 * owner_type 'talent', owner_id = talent_profiles.id (link-payout-receiver*.ts, payout-statement).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";

export type ConnectTalentPayoutResult =
  | { ok: true; existed: boolean }
  | { ok: false; reason: "forbidden" | "not_rostered" | "failed" };

export async function connectTalentPayoutAccount(
  admin: SupabaseClient,
  input: { userId: string; userEmail?: string | null; tenantId: string; talentProfileId: string },
): Promise<ConnectTalentPayoutResult> {
  const { userId, tenantId, talentProfileId } = input;

  // 1. The caller owns this talent profile.
  const { data: profile, error: profileError } = await admin
    .from("talent_profiles")
    .select("id, user_id, display_name")
    .eq("id", talentProfileId)
    .maybeSingle();
  if (profileError) {
    logServerError("talent.connectPayout.verifyProfile", profileError);
    return { ok: false, reason: "failed" };
  }
  if (!profile || (profile as { user_id: string | null }).user_id !== userId) return { ok: false, reason: "forbidden" };

  // 2. ...and is rostered in THIS workspace.
  const { data: roster, error: rosterError } = await admin
    .from("agency_talent_roster")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("talent_profile_id", talentProfileId)
    .neq("status", "removed")
    .maybeSingle();
  if (rosterError) {
    logServerError("talent.connectPayout.verifyRoster", rosterError);
    return { ok: false, reason: "failed" };
  }
  if (!roster) return { ok: false, reason: "not_rostered" };

  // 3. One active account per (workspace, owner): reuse it.
  const { data: existing, error: existingError } = await admin
    .from("payout_accounts")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("owner_type", "talent")
    .eq("owner_id", talentProfileId)
    .in("status", ["pending_verification", "connected"])
    .maybeSingle();
  if (existingError) {
    logServerError("talent.connectPayout.lookup", existingError);
    return { ok: false, reason: "failed" };
  }
  if (existing) return { ok: true, existed: true };

  const displayName = (profile as { display_name: string | null }).display_name?.trim() || input.userEmail || "Talent payout account";
  const { error } = await admin.from("payout_accounts").insert({
    tenant_id: tenantId,
    owner_type: "talent",
    owner_id: talentProfileId,
    display_name: displayName,
    provider: "manual_bank",
    status: "connected",
    connected_at: new Date().toISOString(),
  });
  if (error) {
    // A double click raced us to the unique index: the account exists, which is what was asked.
    if ((error as { code?: string }).code === "23505") return { ok: true, existed: true };
    logServerError("talent.connectPayout.insert", error);
    return { ok: false, reason: "failed" };
  }
  return { ok: true, existed: false };
}
