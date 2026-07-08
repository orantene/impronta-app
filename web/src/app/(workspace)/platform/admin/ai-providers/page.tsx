// Platform HQ · AI Providers — global AI provider config (key, activation) + usage/cost.

import {
  loadAiGenerationUsageSummary,
  loadPlatformAiProviderState,
  loadTenantSpendStatus,
} from "@/lib/ai/ai-provider-admin";
import { GENERATION_MODEL_OPTIONS } from "@/lib/ai/ai-generation-model";
import { AiProvidersClient } from "./AiProvidersClient";

export const dynamic = "force-dynamic";

export default async function AiProvidersPage() {
  const [state, usage, spend] = await Promise.all([
    loadPlatformAiProviderState(),
    loadAiGenerationUsageSummary(30),
    loadTenantSpendStatus(),
  ]);
  return (
    <AiProvidersClient
      state={state}
      usage={usage}
      spend={spend}
      modelOptions={GENERATION_MODEL_OPTIONS.map((o) => ({ ...o }))}
    />
  );
}
