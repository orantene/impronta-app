import type { OnboardingChoice } from "./choice";

/**
 * The name a new talent page goes by: the person's own name, the one they typed
 * on the essentials step. TUL-1839: TUL-810 had a solo pro's business name replace
 * it, so "Valeria" appeared nowhere on her built page (only "Brillo Caribe"). The
 * business name now only stands in when the person gave no name of their own.
 * `personName` must be the person's name (brief facts), never `essentials.name`,
 * which step 3 seeds with the business name first.
 */
export function talentDisplayNameFor(input: {
  choice: OnboardingChoice;
  businessName: string | null | undefined;
  personName: string | null | undefined;
}): string | null {
  const person = input.personName?.trim();
  if (person) return person;
  const business = input.businessName?.trim();
  return input.choice === "myself" && business ? business : null;
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

/**
 * TUL-1839: the saved-draft retry checks the same name as the first build.
 * A talent-only draft (no business name on the arrival) uses the talent name
 * derivation; a workspace draft keeps its business name.
 */
export function retryNameToVerify(input: {
  arrival: { businessName: string | null; headlineName: string | null };
  storedDisplayName?: string | null;
  choice: OnboardingChoice;
  briefBusinessName: string | null | undefined;
  essentialsName: string | null | undefined;
}): string | null {
  if (input.arrival.businessName !== null) return input.arrival.businessName;
  return talentNameToVerify({
    storedDisplayName: input.storedDisplayName,
    choice: input.choice,
    businessName: input.briefBusinessName,
    essentialsName: input.essentialsName,
    briefPersonName: input.arrival.headlineName,
  });
}
