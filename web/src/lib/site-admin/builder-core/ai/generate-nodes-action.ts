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
import {
  isResolvedAiChatConfigured,
  resolveAiChatAdapter,
} from "@/lib/ai/resolve-provider";
import { logServerError } from "@/lib/server/safe-error";
import { recordAiGenerationUsage } from "@/lib/ai/record-generation-usage";
import { assertAiInvocationAllowed } from "@/lib/ai/ai-usage-gate";
import type { BuilderNodeTree } from "@/lib/site-admin/builder-node/types";
import {
  generateBuilderNodes,
  type GenerateScope,
  type ModelGenerateFn,
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

/**
 * The injected model call — pins Opus 4.8, records per-call token usage + cost
 * (best-effort) for the platform-admin dashboard, and returns the raw text or
 * null on any failure.
 */
function buildModelGenerator(
  actorProfileId: string | null,
  scope: GenerateScope,
  model: GenerationModelId,
): ModelGenerateFn {
  return async ({ systemPrompt, userMessage, jsonSchema, maxTokens }) => {
    const startedAt = Date.now();
    try {
      const adapter = await resolveAiChatAdapter();
      const result = await adapter.chatCompletion({
        systemPrompt,
        userMessage,
        jsonSchema,
        maxTokens,
        model,
        // Adaptive thinking is a quality lift for structure-sensitive page
        // composition; no-ops on providers/models that don't support it. Thinking
        // tokens count toward maxTokens (see GEN_MAX_TOKENS headroom).
        thinking: true,
      });
      void recordAiGenerationUsage({
        provider: adapter.id,
        model: result.ok ? (result.model ?? model) : model,
        usage: result.ok ? result.usage : undefined,
        actorProfileId,
        ok: result.ok,
        scope,
        latencyMs: Date.now() - startedAt,
      });
      return result.ok ? result.text : null;
    } catch (err) {
      logServerError("ai-generate-nodes/model", err);
      return null;
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
}): Promise<GenerateNodesActionState> {
  const auth = await requireSession();
  if (!auth.ok) return { ok: false, error: auth.error, code: "UNAUTHORIZED" };

  const limit = checkRate(auth.user.id);
  if (!limit.ok) {
    const minutes = Math.ceil((limit.remainingMs ?? 0) / 60000);
    return { ok: false, error: `AI limit reached. Try again in ~${minutes} min.`, code: "RATE_LIMITED" };
  }

  const useModel = await isResolvedAiChatConfigured().catch(() => false);

  if (useModel) {
    // Tenant-level guardrails (monthly spend cap / request limits) — a hard cap
    // stops AI spend before the (paid) model call. No controls row = no-op.
    const gate = await assertAiInvocationAllowed();
    if (!gate.ok) {
      return { ok: false, error: gate.message, code: gate.code.toUpperCase() };
    }
    const model = await resolveGenerationModel();
    const generated = await generateBuilderNodes({
      brief: input.brief,
      scope: input.scope,
      // Copy is written in the surface's locale (AIQ-3).
      locale: input.locale,
      // themePolarity/palette (AIQ-12) are intentionally unset here: this action
      // holds no tenant handle and there is no ready live-branding reader, so
      // resolving the tenant's active theme polarity is a separate, verified
      // follow-up. Unset preserves the exact "polarity unknown" prompt wording.
      // actor_profile_id FKs to profiles.id, which equals the auth user id in
      // this schema (every other actor_profile_id writer passes session.user.id).
      generateWithModel: buildModelGenerator(auth.user.id, input.scope, model),
    });
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
