"use server";

/**
 * AI-2 — server action behind the freeform builder generator.
 *
 * Mirrors `composePageFromBriefAction`: a thin auth + rate-limit wrapper that
 * RETURNS a validated `BuilderNode` tree (it writes NOTHING — the client hands
 * the tree to `applyComposedTreeWithUndo` / `insertBuilderComponent`, so the
 * result is snapshotted + undoable + autosaved on every surface).
 *
 * It pins `claude-opus-4-8` for generation (structure- and taste-sensitive; the
 * adapter drops the sampling params that model rejects) and injects that model
 * call into the pure `generateBuilderNodes` composer. When no provider is
 * connected, or the model returns nothing usable, PAGE scope degrades to the
 * deterministic preset composer so the user is never dead-ended; SECTION scope
 * (which the preset composer can't serve — it only bakes whole pages) returns an
 * actionable error instead.
 */

import { requireSession } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas";
import {
  isResolvedAiChatConfigured,
  resolveAiChatAdapter,
} from "@/lib/ai/resolve-provider";
import { logServerError } from "@/lib/server/safe-error";
import { recordAiGenerationUsage } from "@/lib/ai/record-generation-usage";
import { assertAiInvocationAllowed } from "@/lib/ai/ai-usage-gate";
import type { AiUsage } from "@/lib/ai/provider";
import { backgroundModeToPolarity } from "@/lib/site-admin/tokens/polarity";
import type { BuilderNodeTree } from "@/lib/site-admin/builder-node/types";
import {
  generateBuilderNodes,
  type GenerateScope,
  type ModelGenerateFn,
  type ModelGenerateReason,
} from "./generate-nodes";
import { composePageFromBrief, type TextToPageSurface } from "./text-to-page";
import {
  resolveGenerationModel,
  type GenerationModelId,
} from "@/lib/ai/ai-generation-model";

export type GenerateNodesActionState =
  | {
      ok: true;
      builderTree: BuilderNodeTree;
      scope: GenerateScope;
      label: string;
      source: "model" | "keyword";
      nodeCount?: number;
    }
  | { ok: false; error: string; code?: string };

// Per-user in-memory rate bucket. Generation is a token-heavy Opus call, so it
// gets its own, tighter cap than the (cheap) preset re-rank action.
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const userHits = new Map<string, number[]>();

function checkRate(userId: string): { ok: boolean; remainingMs?: number } {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const arr = (userHits.get(userId) ?? []).filter((t) => t > cutoff);
  if (arr.length >= RATE_LIMIT_MAX) {
    return { ok: false, remainingMs: arr[0] + RATE_LIMIT_WINDOW_MS - now };
  }
  arr.push(now);
  userHits.set(userId, arr);
  return { ok: true };
}

/** One model call's usage, accumulated so the whole generation (incl. a retry) is recorded ONCE. */
type UsageEntry = { provider: string; model: string; usage: AiUsage | undefined; latencyMs: number };

/**
 * Record the WHOLE generation's usage as a single row (AIQ audit fix). Previously
 * `recordAiGenerationUsage` fired inside the per-call generator, so a corrective
 * retry (AIQ-15/21) counted the user's ONE action as two monthly requests. We now
 * accumulate every model call and record once: spend = sum of all real API-call
 * costs (unchanged), request_count += 1 per user action (fixed).
 */
function recordGenerationUsageOnce(
  sink: UsageEntry[],
  actorProfileId: string | null,
  scope: GenerateScope,
  ok: boolean,
  tenantId: string,
): void {
  if (sink.length === 0) return;
  const inTok = sink.reduce((s, e) => s + (e.usage?.inputTokens ?? 0), 0);
  const outTok = sink.reduce((s, e) => s + (e.usage?.outputTokens ?? 0), 0);
  const latencyMs = sink.reduce((s, e) => s + e.latencyMs, 0);
  void recordAiGenerationUsage({
    provider: sink[0]!.provider,
    model: sink[0]!.model,
    usage: { inputTokens: inTok || null, outputTokens: outTok || null },
    actorProfileId,
    ok,
    scope,
    latencyMs,
    tenantId,
  });
}

/**
 * The injected model call — pins Opus 4.8 (adaptive thinking + effort:xhigh) and
 * accumulates each call's usage into `sink` (recorded once by the action, so a
 * retry doesn't double-count the monthly request). Returns the raw text + reason.
 */
function buildModelGenerator(model: GenerationModelId, sink: UsageEntry[]): ModelGenerateFn {
  return async ({ systemPrompt, userMessage, jsonSchema, maxTokens, repairNote }) => {
    const startedAt = Date.now();
    try {
      const adapter = await resolveAiChatAdapter();
      const result = await adapter.chatCompletion({
        systemPrompt,
        // AIQ-21 — the corrective retry appends a failure-specific repair note.
        userMessage: repairNote ? `${userMessage}\n\n${repairNote}` : userMessage,
        jsonSchema,
        maxTokens,
        model,
        // Adaptive thinking is a quality lift for structure-sensitive page
        // composition; no-ops on providers/models that don't support it. Thinking
        // tokens count toward maxTokens (see GEN_MAX_TOKENS headroom).
        thinking: true,
        // AIQ-14 — run the taste/structure-sensitive generation at max reasoning
        // depth (gated to the adaptive family inside the adapter).
        effort: "xhigh",
      });
      sink.push({
        provider: adapter.id,
        model: result.ok ? (result.model ?? model) : model,
        usage: result.ok ? result.usage : undefined,
        latencyMs: Date.now() - startedAt,
      });
      if (result.ok) {
        // Surface truncation so the orchestrator can raise the cap + retry (AIQ-15).
        return { text: result.text, reason: result.stopReason === "max_tokens" ? "truncated" : "ok" };
      }
      const reason: ModelGenerateReason =
        result.code === "truncated" ? "truncated"
        : result.code === "refusal" ? "refusal"
        : result.code === "empty_response" ? "empty"
        : "error";
      return { text: null, reason };
    } catch (err) {
      logServerError("ai-generate-nodes/model", err);
      return { text: null, reason: "error" };
    }
  };
}

/** Page-scope safety net: the deterministic preset composer (never dead-ends the user). */
async function presetFallback(
  brief: string,
  surface: TextToPageSurface,
  locale: string | undefined,
): Promise<GenerateNodesActionState> {
  const composed = await composePageFromBrief({ brief, surface, locale, useModel: false });
  if (!composed.ok) {
    return { ok: false, error: composed.error, code: composed.code };
  }
  return {
    ok: true,
    builderTree: composed.tree,
    scope: "page",
    label: composed.label,
    source: "keyword",
  };
}

export async function generateBuilderNodesAction(input: {
  brief: string;
  scope: GenerateScope;
  surface: TextToPageSurface;
  locale?: string;
  /**
   * The active theme's `data-token-background-mode` (AIQ-12), read by the client
   * from the builder DOM. Mapped to light/dark polarity so the model gets concrete
   * color guidance instead of the "polarity unknown" gamble. Optional/best-effort.
   */
  backgroundMode?: string;
}): Promise<GenerateNodesActionState> {
  const auth = await requireSession();
  if (!auth.ok) return { ok: false, error: auth.error, code: "UNAUTHORIZED" };

  // Resolve the caller's REAL workspace before anything paid happens. Two jobs:
  //
  //  1. Cost attribution — the tenant spend cap / RPM gate and the usage
  //     roll-up below were charged to a hard-coded global tenant, so per-tenant
  //     caps never applied to builder text generation.
  //  2. Membership gate — `requireSession()` alone let ANY signed-in account,
  //     including one with no workspace membership at all, drive Opus
  //     generations up to the per-user hourly limit. `requireTenantScope()`
  //     resolves only from the actor's own memberships, so a member-less
  //     account now stops here. Same shape the image action already uses.
  let tenantId: string;
  try {
    const scope = await requireTenantScope();
    tenantId = scope.tenantId;
  } catch {
    return { ok: false, error: "No active workspace.", code: "NO_SCOPE" };
  }

  const limit = checkRate(auth.user.id);
  if (!limit.ok) {
    const minutes = Math.ceil((limit.remainingMs ?? 0) / 60000);
    return { ok: false, error: `AI limit reached. Try again in ~${minutes} min.`, code: "RATE_LIMITED" };
  }

  const useModel = await isResolvedAiChatConfigured().catch(() => false);

  if (useModel) {
    // Tenant-level guardrails (monthly spend cap / request limits) — a hard cap
    // stops AI spend before the (paid) model call. No controls row = no-op.
    const gate = await assertAiInvocationAllowed(tenantId);
    if (!gate.ok) {
      return { ok: false, error: gate.message, code: gate.code.toUpperCase() };
    }
    const model = await resolveGenerationModel();
    // AIQ-12 — map the active theme's background mode (from the builder DOM) to
    // light/dark polarity so the prompt gives the model concrete, theme-correct
    // band guidance. Unknown/absent → undefined (preserves the neutral wording).
    const themePolarity = backgroundModeToPolarity(input.backgroundMode);
    // Accumulate usage across the (1 + optional retry) model calls, recorded once
    // below so a corrective retry doesn't double-count the user's monthly request.
    const usageSink: UsageEntry[] = [];
    const generated = await generateBuilderNodes({
      brief: input.brief,
      scope: input.scope,
      // Copy is written in the surface's locale (AIQ-3).
      locale: input.locale,
      themePolarity,
      // actor_profile_id FKs to profiles.id, which equals the auth user id in
      // this schema (every other actor_profile_id writer passes session.user.id).
      generateWithModel: buildModelGenerator(model, usageSink),
    });
    recordGenerationUsageOnce(usageSink, auth.user.id, input.scope, generated.ok, tenantId);
    if (generated.ok) {
      return {
        ok: true,
        builderTree: generated.tree,
        scope: input.scope,
        label: input.scope === "page" ? "AI page" : "AI section",
        source: "model",
        nodeCount: generated.nodeCount,
      };
    }
    if (generated.code === "BRIEF_TOO_SHORT") {
      return { ok: false, error: generated.error, code: generated.code };
    }
    // Model produced nothing usable — fall through to the page-scope fallback.
  }

  if (input.scope === "page") {
    return presetFallback(input.brief, input.surface, input.locale);
  }

  // Section scope has no deterministic fallback (the preset composer bakes whole
  // pages only). Tell the user plainly.
  return {
    ok: false,
    error: useModel
      ? "The AI could not build that section — try rephrasing."
      : "Connect an AI provider in Settings to generate sections.",
    code: useModel ? "EMPTY" : "NO_MODEL",
  };
}
