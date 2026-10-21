/**
 * TUL-1623 · The two steps every AI call owes the spend meter, so a call site cannot do one without the other:
 *   1. `gateAiCall`  BEFORE the paid call: the tenant spend cap / request limits (assertAiInvocationAllowed).
 *   2. `meterAiCall` AFTER it: one usage row with the real tokens and cost, rolled into ai_usage_monthly so the cap sees it.
 * `feature` is the key that appears in `context_jsonb.feature` and `scope` of the usage row.
 */
import { assertAiInvocationAllowed } from "@/lib/ai/ai-usage-gate";
import { recordAiGenerationUsage } from "@/lib/ai/record-generation-usage";
import type { ChatCompletionResult } from "@/lib/ai/provider";
import { afterResponse } from "@/lib/server/after-response";

export type GateAiCallResult = { ok: true } | { ok: false; error: string; code: string };

/** `tenantId` omitted = the platform (hub) tenant, for platform-level admin tools that have no workspace. */
export async function gateAiCall(tenantId?: string | null): Promise<GateAiCallResult> {
  const gate = await assertAiInvocationAllowed(tenantId || undefined);
  if (gate.ok) return { ok: true };
  return { ok: false, error: gate.message, code: gate.code.toUpperCase() };
}

export function meterAiCall(input: {
  tenantId?: string | null;
  actorProfileId?: string | null;
  feature: string;
  provider: string;
  model: string | null;
  result: ChatCompletionResult;
  startedAt: number;
}): void {
  const { result } = input;
  afterResponse(
    () =>
      recordAiGenerationUsage({
        provider: input.provider,
        model: result.ok ? (result.model ?? input.model) : input.model,
        usage: result.ok ? result.usage : undefined,
        actorProfileId: input.actorProfileId ?? null,
        ok: result.ok,
        scope: input.feature,
        latencyMs: Date.now() - input.startedAt,
        tenantId: input.tenantId ?? null,
        context: { feature: input.feature },
      }),
    "metered-ai/record",
  );
}
