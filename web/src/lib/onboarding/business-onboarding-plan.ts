/**
 * NW5 (TUL-1204): instantiate the business onboarding template for ONE new
 * business. Pure: no DB, no React. The template (`business-onboarding-template.ts`)
 * decides which sections exist; this adds the business name and locale and
 * reads plain facts from the finished arrival, so nothing here knows an industry.
 *
 * - Selection: the trade key only trims trade-specific rows; a business with a
 *   team (any workspace arrival) is `teamCapable`, so salons, agencies, studios
 *   and restaurants all get the same full section list.
 * - Name: `{business}` in the copy is replaced by the business name, or by a
 *   localized "your business" when the name is unknown.
 * - Locale: copy is read through the caller's translator for that locale.
 */

import type { ArrivalPayload } from "./arrival";
import {
  onboardingProgress,
  resolveBusinessOnboarding,
  type ReadinessFacts,
} from "./business-onboarding-template";

export type BusinessOnboardingPlanStep = {
  id: string;
  title: string;
  description: string;
  done: boolean;
};

export type BusinessOnboardingPlan = {
  template: "nw5";
  locale: string;
  businessName: string;
  heading: string;
  steps: BusinessOnboardingPlanStep[];
  progress: { done: number; total: number };
};

export function instantiateBusinessOnboarding(
  input: {
    businessName: string | null | undefined;
    locale: string;
    /** TRADE_PROFILES key or taxonomy slug; optional, unknown is fine. */
    trade?: string | null;
    facts?: ReadinessFacts;
    /** Default true: a business workspace can always add people. */
    teamCapable?: boolean;
  },
  t: (key: string) => string,
): BusinessOnboardingPlan {
  const given = (input.businessName ?? "").trim();
  const businessName = given || t("businessOnboarding.fallbackName");
  const fill = (text: string) => text.replace(/\{business\}/g, businessName);
  const resolved = resolveBusinessOnboarding(input.trade ?? null, input.facts ?? {}, {
    teamCapable: input.teamCapable ?? true,
  });
  return {
    template: "nw5",
    locale: input.locale,
    businessName,
    heading: fill(t("businessOnboarding.setupHeading")),
    steps: resolved.map((s) => ({
      id: s.id,
      title: fill(t(s.titleKey)),
      description: fill(t(s.descriptionKey)),
      done: s.done,
    })),
    progress: onboardingProgress(resolved),
  };
}

/** Facts the finished arrival really proves (never guessed): the rest stay open. */
export function factsFromArrival(arrival: ArrivalPayload): ReadinessFacts {
  const f = arrival.fact;
  const facts: ReadinessFacts = {};
  if (arrival.businessName) facts.essentials = f.services > 0 && f.hours;
  if (f.services > 0) facts.services = true;
  if (f.hours) facts.availability = true;
  if (f.city) facts.location = true;
  if (f.photos) facts.photo = true;
  if (arrival.siteLive || arrival.variant === "business" || arrival.variant === "both") facts.website = true;
  return facts;
}
