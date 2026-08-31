/**
 * intake-telemetry.ts — the four learning-loop signals, in one place.
 *
 * Every function here is a thin, named wrapper over `logAnalyticsEventServer`.
 * The wrapping is the point: a payload shape assembled at each call site drifts
 * within a week, and these events are only useful if a question id means the
 * same thing in every row six months from now.
 *
 * WHAT IS DELIBERATELY NOT HERE
 * ─────────────────────────────
 * No conversation text, no model output, no user answers. A question id plus an
 * outcome is enough for all four signals, which is why the intake can be fully
 * measured without persisting a single transcript and without touching
 * `docs/ai-data-retention.md`.
 *
 * No new table and no new pipeline either: these are rows in `analytics_events`
 * like everything else. And explicitly NOT Upstash KV, which does rate limits
 * only today; inventing a counter pattern there would be a second analytics
 * system nobody maintains.
 */

import "server-only";

import { logAnalyticsEventServer } from "@/lib/analytics/server-log";
import { PRODUCT_ANALYTICS_EVENTS } from "@/lib/analytics/product-events";
import { QUESTION_BANK_VERSION, type Question } from "./questions";
import type { Recommendation } from "./engine";

type Scope = {
  /** Guest session key or profile id. Whichever the intake currently has. */
  sessionId?: string | null;
  userId?: string | null;
  locale?: string | null;
  /**
   * The industry pack active when this happened, or null.
   *
   * On every signal, because it is the axis the whole learning loop is sliced
   * by. "This question yields nothing" is a mildly interesting row; "this
   * question yields nothing FOR PHOTOGRAPHERS" names the fix, which is either a
   * pack question or no question at all. Without the pack on the row that
   * distinction is unrecoverable after the fact, and retrofitting it makes every
   * measurement taken before the retrofit worthless.
   */
  packId?: string | null;
};

export async function logQuestionAsked(
  scope: Scope,
  question: Question,
  askIndex: number,
): Promise<void> {
  await logAnalyticsEventServer({
    name: PRODUCT_ANALYTICS_EVENTS.tulala_question_asked,
    sessionId: scope.sessionId ?? null,
    userId: scope.userId ?? null,
    locale: scope.locale ?? null,
    payload: {
      question_id: question.id,
      question_version: question.version,
      bank_version: QUESTION_BANK_VERSION,
      stage: question.stage,
      pack_id: scope.packId ?? null,
      ask_index: askIndex,
      open: question.open,
      decisive: Boolean(question.decisive),
    },
  });
}

/**
 * SIGNAL 2 — what a question actually produced.
 *
 * `factsYielded: 0` on a first ask is the interesting row, not a boring one: it
 * means the question was understood and answered and still extracted nothing,
 * which is a phrasing problem rather than a comprehension problem.
 */
export async function logQuestionYield(
  scope: Scope,
  question: Question,
  result: { factKeys: string[]; meanConfidence: number; reAsk: boolean },
): Promise<void> {
  await logAnalyticsEventServer({
    name: PRODUCT_ANALYTICS_EVENTS.tulala_question_yield,
    sessionId: scope.sessionId ?? null,
    userId: scope.userId ?? null,
    locale: scope.locale ?? null,
    payload: {
      question_id: question.id,
      question_version: question.version,
      stage: question.stage,
      pack_id: scope.packId ?? null,
      facts_yielded: result.factKeys.length,
      fact_keys: result.factKeys,
      mean_confidence: Number(result.meanConfidence.toFixed(2)),
      re_ask: result.reAsk,
      open: question.open,
    },
  });
}

/** SIGNAL 1 — where the session went cold. */
export async function logIntakeAbandoned(
  scope: Scope,
  at: { question: Question | null; turns: number; factsKnown: number },
): Promise<void> {
  await logAnalyticsEventServer({
    name: PRODUCT_ANALYTICS_EVENTS.tulala_intake_abandoned,
    sessionId: scope.sessionId ?? null,
    userId: scope.userId ?? null,
    locale: scope.locale ?? null,
    payload: {
      question_id: at.question?.id ?? null,
      question_version: at.question?.version ?? null,
      stage: at.question?.stage ?? null,
      pack_id: scope.packId ?? null,
      turns: at.turns,
      facts_known: at.factsKnown,
    },
  });
}

/** SIGNAL 4a — the user could not answer this question. */
export async function logQuestionUnanswerable(
  scope: Scope,
  question: Question,
  industry: string | null,
): Promise<void> {
  await logAnalyticsEventServer({
    name: PRODUCT_ANALYTICS_EVENTS.tulala_question_unanswerable,
    sessionId: scope.sessionId ?? null,
    userId: scope.userId ?? null,
    locale: scope.locale ?? null,
    payload: {
      question_id: question.id,
      question_version: question.version,
      stage: question.stage,
      pack_id: scope.packId ?? null,
      industry,
    },
  });
}

/**
 * SIGNAL 4b — the engine could not classify.
 *
 * Only fires for the `unclassifiable` kind. `insufficient_evidence` is the
 * normal state of a conversation in progress and logging it would bury the
 * signal that matters under thousands of rows.
 */
export async function logUnclassifiable(
  scope: Scope,
  recommendation: Recommendation,
): Promise<void> {
  if (recommendation.unresolved?.kind !== "unclassifiable") return;
  await logAnalyticsEventServer({
    name: PRODUCT_ANALYTICS_EVENTS.tulala_unclassifiable,
    sessionId: scope.sessionId ?? null,
    userId: scope.userId ?? null,
    locale: scope.locale ?? null,
    payload: {
      engine_version: recommendation.engineVersion,
      note: recommendation.unresolved.note,
      talent_score: recommendation.scores.talent,
      workspace_score: recommendation.scores.workspace,
      seats_needed: recommendation.seatsNeeded,
      pack_id: scope.packId ?? null,
    },
  });
}

/**
 * SIGNAL 3 — the user changed the recommendation.
 *
 * One event per changed field, not one per submission, so "the engine gets the
 * shape right and the plan wrong" is separable from "it gets everything wrong".
 * Those two have completely different fixes.
 */
export async function logRecommendationOverride(
  scope: Scope,
  recommendation: Recommendation,
  changes: Array<{ field: string; recommended: unknown; chosen: unknown }>,
): Promise<void> {
  if (changes.length === 0) {
    await logAnalyticsEventServer({
      name: PRODUCT_ANALYTICS_EVENTS.tulala_recommendation_accepted,
      sessionId: scope.sessionId ?? null,
      userId: scope.userId ?? null,
      locale: scope.locale ?? null,
      payload: {
        engine_version: recommendation.engineVersion,
        structure_talent: recommendation.structure.talentProfile,
        structure_workspace: recommendation.structure.workspace,
        workspace_type: recommendation.structure.workspaceType,
        plan_workspace: recommendation.plans.workspace,
        plan_talent: recommendation.plans.talent,
        sold: recommendation.plans.sell,
      },
    });
    return;
  }

  for (const change of changes) {
    await logAnalyticsEventServer({
      name: PRODUCT_ANALYTICS_EVENTS.tulala_recommendation_overridden,
      sessionId: scope.sessionId ?? null,
      userId: scope.userId ?? null,
      locale: scope.locale ?? null,
      payload: {
        engine_version: recommendation.engineVersion,
        field: change.field,
        recommended: change.recommended,
        chosen: change.chosen,
        talent_confidence: Number(recommendation.confidence.talent.toFixed(2)),
        workspace_confidence: Number(recommendation.confidence.workspace.toFixed(2)),
      },
    });
  }
}

/**
 * The fields the approval screen may override, and how to diff them.
 *
 * Kept next to the event so a new overridable field cannot be added to the UI
 * without the signal following it.
 */
export function diffRecommendation(
  recommendation: Recommendation,
  chosen: {
    talentProfile: boolean;
    workspace: boolean;
    workspaceType: string | null;
    workspacePlan: string | null;
    talentPlan: string | null;
  },
): Array<{ field: string; recommended: unknown; chosen: unknown }> {
  const changes: Array<{ field: string; recommended: unknown; chosen: unknown }> = [];
  const compare = (field: string, recommended: unknown, value: unknown) => {
    if (recommended !== value) changes.push({ field, recommended, chosen: value });
  };
  compare("structure.talentProfile", recommendation.structure.talentProfile, chosen.talentProfile);
  compare("structure.workspace", recommendation.structure.workspace, chosen.workspace);
  compare("structure.workspaceType", recommendation.structure.workspaceType, chosen.workspaceType);
  compare("plans.workspace", recommendation.plans.workspace, chosen.workspacePlan);
  compare("plans.talent", recommendation.plans.talent, chosen.talentPlan);
  return changes;
}
