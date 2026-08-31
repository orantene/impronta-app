/**
 * engine.server.ts — the engine, wired to the catalog and the database.
 *
 * The split is the point: `engine.ts` is a pure function of (facts, catalog) and
 * therefore replayable, while everything that touches IO lives here. Anything
 * added to this file must be IO; a rule that lands here instead of there stops
 * being testable as a literal and stops being replayable at all.
 */

import "server-only";

import { loadTulalaEntitlements } from "./entitlements";
import { recommend, ENGINE_VERSION, type Recommendation } from "./engine";
import { setBriefEngineVersion } from "./brief-store.server";
import { recordUpgradeTriggers } from "./upgrade-triggers.server";
import { logUnclassifiable } from "./intake-telemetry";
import { packForBrief } from "./pack-for-brief";
import type { Brief } from "./brief-store";

export type RecommendResult = {
  recommendation: Recommendation;
  /** False when the triggers could not be persisted. The recommendation stands. */
  triggersPersisted: boolean;
};

/**
 * Run the engine for a brief and persist what has to outlive the request.
 *
 * Two things are written and nothing else:
 *
 *   - `tulala_briefs.engine_version`, so a future replay can tell a rule change
 *     from a data change. Without it the whole harness is guesswork.
 *   - The upgrade triggers, because a Free recommendation that leaves nothing
 *     behind reduces the business to asking again later and hoping.
 *
 * The recommendation ITSELF is not stored as a row. It is a pure function of
 * facts the brief already holds, so storing it would create a second copy that
 * can disagree with the facts. It gets frozen into a version snapshot at
 * approval time, which is the only moment it becomes a commitment.
 */
export async function recommendForBrief(
  brief: Brief,
  options: {
    currency?: string;
    persist?: boolean;
    /** For telemetry only. Never used to authorise anything. */
    scope?: { sessionId?: string | null; userId?: string | null; locale?: string | null };
  } = {},
): Promise<RecommendResult> {
  const ents = await loadTulalaEntitlements(options.currency ?? "USD");
  const recommendation = recommend(brief, ents);

  // SIGNAL 4b, on every run including the non-persisting ones. An unclassifiable
  // brief is a business shape the laws do not cover — a product gap, not a
  // conversation problem — and the plan is explicit that it must reach a human.
  // It fires here rather than at the call sites because there is no version of
  // "we could not classify this person" that is not worth knowing about, and a
  // per-caller opt-in would eventually be forgotten by one of them.
  //
  // `logUnclassifiable` itself ignores `insufficient_evidence`, which is the
  // ordinary state of a conversation in progress.
  void logUnclassifiable(
    { ...(options.scope ?? {}), packId: packForBrief(brief)?.id ?? null },
    recommendation,
  ).catch(() => {});

  if (options.persist === false) {
    return { recommendation, triggersPersisted: false };
  }

  await setBriefEngineVersion(brief.id, ENGINE_VERSION);
  const written = await recordUpgradeTriggers(brief.id, recommendation.upgradeTriggers);

  return { recommendation, triggersPersisted: written.ok };
}
