/**
 * replay.ts — run the engine over the corpus and diff against expectations.
 *
 * Split from the CLI so the same code path is what CI asserts and what a human
 * runs. A harness that only exists inside a script is a harness that silently
 * stops working.
 *
 * The catalog here is a LITERAL, not a database read. Two reasons, both
 * load-bearing:
 *
 *   - CI has no Supabase, so a DB-backed corpus would not run where it matters.
 *   - A price edit in the admin UI must not turn a replay red. The corpus tests
 *     the RULES; drift between code and catalog is `check:price-drift`'s job,
 *     and conflating the two makes both signals useless.
 */

import { recommend, type Recommendation } from "./engine";
import type { PlanFamily, TulalaEntitlements, TulalaPlanOption } from "./entitlements";
import type { PlanKey } from "@/lib/access/plan-catalog";
import { REPLAY_FIXTURES, briefFromFixture, type ReplayFixture } from "./replay-fixtures";

// ─── Frozen catalog ───────────────────────────────────────────────────────────

function option(
  family: PlanFamily,
  planKey: PlanKey,
  monthly: number | null,
  rosterSeats: number | null,
  extra: Partial<TulalaPlanOption> = {},
): TulalaPlanOption {
  return {
    family,
    planKey,
    dbTierSlug: planKey,
    displayName: planKey,
    tagline: null,
    monthlyPriceCents: monthly,
    annualPriceCents: monthly === null ? null : monthly * 10,
    currency: "USD",
    formattedMonthly: monthly === null ? null : `$${Math.round(monthly / 100)}`,
    rosterSeats,
    trialDays: 14,
    trialEnabled: true,
    isSelfServe: true,
    isSellableNow: true,
    highlights: [],
    ...extra,
  };
}

/**
 * The shape of the catalog, pinned. Prices are plausible but arbitrary: only the
 * ORDERING and the seat caps affect any decision the engine makes, and pinning
 * real prices here would make a pricing change look like a rule regression.
 */
export const REPLAY_CATALOG: TulalaEntitlements = {
  commissionBps: 600,
  clientSurchargeBps: 300,
  currency: "USD",
  degraded: false,
  loadedAt: "2026-01-01T00:00:00.000Z",
  workspace: [
    option("workspace", "free", 0, 3),
    // Seats nobody, on purpose. The case that catches a naive price-ordered search.
    option("workspace", "website", 2900, 0),
    option("workspace", "studio", 7900, 10),
    option("workspace", "agency", 19900, 40),
    option("workspace", "network", null, null, { isSelfServe: false, isSellableNow: false }),
  ],
  talent: [
    option("talent", "talent_basic", 0, null),
    option("talent", "talent_pro", 1900, null),
    option("talent", "talent_portfolio", 3900, null),
  ],
};

// ─── Diffing ──────────────────────────────────────────────────────────────────

export type ReplayMismatch = {
  field: string;
  expected: unknown;
  actual: unknown;
};

export type ReplayCaseResult = {
  fixture: ReplayFixture;
  recommendation: Recommendation;
  mismatches: ReplayMismatch[];
};

export function replayCase(fixture: ReplayFixture): ReplayCaseResult {
  const recommendation = recommend(briefFromFixture(fixture), REPLAY_CATALOG);
  const mismatches: ReplayMismatch[] = [];

  const check = (field: string, expected: unknown, actual: unknown) => {
    if (expected === undefined) return;
    if (expected !== actual) mismatches.push({ field, expected, actual });
  };

  const e = fixture.expect;
  check("structure.talentProfile", e.talentProfile, recommendation.structure.talentProfile);
  check("structure.workspace", e.workspace, recommendation.structure.workspace);
  check("structure.workspaceType", e.workspaceType, recommendation.structure.workspaceType);
  check("plans.workspace", e.workspacePlan, recommendation.plans.workspace);
  check("plans.talent", e.talentPlan, recommendation.plans.talent);
  check("plans.sell", e.sell, recommendation.plans.sell);
  check("seatsNeeded", e.seatsNeeded, recommendation.seatsNeeded);
  check("unresolved.kind", e.unresolvedKind, recommendation.unresolved?.kind ?? null);

  for (const code of e.reasonCodes ?? []) {
    if (!recommendation.reasons.some((r) => r.code === code)) {
      mismatches.push({ field: `reasons[${code}]`, expected: "present", actual: "absent" });
    }
  }
  for (const key of e.upgradeTriggerKeys ?? []) {
    if (!recommendation.upgradeTriggers.some((t) => t.triggerKey === key)) {
      mismatches.push({
        field: `upgradeTriggers[${key}]`,
        expected: "present",
        actual: "absent",
      });
    }
  }

  return { fixture, recommendation, mismatches };
}

export function replayAll(): ReplayCaseResult[] {
  return REPLAY_FIXTURES.map(replayCase);
}

/**
 * A one-line signature per case: what the engine decided, compressed.
 *
 * The point of a stable signature is that `git diff` on saved output answers
 * "what else did that rule change move?" — the question a corpus exists to
 * answer, and the one that is impossible to answer by reading the rule.
 */
export function caseSignature(result: ReplayCaseResult): string {
  const r = result.recommendation;
  const parts = [
    r.structure.talentProfile ? "talent" : "-",
    r.structure.workspace ? (r.structure.workspaceType ?? "ws?") : "-",
    `seats=${r.seatsNeeded}`,
    `ws=${r.plans.workspace ?? "-"}`,
    `tal=${r.plans.talent ?? "-"}`,
    `sell=${r.plans.sell ?? "-"}`,
    r.unresolved ? `unresolved=${r.unresolved.kind}` : "resolved",
    `conf=${r.confidence.talent.toFixed(2)}/${r.confidence.workspace.toFixed(2)}`,
  ];
  return `${result.fixture.id.padEnd(28)} ${parts.join(" ")}`;
}
