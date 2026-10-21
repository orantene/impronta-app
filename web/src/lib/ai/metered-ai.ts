/**
 * TUL-1623 · The two steps every AI call owes the spend meter, so a call site cannot do one without the other:
 *   1. `gateAiCall`  BEFORE the paid call: the tenant spend cap / request limits (assertAiInvocationAllowed).
 *   2. `meterAiCall` AFTER it: one usage row with the real tokens and cost, rolled into ai_usage_monthly so the cap sees it.
 * `feature` is the key that appears in `context_jsonb.feature` and `scope` of the usage row.
 * PRICING: a successful call is priced by the model the provider actually SERVED (`result.model`, which both adapters
 * return); `model` is only the caller's fallback when a result carries none. A call without a model id would be priced at
 * the conservative fallback rate, so pass the resolved id when you have one.
 */
import { assertAiInvocationAllowed } from "@/lib/ai/ai-usage-gate";
import { recordAiGenerationUsage } from "@/lib/ai/record-generation-usage";
import type { ChatCompletionResult } from "@/lib/ai/provider";
import { afterResponse } from "@/lib/server/after-response";

export type GateAiCallResult = { ok: true } | { ok: false; error: string; code: string };

/** `tenantId` omitted = the platform (hub) tenant, for platform-level admin tools that have no workspace. */
export async function gateAiCall(tenantId?: string | null): Promise<GateAiCallResult> {
  return toGateAiCallResult(await assertAiInvocationAllowed(tenantId || undefined));
}

/** Pure mapping of the gate's verdict to the caller-facing result. */
export function toGateAiCallResult(gate: Awaited<ReturnType<typeof assertAiInvocationAllowed>>): GateAiCallResult {
  if (gate.ok) return { ok: true };
  // Callers already branch on "RATE_LIMITED" (the established code), so the gate's "rate_limit" maps to it; the rest are
  // the gate's own codes upper-cased (SPEND_CAP, MONTHLY_REQUESTS, AI_OFF, UNAVAILABLE).
  return { ok: false, error: gate.message, code: gate.code === "rate_limit" ? "RATE_LIMITED" : gate.code.toUpperCase() };
}

export type MeterAiCallInput = {
  tenantId?: string | null;
  actorProfileId?: string | null;
  feature: string;
  provider: string;
  model: string | null;
  result: ChatCompletionResult;
  startedAt: number;
};

/** Pure: the usage row for one call. The model that SERVED a successful call prices it. */
export function meteredUsageArgs(input: MeterAiCallInput): Parameters<typeof recordAiGenerationUsage>[0] {
  const { result } = input;
  return {
    provider: input.provider,
    model: result.ok ? (result.model ?? input.model) : input.model,
    usage: result.ok ? result.usage : undefined,
    actorProfileId: input.actorProfileId ?? null,
    ok: result.ok,
    scope: input.feature,
    latencyMs: Date.now() - input.startedAt,
    tenantId: input.tenantId ?? null,
    context: { feature: input.feature },
  };
}

export function meterAiCall(input: MeterAiCallInput): void {
  afterResponse(() => recordAiGenerationUsage(meteredUsageArgs(input)), "metered-ai/record");
}
