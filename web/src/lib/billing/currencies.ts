/**
 * currencies.ts — shared ISO-4217 currency list for the per-actor
 * `default_currency` picker (PR-E foundation, decision-log L49).
 *
 * Used in two places today:
 *   - Agency Workspace settings (admin) — `DefaultCurrencySettingsRow`
 *   - Talent self settings (platform) — `DefaultCurrencyCard`
 *
 * Designed for forward compatibility with the future Product Pricing
 * dashboard: the dashboard reads from this module and extends the option
 * list rather than forking. Keep one source of truth.
 *
 * v1 scope is intentionally small (6 currencies covering EU + UK + North
 * America + Mexico + LATAM-major). Adding a code requires:
 *   1. Append the ISO-4217 code below (uppercase, 3 letters).
 *   2. Add the matching label entry to CURRENCY_LABELS.
 *   3. No DB change — `default_currency TEXT NOT NULL DEFAULT 'EUR'` only
 *      enforces `length = 3`, so any 3-letter code stored is valid; this
 *      module is the UI gate.
 */

export const DEFAULT_CURRENCY_OPTIONS = [
  "EUR",
  "USD",
  "GBP",
  "MXN",
  "ARS",
  "BRL",
  // L50 extension — added for the Product Pricing dashboard so per-tier
  // pricing can target regional markets (PPP / LATAM strategy). Available
  // here so the per-actor `default_currency` picker can also pick any code
  // a tier price is denominated in; one source of truth.
  "COP",
  "CLP",
  "PEN",
  "CAD",
  "AUD",
] as const;

export type DefaultCurrencyCode = (typeof DEFAULT_CURRENCY_OPTIONS)[number];

/** Human-readable labels for the picker — symbol + ISO code + country/region. */
export const CURRENCY_LABELS: Record<DefaultCurrencyCode, string> = {
  EUR: "EUR · € · Euro",
  USD: "USD · $ · US Dollar",
  GBP: "GBP · £ · British Pound",
  MXN: "MXN · $ · Mexican Peso",
  ARS: "ARS · $ · Argentine Peso",
  BRL: "BRL · R$ · Brazilian Real",
  COP: "COP · $ · Colombian Peso",
  CLP: "CLP · $ · Chilean Peso",
  PEN: "PEN · S/ · Peruvian Sol",
  CAD: "CAD · $ · Canadian Dollar",
  AUD: "AUD · $ · Australian Dollar",
};

/**
 * UI fallback when a stored `default_currency` is null/unknown. USD-first:
 * the platform operates in USD (see `platform_settings.operating_currency`),
 * so the picker lands on USD rather than a legacy EUR. (The SQL columns still
 * carry a `DEFAULT 'EUR'`, but that only governs brand-new rows that never set
 * a value; this code-level fallback is what the UI resolves to.)
 */
export const DEFAULT_CURRENCY_FALLBACK: DefaultCurrencyCode = "USD";

/**
 * Validates and normalizes a candidate currency code against the v1
 * option list. Returns the upper-cased code on success, `null` on
 * unknown input. Used by server actions to bounce unknown values
 * before they reach the DB (the DB check only enforces length, not
 * membership).
 */
export function normalizeDefaultCurrency(
  candidate: unknown,
): DefaultCurrencyCode | null {
  if (typeof candidate !== "string") return null;
  const upper = candidate.trim().toUpperCase();
  return (DEFAULT_CURRENCY_OPTIONS as readonly string[]).includes(upper)
    ? (upper as DefaultCurrencyCode)
    : null;
}

/**
 * Resolves a stored currency string (which may be lowercase, padded, or
 * legacy / unknown) to a known option for the UI. Falls back to EUR so
 * the picker never lands in an undefined state.
 */
export function resolveDefaultCurrencyForUI(
  stored: unknown,
): DefaultCurrencyCode {
  return normalizeDefaultCurrency(stored) ?? DEFAULT_CURRENCY_FALLBACK;
}
