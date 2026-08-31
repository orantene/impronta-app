/**
 * engine-types.ts — the recommendation's output shape.
 *
 * Its own module so `engine.ts` (which decides the shape) and
 * `engine-plans.ts` (which decides the price) can both name these without
 * importing each other. A type-only cycle would compile, but it would also mean
 * neither file can be read without the other open.
 *
 * These types are a CONTRACT, not an implementation detail: the approval screen,
 * the replay harness and the override telemetry all read them, so a field added
 * here needs a reason that survives all three.
 */

import type { PlanKey } from "@/lib/access/plan-catalog";
import type { WorkspaceType } from "@/lib/saas/workspace-type";
import type { PlanFamily } from "./entitlements";

// ─── Output shape ─────────────────────────────────────────────────────────────

/** One traceable reason. `factKeys` is what the UI quotes back to the user. */
export type Reason = {
  code: string;
  /** Human sentence, addressed to the user. Safe to show as-is. */
  text: string;
  factKeys: string[];
};

export type StructureDecision = {
  talentProfile: boolean;
  workspace: boolean;
  /**
   * Roster-shaped or staff-resource-shaped. Null when no workspace is proposed.
   *
   * Not cosmetic and not a settings toggle: `workspace_type = 'business'` hides
   * the roster and pitches surfaces entirely. A salon owner given the wrong
   * shape will churn before she finds the setting, so the intake sets it
   * deliberately from the "do clients pick who they see" answer.
   */
  workspaceType: WorkspaceType | null;
};

export type PlanDecision = {
  workspace: PlanKey | null;
  talent: PlanKey | null;
  /**
   * The family whose plan is actually SOLD at signup. The other side runs on its
   * free tier.
   *
   * Detecting that someone needs both is required; charging for both at signup
   * is not. Tulala must never feel like it is charging someone twice to exist,
   * and a genuine cross-family bundle is billing work this plan does not do.
   */
  sell: PlanFamily | null;
};

export type UpgradeTriggerProposal = {
  triggerKey: string;
  targetPackage: PlanFamily;
  targetTier: PlanKey;
  /** Quotes the user's own situation back at them. Stored per brief. */
  rationale: string;
};

/**
 * Why the engine could not decide. Split in two because the two mean different
 * things and only one of them is a product bug.
 */
export type Unresolved =
  | { kind: "insufficient_evidence"; missingFactKeys: string[] }
  /**
   * The facts are present and coherent and still do not describe a shape the
   * laws cover. This is a gap in the product, not in the conversation, and it
   * must reach a human rather than a metrics table.
   */
  | { kind: "unclassifiable"; note: string };

export type Recommendation = {
  engineVersion: string;
  confidence: { talent: number; workspace: number };
  /** Raw sums, for the replay harness and for debugging a bad call. */
  scores: { talent: number; workspace: number };
  structure: StructureDecision;
  plans: PlanDecision;
  /** Roster profiles the operation needs seated. 0 when it seats nobody. */
  seatsNeeded: number;
  reasons: Reason[];
  upgradeTriggers: UpgradeTriggerProposal[];
  unresolved: Unresolved | null;
  /**
   * True when the catalog read was degraded. The engine still recommends, but
   * the Agent must not quote a price from a degraded catalog.
   */
  catalogDegraded: boolean;
};
