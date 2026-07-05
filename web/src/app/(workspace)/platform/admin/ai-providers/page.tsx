// Platform HQ · AI Providers — global AI provider config (key, activation) + usage/cost.

import {
  loadAiGenerationUsageSummary,
  loadPlatformAiProviderState,
} from "@/lib/ai/ai-provider-admin";
import { AiProvidersClient } from "./AiProvidersClient";

export const dynamic = "force-dynamic";

export default async function AiProvidersPage() {
  const [state, usage] = await Promise.all([
    loadPlatformAiProviderState(),
    loadAiGenerationUsageSummary(30),
  ]);
  return <AiProvidersClient state={state} usage={usage} />;
}
