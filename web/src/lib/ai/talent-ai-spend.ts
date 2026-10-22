/**
 * TUL-320 · Exact per-talent AI spend for the month, summed in SQL (`ai_talent_spend_cents`) instead of loading up to 5000
 * usage-log rows and adding them in JavaScript (which undercounted past 5000 rows). The per-row rule is unchanged:
 * every successful row with a numeric `cost_usd` > 0 counts max(1, round(cost_usd * 100)) cents.
 *
 * Returns null when the sum could not be read, so each caller keeps its own failure policy.
 */
import { logServerError } from "@/lib/server/safe-error";

export type TalentSpendRpcClient = {
  rpc(
    fn: "ai_talent_spend_cents",
    args: { p_talent_profile_id: string; p_since: string; p_tenant_id: string | null; p_feature: string | null },
  ): PromiseLike<{ data: unknown; error: unknown }>;
};

export async function sumTalentAiSpendCents(
  admin: TalentSpendRpcClient,
  args: { talentProfileId: string; sinceIso: string; tenantId?: string | null; feature?: string | null },
  logScope: string,
): Promise<number | null> {
  const { data, error } = await admin.rpc("ai_talent_spend_cents", {
    p_talent_profile_id: args.talentProfileId,
    p_since: args.sinceIso,
    p_tenant_id: args.tenantId ?? null,
    p_feature: args.feature ?? null,
  });
  if (error) {
    logServerError(logScope, error);
    return null;
  }
  const n = Number(data);
  if (!Number.isFinite(n) || n < 0) {
    logServerError(logScope, new Error("ai_talent_spend_cents returned a non-numeric total"));
    return null;
  }
  return n;
}
