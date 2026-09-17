import "server-only";

/**
 * The module's single-shot "understand": the sentence (or the pasted link) →
 * facts with provenance on the brief → the understood card.
 *
 * Same gates and the same extraction as the chat intake (`runTurn`), minus
 * the reply prose: AI flags, a configured chat model, the spend gate, the
 * Tulala KV limiters (fail closed without KV, like the routes), the message
 * admission rules. With the AI flags off the card comes back with everything
 * `missing`, so the module degrades to the short form instead of failing.
 */

import { assertAiInvocationAllowed, recordAiUsageEstimate } from "@/lib/ai/ai-usage-gate";
import { isResolvedAiChatConfigured } from "@/lib/ai/resolve-provider";
import { resolveFailoverChat, resolveRoutedChat } from "@/lib/ai/call-routing.server";
import { recordAiGenerationUsage } from "@/lib/ai/record-generation-usage";
import { resolveClientIp } from "@/lib/guest/guest-session";
import {
  checkTulalaImportByIp,
  checkTulalaImportBySession,
  checkTulalaTurnByIp,
  checkTulalaTurnBySession,
  isTulalaKvConfigured,
} from "@/lib/rate-limit-kv-tulala";
import { logServerError } from "@/lib/server/safe-error";
import { getAiFeatureFlags } from "@/lib/settings/ai-feature-flags";
import type { Brief } from "@/lib/tulala/brief-store";
import { loadBrief, type BriefOwner } from "@/lib/tulala/brief-store.server";
import { MAX_USER_MESSAGE_CHARS } from "@/lib/tulala/conversation";
import { extractAndRecord, type ExtractionOutcome, type LearnedFact } from "@/lib/tulala/extract-and-record.server";
import { packForBrief } from "@/lib/tulala/pack-for-brief";
import { importFromUrl } from "@/lib/tulala/url-import.server";

import type { OnboardingIntent, OnboardingPath } from "./module-state";
import { proposeTypeChip } from "./type-chip.server";
import type { TypeChipProposal } from "./type-chip";
import { buildUnderstanding, type Understanding } from "./understanding";

export type UnderstandErrorCode =
  | "ai_off"
  | "rate_limit"
  | "too_long"
  | "import_failed"
  | "failed";

export type UnderstandResult =
  | { ok: true; understanding: Understanding; chip: TypeChipProposal | null; learned: LearnedFact[]; brief: Brief }
  | { ok: false; code: UnderstandErrorCode; message: string };

/** The card recomputed from the brief as it is (no model call). */
export async function understandingFor(input: {
  brief: Brief;
  intent: OnboardingIntent;
  userPath: OnboardingPath | null;
}): Promise<{ understanding: Understanding; chip: TypeChipProposal | null }> {
  const understanding = buildUnderstanding({ brief: input.brief, intent: input.intent, userPath: input.userPath });
  const chip = understanding.typeChip
    ? await proposeTypeChip({
        kind: understanding.path === "talent" ? "talent" : "business",
        query: understanding.typeChip.query,
      })
    : null;
  return { understanding, chip };
}

export async function understandBrief(input: {
  owner: BriefOwner;
  brief: Brief;
  intent: OnboardingIntent;
  userPath: OnboardingPath | null;
  locale: "en" | "es";
  text?: string;
  url?: string;
  scope: { sessionId: string; userId?: string | null };
}): Promise<UnderstandResult> {
  const flags = await getAiFeatureFlags();
  const aiOn = flags.ai_master_enabled && flags.ai_tulala_agent_enabled && (await isResolvedAiChatConfigured());
  if (!aiOn) {
    // Honest degradation: nothing read, everything asked by the short form.
    const { understanding, chip } = await understandingFor({ brief: input.brief, intent: input.intent, userPath: input.userPath });
    return { ok: true, understanding, chip, learned: [], brief: input.brief };
  }

  if (!isTulalaKvConfigured()) {
    // Same fail-closed rule as every /api/tulala route: no ceiling, no call.
    return { ok: false, code: "ai_off", message: "Rate limiting is not configured." };
  }
  const ip = await resolveClientIp();
  if (!ip) return { ok: false, code: "rate_limit", message: "Too many requests." };

  const isImport = !!input.url;
  const ipLimit = isImport ? await checkTulalaImportByIp(ip) : await checkTulalaTurnByIp(ip);
  if (!ipLimit.ok) return { ok: false, code: "rate_limit", message: "Too many requests. Try again shortly." };
  const sessionLimit = isImport
    ? await checkTulalaImportBySession(input.scope.sessionId)
    : await checkTulalaTurnBySession(input.scope.sessionId);
  if (!sessionLimit.ok) return { ok: false, code: "rate_limit", message: "That is a lot of tries. Give it a minute." };

  const gate = await assertAiInvocationAllowed();
  if (!gate.ok) return { ok: false, code: "rate_limit", message: gate.message };

  let learned: LearnedFact[] = [];
  try {
    if (isImport) {
      const imported = await importFromUrl({ owner: input.owner, brief: input.brief, url: input.url!, locale: input.locale });
      if (!imported.ok) return { ok: false, code: "import_failed", message: imported.error };
      learned = imported.facts.map((f) => ({ factKey: f.factKey, value: f.value, confidence: 0.6 }));
    } else {
      const text = (input.text ?? "").trim();
      if (text.length > MAX_USER_MESSAGE_CHARS) return { ok: false, code: "too_long", message: "Keep it shorter." };
      // Routed per call (Operations → AI routing); Haiku 4.5 by the bake-off.
      // One provider error must not cost the person their signup: retry
      // once on the same provider, then once on the other one when it has a
      // key. Every attempt writes a usage row (cost, latency, ok).
      const first = await resolveRoutedChat("extraction");
      const attempts: Array<{ chat: typeof first; attempt: string }> = [{ chat: first, attempt: "first" }, { chat: first, attempt: "retry" }];
      const failover = await resolveFailoverChat("extraction", first.adapter.id);
      if (failover) attempts.push({ chat: failover, attempt: "failover" });
      for (const { chat, attempt } of attempts) {
        let outcome: ExtractionOutcome | null = null;
        const t0 = Date.now();
        learned = await extractAndRecord({
          adapter: chat.adapter,
          brief: input.brief,
          userMessage: text,
          question: null,
          pack: packForBrief(input.brief),
          report: (o) => {
            outcome = o;
          },
        });
        const o = outcome as ExtractionOutcome | null;
        void recordAiGenerationUsage({
          provider: chat.adapter.id,
          model: o?.model ?? chat.model ?? "auto",
          usage: o?.usage,
          actorProfileId: null,
          ok: o?.ok ?? false,
          scope: "onboarding_extraction",
          latencyMs: Date.now() - t0,
          tenantId: null,
          context: { brief_id: input.brief.id, attempt, error: o?.ok ? null : (o?.code ?? "unknown"), facts: learned.length },
        }).catch((err) => logServerError("onboarding.understand.usage", err));
        if (o?.ok) break;
        if (o && !["api_error", "quota", "timeout", "empty_response"].includes(o.code ?? "")) break;
      }
      await recordAiUsageEstimate();
    }
  } catch (err) {
    logServerError("onboarding.understandBrief", err);
    return { ok: false, code: "failed", message: "Could not read that." };
  }

  // Re-read: recordFacts applies precedence, so a proposal may have lost to an
  // existing confirmed fact. The card must describe the brief, not the model.
  const refreshed = (await loadBrief(input.owner)) ?? input.brief;
  const { understanding, chip } = await understandingFor({ brief: refreshed, intent: input.intent, userPath: input.userPath });
  return { ok: true, understanding, chip, learned, brief: refreshed };
}
