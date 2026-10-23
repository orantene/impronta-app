/**
 * TUL-1749 · Per-talent AI sub-cap INSIDE the shared hub tenant's ceiling.
 *
 * The hub tenant's roughly 300 talents share one AI ceiling (300 requests/min, 50k/month, $200). Without a share per
 * talent, one heavy talent can switch AI off for everyone (the same class of problem as the promos hub incident). This is
 * checked BEFORE the tenant gate so a talent who is over their share never spends the tenant's per-minute tokens.
 *
 *   - applies only to the shared hub tenant (the default AI tenant, or the platform hub workspace); every other tenant
 *     returns ok untouched, with no reads;
 *   - keyed by talent_profile_id: a requests-per-minute limit (same shared Upstash limiter as the tenant, fail closed)
 *     and a monthly spend ceiling summed from this talent's own usage rows (cms_ai_usage_log, context.talent_profile_id);
 *   - a read it cannot make refuses, like the tenant gate (never waves the call through);
 *   - it does not touch the AI gateway: callers ask it first, then call the gateway as before.
 */
import { DEFAULT_AI_TENANT_ID } from "@/lib/ai/ai-tenant-constants";
import { checkAiRpm } from "@/lib/rate-limit-kv-ai-rpm";
import type { KvRateLimitResult } from "@/lib/rate-limit-kv";
import { logServerError } from "@/lib/server/safe-error";
import { sumTalentAiSpendCents, type TalentSpendRpcClient } from "@/lib/ai/talent-ai-spend";

/** One talent's share: 6 requests a minute (50 talents can run flat out inside the 300/min) and $5 a month (2.5% of $200). */
export const HUB_TALENT_AI_SUBCAP = { requestsPerMinute: 6, monthlySpendCents: 500 } as const;

export type HubTalentSubcapResult =
  | { ok: true }
  | { ok: false; code: "talent_rate_limit" | "talent_spend_cap" | "unavailable"; message: string };

export const HUB_TALENT_RATE_MESSAGE = "You're using AI help very quickly. Try again in a minute.";
export const HUB_TALENT_SPEND_MESSAGE = "You've used your share of AI help for this month. It resets on the 1st.";
const UNAVAILABLE_MESSAGE = "We could not confirm your AI usage right now. Try again in a moment.";

export type HubTalentSubcapDeps = {
  /** The platform hub workspace id, or null when there is none. */
  readHubTenantId(): Promise<string | null>;
  /** This talent's AI spend in cents this UTC month on this tenant; null = could not be read. */
  readTalentSpendCents(input: { tenantId: string; talentProfileId: string; monthStartIso: string }): Promise<number | null>;
  checkRpm(key: string, rpm: number): Promise<KvRateLimitResult>;
  now?(): Date;
};

/** First instant of the current UTC month: the reset boundary. */
export function utcMonthStartIso(now: Date): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01T00:00:00.000Z`;
}

/** Cents from usage rows; every paid row counts at least 1 cent (same rule as the tenant roll-up). */
export function sumUsageRowsSpendCents(rows: ReadonlyArray<{ context_jsonb?: { cost_usd?: unknown } | null }>): number {
  let cents = 0;
  for (const row of rows) {
    const usd = row.context_jsonb?.cost_usd;
    if (typeof usd === "number" && Number.isFinite(usd) && usd > 0) cents += Math.max(1, Math.round(usd * 100));
  }
  return cents;
}

/** The shared hub AI tenant: the default AI tenant (the seeded ceiling) or the platform hub workspace. */
export function isSharedHubAiTenant(tenantId: string, hubTenantId: string | null): boolean {
  return tenantId === DEFAULT_AI_TENANT_ID || (hubTenantId !== null && tenantId === hubTenantId);
}

export function hubTalentRpmKey(talentProfileId: string): string {
  return `hub-talent:${talentProfileId}`;
}

const defaultDeps: HubTalentSubcapDeps = {
  async readHubTenantId() {
    try {
      const { getPlatformHubTenant } = await import("@/lib/saas/platform-hub");
      return (await getPlatformHubTenant())?.tenantId ?? null;
    } catch (err) {
      logServerError("hub-talent-subcap/hub", err);
      return null;
    }
  },
  async readTalentSpendCents({ tenantId, talentProfileId, monthStartIso }) {
    const { createServiceRoleClient } = await import("@/lib/supabase/admin");
    const admin = createServiceRoleClient();
    if (!admin) return null;
    return sumTalentAiSpendCents(
      admin as unknown as TalentSpendRpcClient,
      { talentProfileId, sinceIso: monthStartIso, tenantId },
      "hub-talent-subcap/spend",
    );
  },
  checkRpm: checkAiRpm,
};

/**
 * Ask before the tenant gate. `tenantId` null/undefined = the default AI tenant (what the gate itself assumes).
 * No talent id on the hub = nothing to key on: ok (platform tools with no talent are not a talent's share).
 */
export async function assertHubTalentAiAllowed(
  input: { tenantId?: string | null; talentProfileId?: string | null },
  deps: HubTalentSubcapDeps = defaultDeps,
): Promise<HubTalentSubcapResult> {
  const tenantId = input.tenantId || DEFAULT_AI_TENANT_ID;
  const talentProfileId = input.talentProfileId?.trim();
  if (!talentProfileId) return { ok: true };

  // The default tenant is the hub by definition; only another id needs the platform hub lookup.
  const hubTenantId = tenantId === DEFAULT_AI_TENANT_ID ? null : await deps.readHubTenantId();
  if (!isSharedHubAiTenant(tenantId, hubTenantId)) return { ok: true };

  const limit = await deps.checkRpm(hubTalentRpmKey(talentProfileId), HUB_TALENT_AI_SUBCAP.requestsPerMinute);
  if (!limit.ok) return { ok: false, code: "talent_rate_limit", message: HUB_TALENT_RATE_MESSAGE };

  const spent = await deps.readTalentSpendCents({
    tenantId,
    talentProfileId,
    monthStartIso: utcMonthStartIso(deps.now ? deps.now() : new Date()),
  });
  if (spent === null) return { ok: false, code: "unavailable", message: UNAVAILABLE_MESSAGE };
  if (spent >= HUB_TALENT_AI_SUBCAP.monthlySpendCents) return { ok: false, code: "talent_spend_cap", message: HUB_TALENT_SPEND_MESSAGE };
  return { ok: true };
}
