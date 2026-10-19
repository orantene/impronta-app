/**
 * NW5 (TUL-1204): the reusable business onboarding template.
 *
 * Pure data + resolver, no DB. Any new workspace (barber, salon, studio, ...)
 * instantiates the checklist for its trade with `resolveBusinessOnboarding`,
 * feeding plain readiness facts. Completion reuses the existing first-day
 * readiness keys (`first-day.ts`, `firstDayCompletedStepIds`) plus three
 * extra fact keys the caller computes from existing checks (`essentialsReady`
 * for `essentials`, team roster count, payments account status).
 *
 * Copy lives in messages/{en,es}.json under `businessOnboarding.<stepId>`.
 */

import { FIRST_DAY_STEPS, firstDayCompletedStepIds, type FirstDayInput } from "@/lib/talent-agenda/first-day";
import { TRADE_PROFILES, resolveTradeProfile } from "@/lib/talent-agenda/trades";

export const BUSINESS_ONBOARDING_NAMESPACE = "businessOnboarding";

/** Facts the template can read. First-day keys come from first-day.ts; the rest from existing checks. */
export const KNOWN_READINESS_KEYS = [...FIRST_DAY_STEPS, "essentials", "team", "payments"] as const;
export type ReadinessKey = (typeof KNOWN_READINESS_KEYS)[number];
export type ReadinessFacts = Partial<Record<ReadinessKey, boolean>>;

export type BusinessOnboardingStep = {
  id: string;
  order: number;
  /** "all" or the TRADE_PROFILES keys the step applies to. */
  trades: "all" | readonly string[];
  readinessKey: ReadinessKey;
};

const TEAM_TRADES = ["beauty", "barber", "massage", "trainer", "clean", "chef"] as const;

export const BUSINESS_ONBOARDING_STEPS: readonly BusinessOnboardingStep[] = [
  { id: "basics", order: 10, trades: "all", readinessKey: "essentials" },
  { id: "services", order: 20, trades: "all", readinessKey: "services" },
  { id: "hours", order: 30, trades: "all", readinessKey: "availability" },
  { id: "location", order: 40, trades: "all", readinessKey: "location" },
  { id: "photos", order: 50, trades: "all", readinessKey: "photo" },
  { id: "team", order: 60, trades: TEAM_TRADES, readinessKey: "team" },
  { id: "payments", order: 70, trades: "all", readinessKey: "payments" },
  { id: "preview", order: 80, trades: "all", readinessKey: "preview" },
  { id: "publish", order: 90, trades: "all", readinessKey: "website" },
];

export type ResolvedOnboardingStep = BusinessOnboardingStep & { done: boolean };

/** The checklist for a trade (TRADE_PROFILES key or taxonomy slug; unknown falls back to beauty), in order. */
export function resolveBusinessOnboarding(
  trade: string | null | undefined,
  facts: ReadinessFacts,
): ResolvedOnboardingStep[] {
  const key = trade && TRADE_PROFILES[trade] ? trade : resolveTradeProfile(trade).key;
  return BUSINESS_ONBOARDING_STEPS.filter((s) => s.trades === "all" || s.trades.includes(key))
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((s) => ({ ...s, done: facts[s.readinessKey] === true }));
}

/** Build facts from the existing first-day input plus the three extras. */
export function factsFromFirstDay(
  input: FirstDayInput,
  extras: Partial<Pick<ReadinessFacts, "essentials" | "team" | "payments">> = {},
): ReadinessFacts {
  const facts: ReadinessFacts = { ...extras };
  for (const id of firstDayCompletedStepIds(input)) facts[id] = true;
  return facts;
}

export function onboardingProgress(steps: readonly ResolvedOnboardingStep[]): { done: number; total: number } {
  return { done: steps.filter((s) => s.done).length, total: steps.length };
}
