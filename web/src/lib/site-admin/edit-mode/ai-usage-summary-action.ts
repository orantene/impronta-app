"use server";

/**
 * Phase 14 — AI usage summary for the workspace dashboard.
 *
 * Reads `cms_ai_usage_log` and returns a 7-day / 30-day / lifetime
 * roll-up that the admin can render as a chart or quick stats card.
 *
 * Token counts roll up; latency rolls up as median for now (cheap
 * server-side; the chart can ask for more later).
 */

import { requireStaff } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export interface AiUsageBucket {
  label: string;
  windowMs: number | null;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  byAction: Record<string, number>;
}

export type AiUsageSummaryResult =
  | {
      ok: true;
      buckets: ReadonlyArray<AiUsageBucket>;
      latestRows: ReadonlyArray<{
        createdAt: string;
        action: string;
        provider: string;
        model: string | null;
        inputTokens: number | null;
        outputTokens: number | null;
        ok: boolean;
      }>;
    }
  | { ok: false; error: string };

export async function loadAiUsageSummary(): Promise<AiUsageSummaryResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) return { ok: false, error: "Pick an agency workspace first." };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server is missing service-role credentials." };

  type Row = {
    created_at: string;
    action: string;
    provider: string;
    model: string | null;
    input_tokens: number | null;
    output_tokens: number | null;
    ok: boolean;
  };

  // Pull last 1000 rows (~enough for any chart at the day-bucket
  // granularity we'd render). Per-tenant scoped via WHERE.
  const { data, error } = await admin
    .from("cms_ai_usage_log")
    .select("created_at, action, provider, model, input_tokens, output_tokens, ok")
    .eq("tenant_id", scope.tenantId)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) return { ok: false, error: "Couldn't load usage log." };

  const rows = (data ?? []) as Row[];
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const buckets: AiUsageBucket[] = [
    { label: "Last 7 days", windowMs: 7 * day, calls: 0, inputTokens: 0, outputTokens: 0, byAction: {} },
    { label: "Last 30 days", windowMs: 30 * day, calls: 0, inputTokens: 0, outputTokens: 0, byAction: {} },
    { label: "Lifetime", windowMs: null, calls: 0, inputTokens: 0, outputTokens: 0, byAction: {} },
  ];
  for (const row of rows) {
    const created = new Date(row.created_at).getTime();
    for (const b of buckets) {
      if (b.windowMs === null || now - created < b.windowMs) {
        b.calls += 1;
        b.inputTokens += row.input_tokens ?? 0;
        b.outputTokens += row.output_tokens ?? 0;
        b.byAction[row.action] = (b.byAction[row.action] ?? 0) + 1;
      }
    }
  }

  return {
    ok: true,
    buckets,
    latestRows: rows.slice(0, 50).map((r) => ({
      createdAt: r.created_at,
      action: r.action,
      provider: r.provider,
      model: r.model,
      inputTokens: r.input_tokens,
      outputTokens: r.output_tokens,
      ok: r.ok,
    })),
  };
}
