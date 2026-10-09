import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";

/**
 * A sale on a TALENT-TYPE workspace (the hub, a talent's own site) whose seller is exactly one talent: the money goes
 * to THAT TALENT'S OWN connected account, whichever tenant registered it. The Stripe account belongs to her, not to a
 * tenant; a hub sale used to find no account under the hub tenant and fail an MXN charge on the tenant's (us) lane
 * (paid run 2026-10-09).
 *
 * Narrow on purpose (PM-approved rule): only a talent-type tenant, only a single seller, only a CONNECTED account, and
 * exactly one distinct Stripe account (rows that repeat the same account under several tenants count once). Anything
 * else is `null`: no receiver is ever guessed on a money row, and a workspace's own leg is never redirected here.
 */
export type TalentOwnReceiver = { payoutAccountId: string; receiverKind: "talent"; displayName: string };

export async function resolveTalentOwnReceiver(
  admin: SupabaseClient,
  input: { tenantId: string; talentProfileId: string },
): Promise<TalentOwnReceiver | null> {
  const { data: tenant, error: tenantErr } = await admin.from("agencies").select("workspace_type").eq("id", input.tenantId).maybeSingle();
  if (tenantErr) {
    logServerError("link-payout-receiver.talentOwn.tenant", tenantErr);
    return null;
  }
  if ((tenant as { workspace_type?: string | null } | null)?.workspace_type !== "talent") return null;

  const { data, error } = await admin
    .from("payout_accounts")
    .select("id, display_name, provider_account_id")
    .eq("owner_type", "talent")
    .eq("owner_id", input.talentProfileId)
    .eq("status", "connected");
  if (error) {
    logServerError("link-payout-receiver.talentOwn.accounts", error);
    return null;
  }
  const rows = (data ?? []) as { id: string; display_name: string | null; provider_account_id: string | null }[];
  const distinct = new Set(rows.map((r) => r.provider_account_id ?? `row:${r.id}`));
  if (rows.length === 0 || distinct.size !== 1) return null;
  return { payoutAccountId: rows[0].id, receiverKind: "talent", displayName: (rows[0].display_name ?? "").trim() || "Talent" };
}
