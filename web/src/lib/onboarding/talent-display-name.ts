import type { OnboardingChoice } from "./choice";

/**
 * TUL-810: the name a new talent page goes by. A solo pro who gave a business
 * name ("Casa Limpia") gets it on the page; otherwise the person's own name.
 * On "both" the business names the workspace, so the talent page stays personal.
 */
export function talentDisplayNameFor(input: {
  choice: OnboardingChoice;
  businessName: string | null | undefined;
  personName: string | null | undefined;
}): string | null {
  const business = input.businessName?.trim();
  if (input.choice === "myself" && business) return business;
  return input.personName?.trim() || null;
}
