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

/** The placeholder the talent writer falls back to when the wizard gave no name. */
export const TALENT_NAME_PLACEHOLDER = "My page";

/** True for a stored display name that is blank or only the placeholder, so the wizard's name may replace it. */
export function isPlaceholderDisplayName(value: string | null | undefined): boolean {
  const v = (value ?? "").trim();
  return v === "" || v.toLowerCase() === TALENT_NAME_PLACEHOLDER.toLowerCase();
}

/**
 * The name the talent's page renders, for the "ready" check. Order: the stored
 * profile name (what the page actually prints), then the name the writer
 * used (`talentDisplayNameFor`), then the brief's own person name. Checking the
 * brief name alone failed a solo pro whose page carries her business name.
 */
export function talentNameToVerify(input: {
  storedDisplayName?: string | null;
  choice: OnboardingChoice;
  businessName: string | null | undefined;
  essentialsName: string | null | undefined;
  briefPersonName: string | null | undefined;
}): string | null {
  const stored = input.storedDisplayName?.trim();
  if (stored && !isPlaceholderDisplayName(stored)) return stored;
  return (
    talentDisplayNameFor({ choice: input.choice, businessName: input.businessName, personName: input.essentialsName }) ??
    (input.briefPersonName?.trim() || null)
  );
}
