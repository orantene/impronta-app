import { createServiceRoleClient } from "@/lib/supabase/admin";
import { DEFAULT_AI_TENANT_ID } from "@/lib/ai/ai-tenant-constants";
import { estimateCostUsd } from "@/lib/ai/ai-model-costs";
import { logServerError } from "@/lib/server/safe-error";
import type { AiUsage } from "@/lib/ai/provider";

/**
 * Best-effort per-call usage record for the AI builder generator. Writes one
 * row to `cms_ai_usage_log` (the existing per-invocation telemetry table) via
 * the service-role client. Fully swallowed on failure — telemetry must never
 * break a generation. Cost is estimated from tokens + model and stored in
 * `context_jsonb` (no schema change needed).
 */
export async function recordAiGenerationUsage(input: {
  provider: string;
  model: string | null;
  usage: AiUsage | undefined;
  actorProfileId: string | null;
  ok: boolean;
  scope: string;
  latencyMs?: number | null;
}): Promise<void> {
  try {
    const supabase = await createServiceRoleClient();
    if (!supabase) return;
    const inTok = input.usage?.inputTokens ?? null;
    const outTok = input.usage?.outputTokens ?? null;
    const costUsd = estimateCostUsd(input.model, inTok, outTok);
    await supabase.from("cms_ai_usage_log").insert({
      tenant_id: DEFAULT_AI_TENANT_ID,
      // Reuse an existing allowed action value; the builder generator emits
      // sections/pages. Scope + cost live in context_jsonb.
      action: "generate_section",
      provider: input.provider,
      model: input.model,
      input_tokens: inTok,
      output_tokens: outTok,
      ok: input.ok,
      actor_profile_id: input.actorProfileId,
      latency_ms: input.latencyMs ?? null,
      context_jsonb: {
        feature: "builder_generate",
        scope: input.scope,
        cost_usd: costUsd,
      },
    });
  } catch (err) {
    logServerError("ai-generate-nodes/record-usage", err);
  }
}
