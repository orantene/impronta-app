/**
 * Payout countries — the ISO-2 countries we offer for Stripe Connect payouts,
 * with display labels + flags. Talents and workspaces receive payouts to their
 * OWN country/bank, so the connected account's `country` must match the payee
 * (it's immutable once the account is created).
 *
 * This is a curated, Americas-first subset of Stripe Connect-supported
 * recipient countries. Stripe is the ultimate source of truth — account
 * creation rejects an unsupported country, which we surface as a clean
 * "payouts not available in {country} yet" state rather than a broken form.
 */
export type PayoutCountry = { iso2: string; label: string; flag: string };

export const PAYOUT_COUNTRIES: readonly PayoutCountry[] = [
  { iso2: "MX", label: "Mexico", flag: "🇲🇽" },
  { iso2: "US", label: "United States", flag: "🇺🇸" },
  { iso2: "AR", label: "Argentina", flag: "🇦🇷" },
  { iso2: "BR", label: "Brazil", flag: "🇧🇷" },
  { iso2: "CL", label: "Chile", flag: "🇨🇱" },
  { iso2: "CO", label: "Colombia", flag: "🇨🇴" },
  { iso2: "PE", label: "Peru", flag: "🇵🇪" },
  { iso2: "UY", label: "Uruguay", flag: "🇺🇾" },
  { iso2: "CA", label: "Canada", flag: "🇨🇦" },
  { iso2: "ES", label: "Spain", flag: "🇪🇸" },
  { iso2: "PT", label: "Portugal", flag: "🇵🇹" },
  { iso2: "GB", label: "United Kingdom", flag: "🇬🇧" },
  { iso2: "FR", label: "France", flag: "🇫🇷" },
  { iso2: "DE", label: "Germany", flag: "🇩🇪" },
  { iso2: "IT", label: "Italy", flag: "🇮🇹" },
  { iso2: "NL", label: "Netherlands", flag: "🇳🇱" },
  { iso2: "AU", label: "Australia", flag: "🇦🇺" },
] as const;

const BY_ISO2 = new Map(PAYOUT_COUNTRIES.map((c) => [c.iso2, c]));

/** Normalize + validate an ISO-2 code against our offered set. */
export function normalizePayoutCountry(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const iso2 = raw.trim().toUpperCase();
  return BY_ISO2.has(iso2) ? iso2 : null;
}

export function isSupportedPayoutCountry(iso2: string | null | undefined): boolean {
  return normalizePayoutCountry(iso2) !== null;
}

/** Human label (with flag) for an ISO-2 code, or the raw code if unknown. */
export function payoutCountryLabel(iso2: string | null | undefined): string {
  if (!iso2) return "your country";
  const c = BY_ISO2.get(iso2.trim().toUpperCase());
  return c ? `${c.flag} ${c.label}` : iso2;
}
