"use server";

/**
 * AI-3 — server action behind the freeform builder REVISER.
 *
 * The read-modify sibling of `generateBuilderNodesAction`: a thin auth +
 * rate-limit + spend-gate wrapper that RETURNS a revised candidate node (it
 * writes NOTHING — the client previews it desktop + mobile, then Replaces or
 * Inserts-below through the undoable edit-context mutations). Pins the same
 * generation model (Opus 4.8, adaptive thinking, effort:xhigh) and injects that
 * call into the pure `reviseBuilderNodes` composer.
 *
 * Unlike page generation there is NO deterministic fallback (the preset composer
 * only bakes whole pages), so with no provider connected this returns an
 * actionable NO_MODEL error rather than degrading.
 */

import { requireSession } from "@/lib/server/action-guards";
import { requireEditSurfaceTenantScope } from "@/lib/saas";
import {
  isResolvedAiChatConfigured,
  resolveAiChatAdapter,
} from "@/lib/ai/resolve-provider";
import { logServerError } from "@/lib/server/safe-error";
import { recordAiGenerationUsage } from "@/lib/ai/record-generation-usage";
import { assertAiInvocationAllowed } from "@/lib/ai/ai-usage-gate";
import type { AiUsage } from "@/lib/ai/provider";
import { backgroundModeToPolarity } from "@/lib/site-admin/tokens/polarity";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import {
  reviseBuilderNodes,
  type ReviseNodesResult,
} from "./revise-nodes";
import type { ModelGenerateFn, ModelGenerateReason } from "./generate-nodes";
import {
  resolveGenerationModel,
  type GenerationModelId,
} from "@/lib/ai/ai-generation-model";

export type ReviseNodeActionState =
  | { ok: true; node: BuilderNode; nodeCount?: number; source: "model" }
  | { ok: false; error: string; code?: string };

// Revise is a token-heavy Opus call; give it the same tight per-user bucket the
// generate action uses (separate map so the two don't share a budget).
const RATE_LIMIT_MAX = 40;
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

type UsageEntry = { provider: string; model: string; usage: AiUsage | undefined; latencyMs: number };

/** Record the whole revise (incl. a retry) as ONE usage row — mirrors the generate action. */
function recordReviseUsageOnce(
  sink: UsageEntry[],
  actorProfileId: string | null,
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
    scope: "revise",
    latencyMs,
    tenantId,
  });
}

/** Injected model call — pins the generation model (adaptive thinking + effort:xhigh). */
function buildModelGenerator(model: GenerationModelId, sink: UsageEntry[]): ModelGenerateFn {
  return async ({ systemPrompt, userMessage, jsonSchema, maxTokens, repairNote }) => {
    const startedAt = Date.now();
    try {
      const adapter = await resolveAiChatAdapter();
      const result = await adapter.chatCompletion({
        systemPrompt,
        userMessage: repairNote ? `${userMessage}\n\n${repairNote}` : userMessage,
        jsonSchema,
        maxTokens,
        model,
        thinking: true,
        effort: "xhigh",
      });
      sink.push({
        provider: adapter.id,
        model: result.ok ? (result.model ?? model) : model,
        usage: result.ok ? result.usage : undefined,
        latencyMs: Date.now() - startedAt,
      });
      if (result.ok) {
        return { text: result.text, reason: result.stopReason === "max_tokens" ? "truncated" : "ok" };
      }
      const reason: ModelGenerateReason =
        result.code === "truncated" ? "truncated"
        : result.code === "refusal" ? "refusal"
        : result.code === "empty_response" ? "empty"
        : "error";
      return { text: null, reason };
    } catch (err) {
      logServerError("ai-revise-nodes/model", err);
      return { text: null, reason: "error" };
    }
  };
}

/** Light shape check so a malformed selection doesn't burn an Opus call. */
function parseSelectedNode(nodeJson: string): BuilderNode | null {
  try {
    const parsed = JSON.parse(nodeJson) as unknown;
    if (parsed && typeof parsed === "object" && typeof (parsed as { kind?: unknown }).kind === "string") {
      return parsed as BuilderNode;
    }
  } catch {
    /* fall through */
  }
  return null;
}

export async function reviseBuilderNodeAction(input: {
  /** JSON of the selected subtree (a primitive param — mirrors insertBuilderComponent). */
  nodeJson: string;
  /** The user's plain-language change request. */
  instruction: string;
  /** The active surface's locale (copy stays in this language). */
  locale?: string;
  /** The active theme's `data-token-background-mode` (AIQ-12), read from the builder DOM. */
  backgroundMode?: string;
}): Promise<ReviseNodeActionState> {
  const auth = await requireSession();
  if (!auth.ok) return { ok: false, error: auth.error, code: "UNAUTHORIZED" };

  // Real workspace scope, resolved from the actor's OWN memberships. Doubles as
  // the membership gate (`requireSession()` alone admitted any signed-in
  // account, membership or not) and as the cost-attribution key for the spend
  // cap / RPM gate and usage roll-up below, both of which used to bill a single
  // hard-coded global tenant.
  let tenantId: string;
  try {
    const scope = await requireEditSurfaceTenantScope();
    tenantId = scope.tenantId;
  } catch {
    return { ok: false, error: "No active workspace.", code: "NO_SCOPE" };
  }

  const node = parseSelectedNode(input.nodeJson);
  if (!node) return { ok: false, error: "That block could not be read.", code: "UNREADABLE_NODE" };

  const limit = checkRate(auth.user.id);
  if (!limit.ok) {
    const minutes = Math.ceil((limit.remainingMs ?? 0) / 60000);
    return { ok: false, error: `AI limit reached. Try again in ~${minutes} min.`, code: "RATE_LIMITED" };
  }

  const useModel = await isResolvedAiChatConfigured().catch(() => false);
  if (!useModel) {
    return {
      ok: false,
      error: "Connect an AI provider in Settings to revise blocks with AI.",
      code: "NO_MODEL",
    };
  }

  const gate = await assertAiInvocationAllowed(tenantId);
  if (!gate.ok) {
    return { ok: false, error: gate.message, code: gate.code.toUpperCase() };
  }

  const model = await resolveGenerationModel();
  const themePolarity = backgroundModeToPolarity(input.backgroundMode);
  const usageSink: UsageEntry[] = [];
  const revised: ReviseNodesResult = await reviseBuilderNodes({
    node,
    instruction: input.instruction,
    locale: input.locale,
    themePolarity,
    generateWithModel: buildModelGenerator(model, usageSink),
  });
  recordReviseUsageOnce(usageSink, auth.user.id, revised.ok, tenantId);

  if (revised.ok) {
    return { ok: true, node: revised.node, nodeCount: revised.nodeCount, source: "model" };
  }
  if (revised.code === "INSTRUCTION_TOO_SHORT" || revised.code === "UNREADABLE_NODE") {
    return { ok: false, error: revised.error, code: revised.code };
  }
  return { ok: false, error: revised.error, code: "EMPTY" };
}
