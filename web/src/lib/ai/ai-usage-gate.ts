import { createServiceRoleClient } from "@/lib/supabase/admin";
import type { AiTenantControlsRow } from "@/lib/ai/ai-provider-repository";
import { resolveDefaultAiControls } from "@/lib/ai/default-tenant-controls";
import { checkAiRpm } from "@/lib/rate-limit-kv-ai-rpm";
import type { KvRateLimitResult } from "@/lib/rate-limit-kv";
import { DEFAULT_AI_TENANT_ID } from "@/lib/ai/ai-tenant-constants";
import { logServerError } from "@/lib/server/safe-error";
import { AI_OFF_MESSAGE } from "@/lib/ai/providers/disabled-chat-adapter";
import { isAiMasterEnabled } from "@/lib/settings/ai-feature-flags";

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export type AiUsageGateResult =
  | { ok: true }
  | { ok: false; code: "ai_off" | "rate_limit" | "spend_cap" | "monthly_requests" | "unavailable"; message: string };

/** Everything the gate reads, injectable so the behaviour is tested without a database. */
export type AiUsageGateDeps = {
  /** The AI master switch (TUL-1622). */
  isMasterEnabled?(): Promise<boolean>;
  /** null = no row. `error` = the read failed (never the same thing as "no row"). */
  readControls(tenantId: string): Promise<{ row: AiTenantControlsRow | null; error: boolean }>;
  /** The workspace's plan tier; null = unknown (treated as the strictest tier). */
  readPlanTier(tenantId: string): Promise<string | null>;
  readUsage(tenantId: string, monthKey: string): Promise<{ spendCents: number; requestCount: number } | null>;
  checkRpm(tenantId: string, rpm: number): Promise<KvRateLimitResult>;
};

const UNAVAILABLE: AiUsageGateResult = {
  ok: false,
  code: "unavailable",
  message: "We could not confirm AI usage limits right now. Try again in a moment.",
};

const defaultDeps: AiUsageGateDeps = {
  async readControls(tenantId) {
    const supabase = createServiceRoleClient();
    if (!supabase) return { row: null, error: true };
    const { data, error } = await supabase.from("ai_tenant_controls").select("*").eq("tenant_id", tenantId).maybeSingle();
    if (error) {
      logServerError("ai-usage-gate/controls", error);
      return { row: null, error: true };
    }
    return { row: (data as AiTenantControlsRow | null) ?? null, error: false };
  },
  async readPlanTier(tenantId) {
    const supabase = createServiceRoleClient();
    if (!supabase) return null;
    const { data, error } = await supabase.from("agencies").select("plan_tier").eq("id", tenantId).maybeSingle();
    if (error) {
      logServerError("ai-usage-gate/plan", error);
      return null;
    }
    return (data as { plan_tier?: string | null } | null)?.plan_tier ?? null;
  },
  async readUsage(tenantId, monthKey) {
    const supabase = createServiceRoleClient();
    if (!supabase) return null;
    const { data, error } = await supabase
      .from("ai_usage_monthly")
      .select("spend_cents, request_count")
      .eq("tenant_id", tenantId)
      .eq("month_key", monthKey)
      .maybeSingle();
    if (error) {
      logServerError("ai-usage-gate/usage", error);
      return null;
    }
    const r = data as { spend_cents?: number; request_count?: number } | null;
    return { spendCents: r?.spend_cents ?? 0, requestCount: r?.request_count ?? 0 };
  },
  checkRpm: checkAiRpm,
};

/**
 * Guard before provider-backed work. A workspace with an `ai_tenant_controls` row uses that row; a workspace WITHOUT one
 * (every real workspace today) gets the default ceilings of its plan (`default-tenant-controls.ts`), hard-stopped. The
 * per-minute limit is shared across instances (Upstash) and, like the guest routes, fails closed. A read we could not
 * make (controls, usage) refuses instead of waving the call through.
 */
export async function assertAiInvocationAllowed(
  tenantId: string = DEFAULT_AI_TENANT_ID,
  deps: AiUsageGateDeps = defaultDeps,
): Promise<AiUsageGateResult> {
  // The AI master switch comes first (TUL-1622): one check here stops every path that gates, before any usage row is written.
  if (!(await (deps.isMasterEnabled ? deps.isMasterEnabled() : isAiMasterEnabled()))) return { ok: false, code: "ai_off", message: AI_OFF_MESSAGE };
  const { row, error } = await deps.readControls(tenantId);
  if (error) return UNAVAILABLE;

  let spendCap: number | null;
  let hardStop: boolean;
  let rpm: number | null;
  let monthlyRequests: number | null;
  if (row) {
    spendCap = row.monthly_spend_cap_cents;
    hardStop = row.hard_stop_on_cap;
    rpm = row.max_requests_per_minute;
    monthlyRequests = row.max_requests_per_month;
  } else {
    const d = resolveDefaultAiControls(await deps.readPlanTier(tenantId));
    spendCap = d.monthlySpendCapCents;
    hardStop = true;
    rpm = d.maxRequestsPerMinute;
    monthlyRequests = d.maxRequestsPerMonth;
  }

  if (rpm != null && rpm > 0) {
    const limit = await deps.checkRpm(tenantId, rpm);
    if (!limit.ok) {
      return { ok: false, code: "rate_limit", message: "Request rate limit reached for AI usage. Try again shortly." };
    }
  }

  const usage = await deps.readUsage(tenantId, currentMonthKey());
  if (!usage) return UNAVAILABLE;

  if (hardStop && spendCap != null && usage.spendCents >= spendCap) {
    return { ok: false, code: "spend_cap", message: "Monthly AI spend cap reached. Raise the cap or wait until next month." };
  }
  if (monthlyRequests != null && usage.requestCount >= monthlyRequests) {
    return { ok: false, code: "monthly_requests", message: "Monthly AI request limit reached." };
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
    logServerError("ai-usage-gate/increment_ai_usage_monthly", error);
  }
}
