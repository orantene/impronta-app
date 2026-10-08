/**
 * TUL-82 · Onboarding 1A: the "How do you work?" answer, as a typed contract.
 *
 * Pure (no server imports) so the 1B screens, the OAuth callback and the build
 * all read the same enum and the same mapping.
 *
 *   myself → talent path   → talent profile + own site, lands on Talent
 *   studio → business path → workspace (owner) + domain row, lands on Workspace
 *   both   → both path     → workspace + own talent profile on its roster, lands on Workspace
 *
 * The explicit choice ALWAYS wins over the module's stored path and over the
 * AI's reading of the words (`resolveBuildPath`).
 */

import type { OnboardingPath } from "./module-state";

export const ONBOARDING_CHOICES = ["myself", "studio", "both"] as const;
export type OnboardingChoice = (typeof ONBOARDING_CHOICES)[number];

export function isOnboardingChoice(value: unknown): value is OnboardingChoice {
  return value === "myself" || value === "studio" || value === "both";
}

export function choiceToPath(choice: OnboardingChoice): OnboardingPath {
  if (choice === "myself") return "talent";
  if (choice === "studio") return "business";
  return "both";
}

export function pathToChoice(path: OnboardingPath): OnboardingChoice {
  if (path === "talent") return "myself";
  if (path === "business") return "studio";
  return "both";
}

/** Where login lands afterwards (`profiles.home_surface_preference`). */
export function homeSurfaceForChoice(choice: OnboardingChoice): "talent" | "workspace" {
  return choice === "myself" ? "talent" : "workspace";
}

/**
 * The app_role a FRESH account (still `client` + `onboarding`) is promoted to.
 * Roles are additive: an account that already has any other role keeps it;
 * the real capabilities come from rows (talent profile, owner membership).
 */
export function freshAppRoleForChoice(choice: OnboardingChoice): "talent" | "agency_staff" {
  return choice === "studio" ? "agency_staff" : "talent";
}

/**
 * The build path. Explicit choice → else the person's fork answer → else the
 * AI reading. The AI may suggest; it never overrides a choice.
 */
export function resolveBuildPath(input: {
  choice: OnboardingChoice | null | undefined;
  statePath: OnboardingPath | null | undefined;
  aiPath: () => OnboardingPath;
}): OnboardingPath {
  if (input.choice) return choiceToPath(input.choice);
  if (input.statePath) return input.statePath;
  return input.aiPath();
}

/** `choice` carried on an auth `next` URL (Google sign-up), e.g. `/onboarding?choice=both`. */
export function choiceFromNext(next: string | null | undefined): OnboardingChoice | null {
  if (!next) return null;
  const q = next.indexOf("?");
  if (q < 0) return null;
  const value = new URLSearchParams(next.slice(q + 1)).get("choice");
  return isOnboardingChoice(value) ? value : null;
}
