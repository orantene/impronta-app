import { createServiceRoleClient } from "@/lib/supabase/admin";
import { fetchTenantControls } from "@/lib/ai/ai-provider-repository";
import { DEFAULT_AI_TENANT_ID } from "@/lib/ai/ai-tenant-constants";

const minuteBuckets = new Map<string, { bucket: number; count: number }>();

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function currentMinuteBucket(): number {
  return Math.floor(Date.now() / 60_000);
}

export type AiUsageGateResult =
  | { ok: true }
  | { ok: false; code: "rate_limit" | "spend_cap" | "monthly_requests"; message: string };

/**
 * Best-effort guard before provider-backed work. Stateless servers share DB counters only.
 */
export async function assertAiInvocationAllowed(
  tenantId: string = DEFAULT_AI_TENANT_ID,
): Promise<AiUsageGateResult> {
  const controls = await fetchTenantControls(tenantId);
  if (!controls) return { ok: true };

  const rpm = controls.max_requests_per_minute;
  if (rpm != null && rpm > 0) {
    const key = `${tenantId}:${currentMinuteBucket()}`;
    const row = minuteBuckets.get(key);
    const next = (row?.count ?? 0) + 1;
    if (next > rpm) {
      return {
        ok: false,
        code: "rate_limit",
        message: "Request rate limit reached for AI usage. Try again shortly.",
      };
    }
    minuteBuckets.set(key, { bucket: currentMinuteBucket(), count: next });
  }

  const supabase = createServiceRoleClient();
  if (!supabase) return { ok: true };

  const monthKey = currentMonthKey();
  const { data: usageRow } = await supabase
    .from("ai_usage_monthly")
    .select("spend_cents, request_count")
    .eq("tenant_id", tenantId)
    .eq("month_key", monthKey)
    .maybeSingle();

  const spend = (usageRow as { spend_cents?: number } | null)?.spend_cents ?? 0;
  const reqs = (usageRow as { request_count?: number } | null)?.request_count ?? 0;

  if (
    controls.hard_stop_on_cap &&
    controls.monthly_spend_cap_cents != null &&
    spend >= controls.monthly_spend_cap_cents
  ) {
    return {
      ok: false,
      code: "spend_cap",
      message: "Monthly AI spend cap reached. Raise the cap or wait until next month.",
    };
  }

  if (controls.max_requests_per_month != null && reqs >= controls.max_requests_per_month) {
    return {
      ok: false,
      code: "monthly_requests",
      message: "Monthly AI request limit reached.",
    };
  }

  return { ok: true };
}

const ESTIMATE = Math.max(
  0,
  Number.parseInt(process.env.AI_USAGE_ESTIMATE_CENTS_PER_CALL?.trim() ?? "1", 10) || 1,
);

export async function recordAiUsageEstimate(
  tenantId: string = DEFAULT_AI_TENANT_ID,
  cents: number = ESTIMATE,
): Promise<void> {
  const supabase = createServiceRoleClient();
  if (!supabase) return;
  const monthKey = currentMonthKey();
  const { error } = await supabase.rpc("increment_ai_usage_monthly", {
    p_tenant_id: tenantId,
    p_month_key: monthKey,
    p_spend_delta_cents: cents,
  });
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("increment_ai_usage_monthly failed", error.message);
  }
}
