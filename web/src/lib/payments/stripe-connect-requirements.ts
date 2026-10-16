import snapshot from "./stripe-connect-requirements.snapshot.json";

export type RequirementEntry = {
  accountTypes: readonly string[];
  dashboardTypes: readonly string[];
  tosTypes: readonly string[];
  cardPayments: boolean;
};

export const REQUIREMENTS_SOURCE_URL: string = snapshot.source;
export const REQUIREMENTS_FETCHED_AT: string = snapshot.fetchedAt;

const COUNTRIES: Readonly<Record<string, RequirementEntry>> = snapshot.countries;

export function requirementCodes(): readonly string[] {
  return Object.keys(COUNTRIES);
}

export function requirementFor(iso2: string | null | undefined): RequirementEntry | null {
  if (!iso2) return null;
  return COUNTRIES[iso2.trim().toUpperCase()] ?? null;
}
