/**
 * Server wiring for AI-at-signup. The orchestrator stays injectable; this
 * file is the only one that talks to the chat provider.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { assertAiInvocationAllowed } from "@/lib/ai/ai-usage-gate";
import { recordAiGenerationUsage } from "@/lib/ai/record-generation-usage";
import {
  isResolvedAiChatConfigured,
  resolveAiChatAdapter,
} from "@/lib/ai/resolve-provider";
import { logServerError } from "@/lib/server/safe-error";
import type { StarterPersonalisation } from "@/lib/site-admin/builder-node/starter-personalisation";

import { resolvePlatformDefaultStorefrontTree } from "./default-storefront-template";
import type { ResolvedDefaultStorefront } from "./default-storefront-template";
import {
  resolveSignupStarterTree,
  SIGNUP_AI_MODEL,
  type SignupCopyGenerateFn,
} from "./signup-ai-draft";

export async function resolveSignupStarterTreeForOnboard(
  client: SupabaseClient,
  input: {
    businessName?: string | null;
    audience?: string | null;
    businessDescription?: string | null;
    tenantId?: string | null;
  },
): Promise<ResolvedDefaultStorefront | null> {
  const personalisation: StarterPersonalisation = {
    businessName: input.businessName,
    audience: input.audience,
  };

  const generateCopy: SignupCopyGenerateFn = async (call) => {
    const configured = await isResolvedAiChatConfigured();
    if (!configured) return null;
    if (input.tenantId) {
      const gate = await assertAiInvocationAllowed(input.tenantId);
      if (!gate.ok) return null;
    }
    const started = Date.now();
    const adapter = await resolveAiChatAdapter();
    const result = await adapter.chatCompletion({
      systemPrompt: call.systemPrompt,
      userMessage: call.userMessage,
      jsonSchema: call.jsonSchema,
      maxTokens: call.maxTokens,
      model: SIGNUP_AI_MODEL,
    });
    void recordAiGenerationUsage({
      provider: adapter.id,
      model: result.ok ? (result.model ?? SIGNUP_AI_MODEL) : SIGNUP_AI_MODEL,
      usage: result.ok ? result.usage : undefined,
      actorProfileId: null,
      ok: result.ok,
      scope: "signup_starter",
      latencyMs: Date.now() - started,
      tenantId: input.tenantId,
    }).catch((err) => {
      logServerError("signupAiDraft.recordUsage", err);
    });
    return result.ok ? result.text : null;
  };

  try {
    const draft = await resolveSignupStarterTree({
      personalisation,
      businessDescription: input.businessDescription,
      loadPlatformDefault: async () => {
        const resolved = await resolvePlatformDefaultStorefrontTree(
          client,
          personalisation,
        );
        return resolved?.builderTree ?? null;
      },
      generateCopy,
    });
    if (!draft) return null;
    return { builderTree: draft.builderTree };
  } catch (err) {
    logServerError("signupAiDraft.resolve", err);
    const fallback = await resolvePlatformDefaultStorefrontTree(
      client,
      personalisation,
    );
    return fallback;
  }
}
