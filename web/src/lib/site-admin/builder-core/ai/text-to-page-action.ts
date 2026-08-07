"use server";

/**
 * AI-1 (B4) — server action behind the shared text-to-page composer.
 *
 * Mirrors `bakePageDesignTreeAction`: it is a thin guard + rate-limit wrapper
 * around the shared `composePageFromBrief` composer and RETURNS the validated
 * tree (it writes NOTHING). The surface-parameterized EmptyCanvasStarter calls
 * this, then hands the returned tree to the active SurfaceAdapter through the
 * shared `applyTemplateWithUndo` chokepoint — so the AI page is snapshotted +
 * undoable + autosaved exactly like any template apply, on every surface.
 *
 * The LLM is reused via the existing credential-vault pattern
 * (`resolveAiChatAdapter` / `isResolvedAiChatConfigured` — the same path the
 * translations console + AI section generation use; no hardcoded keys). When no
 * provider is connected the composer degrades to the deterministic keyword
 * planner, so the feature works without a live model and the model is a pure
 * upgrade seam.
 */

import { requireSession } from "@/lib/server/action-guards";
import { requireEditSurfaceTenantScope } from "@/lib/saas";
import { assertAiInvocationAllowed } from "@/lib/ai/ai-usage-gate";
import {
  isResolvedAiChatConfigured,
  resolveAiChatAdapter,
} from "@/lib/ai/resolve-provider";
import { logServerError } from "@/lib/server/safe-error";
import type { BuilderNodeTree } from "@/lib/site-admin/builder-node/types";
import {
  composePageFromBrief,
  type TextToPageSurface,
} from "./text-to-page";

export type ComposePageActionState =
  | {
      ok: true;
      builderTree: BuilderNodeTree;
      designId: string;
      label: string;
      matched: boolean;
      source: "model" | "keyword";
    }
  | { ok: false; error: string; code?: string };

// Per-user in-memory rate bucket. Generation is cheap (deterministic) but the
// model seam costs tokens; cap so the public-by-default editing session can't be
// abused. Shared shape with the other edit-mode AI actions.
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

const RANK_SYSTEM_PROMPT = `You help pick the best website starter design for a brief. You are given a one-line brief and a fixed list of available design ids with labels. Reply with ONLY a JSON array of design ids from the list, ordered best-first (most-appropriate design first). Use ONLY ids from the provided list — never invent an id. No preamble, no markdown fences. Example: ["editorial","store","coach"]`;

/**
 * Build the model re-ranker the composer calls. Returns null when no provider is
 * configured (so the composer keeps the deterministic order) or on any provider
 * failure. The model is constrained to RE-ORDER the closed candidate id list; it
 * cannot widen it (the composer discards any id not in the candidate set).
 */
function buildModelRanker(): (
  brief: string,
  candidateIds: ReadonlyArray<string>,
) => Promise<ReadonlyArray<string> | null> {
  return async (brief, candidateIds) => {
    try {
      const adapter = await resolveAiChatAdapter();
      const userMessage = [
        `Brief: ${brief}`,
        "",
        "Available design ids (pick + order ONLY from these):",
        candidateIds.map((id) => `- ${id}`).join("\n"),
        "",
        "Return the ids ordered best-first as a JSON array.",
      ].join("\n");
      const result = await adapter.chatCompletion({
        systemPrompt: RANK_SYSTEM_PROMPT,
        userMessage,
        temperature: 0.2,
        maxTokens: 200,
      });
      if (!result.ok) return null;
      let raw = result.text.trim();
      if (raw.startsWith("```")) {
        raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
      }
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return null;
      const ids = parsed.filter((x): x is string => typeof x === "string");
      return ids.length > 0 ? ids : null;
    } catch (err) {
      logServerError("ai-text-to-page/rank", err);
      return null;
    }
  };
}

/**
 * Compose a validated builder tree from a one-line brief. The single shared
 * server action behind every surface's "Compose with AI" affordance.
 */
export async function composePageFromBriefAction(input: {
  brief: string;
  surface: TextToPageSurface;
  locale?: string;
}): Promise<ComposePageActionState> {
  // Gate to authenticated editing sessions (cost / abuse), matching the bake
  // action's session guard.
  const auth = await requireSession();
  if (!auth.ok) return { ok: false, error: auth.error, code: "UNAUTHORIZED" };

  // Real workspace scope from the actor's OWN memberships. `requireSession()`
  // alone admitted any signed-in account, membership or not, and this action
  // had NO tenant spend gate at all, so per-workspace caps and RPM limits never
  // applied to "Compose with AI".
  let tenantId: string;
  try {
    const scope = await requireEditSurfaceTenantScope();
    tenantId = scope.tenantId;
  } catch {
    return { ok: false, error: "No active workspace.", code: "NO_SCOPE" };
  }

  const limit = checkRate(auth.user.id);
  if (!limit.ok) {
    const minutes = Math.ceil((limit.remainingMs ?? 0) / 60000);
    return {
      ok: false,
      error: `AI limit reached. Try again in ~${minutes} min.`,
      code: "RATE_LIMITED",
    };
  }

  // Only attempt the model seam when a provider is actually connected, so a
  // no-key environment skips the call entirely and stays fast/deterministic.
  const useModel = await isResolvedAiChatConfigured().catch(() => false);

  // Tenant spend cap / RPM, checked BEFORE the paid ranking call. Only when a
  // model is actually in play — the deterministic preset path costs nothing and
  // must stay available even for a workspace that is over its cap.
  if (useModel) {
    const gate = await assertAiInvocationAllowed(tenantId);
    if (!gate.ok) {
      return { ok: false, error: gate.message, code: gate.code.toUpperCase() };
    }
  }

  const result = await composePageFromBrief({
    brief: input.brief,
    surface: input.surface,
    locale: input.locale,
    useModel,
    rankWithModel: useModel ? buildModelRanker() : undefined,
  });

  if (!result.ok) {
    return { ok: false, error: result.error, code: result.code };
  }
  return {
    ok: true,
    builderTree: result.tree,
    designId: result.designId,
    label: result.label,
    matched: result.matched,
    source: result.source,
  };
}
