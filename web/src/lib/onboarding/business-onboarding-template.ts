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
  /** Full catalog keys (kept as literals so the dead-key guard sees them used). */
  titleKey: string;
  descriptionKey: string;
};

const TEAM_TRADES = ["beauty", "barber", "massage", "trainer", "clean", "chef"] as const;

export const BUSINESS_ONBOARDING_STEPS: readonly BusinessOnboardingStep[] = [
  { id: "basics", order: 10, trades: "all", readinessKey: "essentials", titleKey: "businessOnboarding.basics.title", descriptionKey: "businessOnboarding.basics.description" },
  { id: "services", order: 20, trades: "all", readinessKey: "services", titleKey: "businessOnboarding.services.title", descriptionKey: "businessOnboarding.services.description" },
  { id: "hours", order: 30, trades: "all", readinessKey: "availability", titleKey: "businessOnboarding.hours.title", descriptionKey: "businessOnboarding.hours.description" },
  { id: "location", order: 40, trades: "all", readinessKey: "location", titleKey: "businessOnboarding.location.title", descriptionKey: "businessOnboarding.location.description" },
  { id: "photos", order: 50, trades: "all", readinessKey: "photo", titleKey: "businessOnboarding.photos.title", descriptionKey: "businessOnboarding.photos.description" },
  { id: "team", order: 60, trades: TEAM_TRADES, readinessKey: "team", titleKey: "businessOnboarding.team.title", descriptionKey: "businessOnboarding.team.description" },
  { id: "payments", order: 70, trades: "all", readinessKey: "payments", titleKey: "businessOnboarding.payments.title", descriptionKey: "businessOnboarding.payments.description" },
  { id: "preview", order: 80, trades: "all", readinessKey: "preview", titleKey: "businessOnboarding.preview.title", descriptionKey: "businessOnboarding.preview.description" },
  { id: "publish", order: 90, trades: "all", readinessKey: "website", titleKey: "businessOnboarding.publish.title", descriptionKey: "businessOnboarding.publish.description" },
];

export type ResolvedOnboardingStep = BusinessOnboardingStep & { done: boolean };

/** The checklist for a trade (TRADE_PROFILES key or taxonomy slug; unknown falls back to beauty), in order. */
export function resolveBusinessOnboarding(
  trade: string | null | undefined,
  facts: ReadinessFacts,
  opts: { teamCapable?: boolean } = {},
): ResolvedOnboardingStep[] {
  const key = trade && TRADE_PROFILES[trade] ? trade : resolveTradeProfile(trade).key;
  // A workspace with a team (salon, agency, studio, restaurant, ...) always gets the team step,
  // whatever its trade: team-ness is a capability of the workspace, not of an industry.
  return BUSINESS_ONBOARDING_STEPS.filter((s) => s.trades === "all" || opts.teamCapable === true || s.trades.includes(key))
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
