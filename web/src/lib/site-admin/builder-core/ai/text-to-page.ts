/**
 * AI-1 (B4) — shared text-to-page COMPOSER.
 *
 * One shared module that turns a one-line brief into a real, governed
 * BuilderNode tree by composing the EXISTING page-design presets — never by
 * emitting arbitrary nodes or HTML. The flow:
 *
 *   brief + surface
 *     → planPresetsFromBrief()              (deterministic keyword → ordered ids)
 *     → [optional] LLM re-rank of the SAME closed candidate list
 *     → bakePageDesignTree(chosen design)   (the same baker every starter uses)
 *     → validateBuilderNodeTree()           (governance / schema / child rules)
 *     → validated BuilderNode tree
 *
 * Safety: the model can only RE-RANK the fixed in-repo preset list (it returns
 * ids, which are discarded unless they're in the candidate set), and the baked
 * tree is run through the SAME `validateBuilderNodeTree` the gallery-insert path
 * uses, so the composer can never produce an illegal/locked node or inject HTML.
 * When no model is connected (the common case — greenfield AI in the builder),
 * the deterministic planner alone produces a valid page; the model is a pure
 * upgrade seam, not a dependency.
 *
 * This module imports the full page-design trees, so it is SERVER-ONLY (consumed
 * by text-to-page-action.ts). The client picker imports only the lightweight
 * summaries via the planner.
 */

import {
  getPageDesign,
  bakePageDesignTree,
} from "@/lib/site-admin/builder-node/page-designs";
import { validateBuilderNodeTree } from "@/lib/site-admin/builder-node/validate";
import type { BuilderNodeTree } from "@/lib/site-admin/builder-node/types";
import {
  applyModelPreference,
  planPresetsFromBrief,
  type PresetPlan,
  type TextToPageSurface,
} from "./preset-plan";

export type { TextToPageSurface } from "./preset-plan";

export interface ComposePageInput {
  brief: string;
  surface: TextToPageSurface;
  locale?: string;
  /**
   * When true, attempt the LLM re-rank seam (requires a connected provider). The
   * deterministic planner still runs first and is the fallback, so a missing key
   * or model failure NEVER fails the compose — it degrades to keyword matching.
   * Defaults to true; the action passes the resolved flag.
   */
  useModel?: boolean;
  /**
   * Injected model re-ranker (the action wires the AI adapter here). Kept as a
   * parameter so this module has NO direct provider import — it stays pure +
   * unit-testable, and the seam can be exercised with a stub in tests. Returns an
   * ordered list of preferred design ids, or null on any failure (the planner's
   * order is then used unchanged).
   */
  rankWithModel?: (
    brief: string,
    candidateIds: ReadonlyArray<string>,
  ) => Promise<ReadonlyArray<string> | null>;
}

export type ComposePageResult =
  | {
      ok: true;
      /** The validated, insert-ready freeform tree. */
      tree: BuilderNodeTree;
      /** The composed design id (for the apply label + telemetry). */
      designId: string;
      /** Human label of the composed design (for the Undo toast). */
      label: string;
      /** Whether the keyword planner found a real brief match. */
      matched: boolean;
      /** How the chosen design was reached. */
      source: "model" | "keyword";
    }
  | { ok: false; error: string; code?: string };

const MIN_BRIEF_LEN = 3;
const MAX_BRIEF_LEN = 400;

/**
 * Compose a validated BuilderNode tree from a one-line brief. The single shared
 * entry every surface's empty state routes through.
 */
export async function composePageFromBrief(
  input: ComposePageInput,
): Promise<ComposePageResult> {
  const brief = (input.brief ?? "").trim();
  if (brief.length < MIN_BRIEF_LEN) {
    return {
      ok: false,
      error: "Add a few words describing the page you want.",
      code: "BRIEF_TOO_SHORT",
    };
  }
  const clippedBrief = brief.slice(0, MAX_BRIEF_LEN);

  // 1. Deterministic plan over the closed preset set (always succeeds).
  let plan: PresetPlan = planPresetsFromBrief(clippedBrief, input.surface);
  let source: "model" | "keyword" = "keyword";

  // 2. Optional LLM re-rank of the SAME candidate list. Best-effort: any failure
  //    (no key, bad JSON, hallucinated ids) leaves the deterministic order intact.
  if (input.useModel !== false && input.rankWithModel) {
    try {
      const candidateIds = plan.ordered.map((e) => e.id);
      const preferred = await input.rankWithModel(clippedBrief, candidateIds);
      if (preferred && preferred.length > 0) {
        const reranked = applyModelPreference(plan, preferred);
        // Only treat it as a model pick if the model actually moved a known id
        // to the front (otherwise it added no signal over the keyword planner).
        if (reranked.chosenId !== plan.chosenId || candidateIds.includes(preferred[0])) {
          plan = reranked;
          source = "model";
        }
      }
    } catch {
      // Swallow — degrade to the deterministic plan. The action logs provider
      // errors separately when it builds the ranker.
    }
  }

  // 3. Bake the chosen design into a self-contained tree (same baker the
  //    homepage + Lab + starter paths use — repeaters expanded, fresh ids).
  const design = getPageDesign(plan.chosenId);
  if (!design) {
    return {
      ok: false,
      error: "Could not assemble a page from that brief — try rephrasing.",
      code: "NO_DESIGN",
    };
  }
  const baked = bakePageDesignTree(design.tree, design.dataSources);

  // 4. Validate through the SAME governance/schema gate the gallery insert uses.
  //    A composer that can only bake registry designs should always pass; we gate
  //    anyway so a future malformed design can never reach a surface as an
  //    illegal tree.
  const validation = validateBuilderNodeTree(baked);
  if (!validation.ok) {
    return {
      ok: false,
      error: "The composed page failed validation — try a different brief.",
      code: "VALIDATION_FAILED",
    };
  }

  return {
    ok: true,
    tree: validation.tree,
    designId: design.id,
    label: design.label,
    matched: plan.matched,
    source,
  };
}
