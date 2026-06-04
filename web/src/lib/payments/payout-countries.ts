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

/**
 * Countries where talent can receive STABLECOIN (USDC) payouts via Stripe
 * Global Payouts from our US platform — verbatim from
 * docs.stripe.com/connect/stablecoin-payouts#supported-countries (2026-06).
 *
 * This is far wider than bank-payout Connect cross-border (US/UK/EEA/CA/CH
 * only), so it's how we reach LatAm + worldwide talent. Recipients link a
 * crypto wallet in their Express Dashboard and are paid in USDC (a transfer
 * created in USD auto-converts). Notable: includes MX/AR/CO/CL/PE/UY/PA;
 * EXCLUDES Brazil (BR).
 */
export const STABLECOIN_PAYOUT_COUNTRIES: ReadonlySet<string> = new Set([
  "AE", "AM", "AR", "AT", "AU", "AZ", "BE", "BG", "BH", "BJ", "CA", "CH",
  "CL", "CO", "CR", "CY", "CZ", "DK", "DO", "EC", "EE", "FI", "FR", "GH",
  "GR", "HR", "HU", "IE", "IL", "JM", "JO", "KE", "KR", "KW", "KZ", "LI",
  "LK", "LT", "LU", "LV", "MN", "MT", "MU", "MX", "MY", "NL", "NO", "NZ",
  "PA", "PE", "PH", "PL", "PT", "PY", "RO", "SA", "SE", "SG", "SI", "SK",
  "SV", "TH", "TN", "US", "UY", "UZ", "ZA",
]);

/** Can talent in this ISO-2 country be paid via stablecoin (USDC) Global
 *  Payouts? Independent of the bank-payout allow-list above. */
export function isStablecoinPayoutCountry(iso2: string | null | undefined): boolean {
  if (!iso2) return false;
  return STABLECOIN_PAYOUT_COUNTRIES.has(iso2.trim().toUpperCase());
}

/** Default local payout currency (ISO-4217, lowercase) for a payout country —
 *  prefills the Global Payouts bank-payout-method currency. Falls back to USD. */
export function defaultPayoutCurrency(iso2: string | null | undefined): string {
  const c = (iso2 ?? "").trim().toUpperCase();
  const map: Record<string, string> = {
    US: "usd", CA: "cad", MX: "mxn", AR: "ars", BR: "brl", CL: "clp", CO: "cop",
    PE: "pen", UY: "uyu", GB: "gbp", AU: "aud",
    ES: "eur", PT: "eur", FR: "eur", DE: "eur", IT: "eur", NL: "eur",
  };
  return map[c] ?? "usd";
}
