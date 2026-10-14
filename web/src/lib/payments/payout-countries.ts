/**
 * Payout countries (TUL-1052). The COUNTRY SET and each country's possible
 * service agreement come from Stripe's published requirement data
 * (stripe-connect-requirements.snapshot.json), never from a hand-typed array.
 * The small override table below adds only what Stripe's data cannot say:
 * our routing, the payout currency and an evidence note.
 *
 * Which countries are LIVE (selectable and creatable) is one config list,
 * NEXT_PUBLIC_PAYOUT_COUNTRIES_LIVE (comma ISO-2, default US,MX,CA,UY). A
 * country not on the list shows "coming soon" and is refused server side.
 * Existing connected accounts keep resolving through the *Known* helpers.
 */
import { requirementCodes, requirementFor } from "./stripe-connect-requirements";

export type PayoutLocale = "en" | "es";
export type PayoutCountry = { iso2: string; label: string; flag: string };
export type PayoutRoute = "c1_us_platform" | "c1_mx_platform" | "c2_recipient_us" | "unavailable";

export const DEFAULT_LIVE_PAYOUT_COUNTRIES = "US,MX,CA,UY";

let liveOverride: readonly string[] | null = null;
let usdcOverride: boolean | null = null;

/** Tests set the live list with this; production reads the env var. */
export function setLivePayoutCountriesOverride(list: readonly string[] | null): void {
  liveOverride = list;
}
/** Tests flip the USDC switch with this; production reads the env var. */
export function setUsdcPayoutsOverride(on: boolean | null): void {
  usdcOverride = on;
}

/** The one reader of the live list (NEXT_PUBLIC so client and server agree). */
export function livePayoutCountries(): ReadonlySet<string> {
  const raw = liveOverride
    ? liveOverride.join(",")
    : (process.env.NEXT_PUBLIC_PAYOUT_COUNTRIES_LIVE ?? "").trim() || DEFAULT_LIVE_PAYOUT_COUNTRIES;
  return new Set(raw.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean));
}

/** USDC payouts switch (default OFF; Connect stablecoin payouts are a private preview). */
export function usdcPayoutsEnabled(): boolean {
  if (usdcOverride !== null) return usdcOverride;
  return process.env.NEXT_PUBLIC_USDC_PAYOUTS === "true";
}

type Override = {
  route?: PayoutRoute;
  currency?: string;
  note?: string;
  /** MX only: today's behaviour on the US platform is the cross-border recipient agreement. */
  recipientOnUsPlatform?: true;
};

const FALLBACK_CURRENCY = "usd";

export const PAYOUT_COUNTRY_OVERRIDES: Readonly<Record<string, Override>> = {
  US: { route: "c1_us_platform", note: "home market, US platform" },
  CA: { route: "c1_us_platform", currency: "cad", note: "test mode 2026-10-14: full account on the US platform, transfers work end to end" },
  // MX stays on the Mexico platform (domestic MXN) exactly as today. The Payment
  // Manager reports MX can also be a FULL account on the US platform, but
  // US-platform transfers to MX/UY full accounts are refused in test mode.
  MX: { route: "c1_mx_platform", currency: "mxn", recipientOnUsPlatform: true, note: "paid on the separate MX platform; US-platform transfers to MX full accounts are refused in test mode" },
  UY: { route: "c1_us_platform", currency: "uyu", note: "PM decision: live. Test mode 2026-10-14: the US platform can create UY full accounts but refuses transfers to them (\"Funds can't be sent to accounts located in UY when the account is under the full service agreement\")" },
  BR: { route: "unavailable", currency: "brl", note: "Stripe lists BR as standard dashboard only and refuses it for US platforms" },
  AR: { currency: "ars", note: "test mode: card_payments refused, recipient accounts refused; pending Stripe" },
  CL: { currency: "clp", note: "test mode: card_payments refused; pending Stripe" },
  CO: { currency: "cop", note: "test mode: card_payments refused; pending Stripe" },
  PE: { currency: "pen", note: "test mode: card_payments refused; pending Stripe" },
  GB: { currency: "gbp" },
  AU: { currency: "aud" },
  ES: { currency: "eur" },
  PT: { currency: "eur" },
  FR: { currency: "eur" },
  DE: { currency: "eur" },
  IT: { currency: "eur" },
  NL: { currency: "eur" },
};

/** Rows shown (as live or coming soon) in the picker: the Americas recipient
 *  set, US/MX/CA, the BR placeholder and the 8 countries the old picker had. */
export const PICKER_PREVIEW_COUNTRIES: readonly string[] = [
  "US", "MX", "CA", "BR",
  "AR", "CL", "CO", "PE", "EC", "UY", "PY", "BO", "GY", "CR", "PA", "GT", "SV", "DO", "JM", "TT", "BS", "AG", "LC",
  "ES", "PT", "GB", "FR", "DE", "IT", "NL", "AU",
];

const CODES: readonly string[] = requirementCodes();

function norm(raw: string | null | undefined): string {
  return (raw ?? "").trim().toUpperCase();
}

/** Routing for a country: the override wins, else derived from Stripe's data. */
export function payoutRoute(raw: string | null | undefined): PayoutRoute {
  const iso2 = norm(raw);
  const req = requirementFor(iso2);
  if (!req) return "unavailable";
  const forced = PAYOUT_COUNTRY_OVERRIDES[iso2]?.route;
  if (forced) return forced;
  if (!req.accountTypes.includes("express")) return "unavailable";
  if (req.tosTypes.includes("full")) return "c1_us_platform";
  if (req.tosTypes.includes("recipient")) return "c2_recipient_us";
  return "unavailable";
}

export function payoutCountryNote(raw: string | null | undefined): string | null {
  return PAYOUT_COUNTRY_OVERRIDES[norm(raw)]?.note ?? null;
}

/** Is this a country Stripe's data lists at all (live or not)? Display/lookup only. */
export function isKnownPayoutCountry(raw: string | null | undefined): boolean {
  return requirementFor(raw) !== null;
}

export function normalizeKnownPayoutCountry(raw: string | null | undefined): string | null {
  return isKnownPayoutCountry(raw) ? norm(raw) : null;
}

export type PayoutCountryState = "selectable" | "coming_soon" | "unavailable" | "unknown";

/** selectable: live and routable. coming_soon: not on the live list.
 *  unavailable: listed live but Stripe cannot route it (BR). */
export function payoutCountryState(raw: string | null | undefined): PayoutCountryState {
  const iso2 = normalizeKnownPayoutCountry(raw);
  if (!iso2) return "unknown";
  if (!livePayoutCountries().has(iso2)) return "coming_soon";
  return payoutRoute(iso2) === "unavailable" ? "unavailable" : "selectable";
}

/** Normalize against what can be selected/created NOW. Use for creation. */
export function normalizePayoutCountry(raw: string | null | undefined): string | null {
  return payoutCountryState(raw) === "selectable" ? norm(raw) : null;
}

export function isSupportedPayoutCountry(iso2: string | null | undefined): boolean {
  return normalizePayoutCountry(iso2) !== null;
}

function regionName(iso2: string, locale: PayoutLocale): string {
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(iso2) ?? iso2;
  } catch {
    return iso2;
  }
}

function flagOf(iso2: string): string {
  return [...iso2].map((ch) => String.fromCodePoint(0x1f1e6 + ch.charCodeAt(0) - 65)).join("");
}

function toCountry(iso2: string, locale: PayoutLocale): PayoutCountry {
  return { iso2, label: regionName(iso2, locale), flag: flagOf(iso2) };
}

/** Every country in Stripe's data (English labels). Not what is selectable. */
export const PAYOUT_COUNTRIES: readonly PayoutCountry[] = CODES.map((c) => toCountry(c, "en"));

const FIRST = ["MX", "US"];

/** Picker rows for a locale. Selectable first (MX, US, then A-Z); then the
 *  coming-soon rows A-Z. */
export function payoutPickerRows(
  locale: PayoutLocale = "en",
): { selectable: readonly PayoutCountry[]; comingSoon: readonly PayoutCountry[] } {
  const byLabel = (a: PayoutCountry, b: PayoutCountry) => a.label.localeCompare(b.label, locale);
  const rows = [...new Set([...PICKER_PREVIEW_COUNTRIES, ...livePayoutCountries()])].filter((c) => isKnownPayoutCountry(c));
  const sel = rows.filter((c) => payoutCountryState(c) === "selectable");
  const soon = rows.filter((c) => payoutCountryState(c) !== "selectable");
  const ordered = [
    ...FIRST.filter((c) => sel.includes(c)).map((c) => toCountry(c, locale)),
    ...sel.filter((c) => !FIRST.includes(c)).map((c) => toCountry(c, locale)).sort(byLabel),
  ];
  return { selectable: ordered, comingSoon: soon.map((c) => toCountry(c, locale)).sort(byLabel) };
}

const COPY = {
  comingSoon: { en: "Coming soon, pending Stripe approval", es: "Próximamente, pendiente de aprobación de Stripe" },
  notifyMe: { en: "Notify me when it's available", es: "Avisarme cuando esté disponible" },
  onWaitlist: { en: "You're on the waitlist", es: "Estás en la lista de espera" },
} as const;

export function payoutComingSoonLabel(locale: PayoutLocale = "en"): string {
  return COPY.comingSoon[locale];
}
export function payoutNotifyMeLabel(locale: PayoutLocale = "en"): string {
  return COPY.notifyMe[locale];
}
export function payoutOnWaitlistLabel(locale: PayoutLocale = "en"): string {
  return COPY.onWaitlist[locale];
}

/** ES/EN refusal text for a known country that is not live yet. */
export function payoutCountryComingSoonText(iso2: string, locale: PayoutLocale = "en"): string {
  const name = regionName(norm(iso2), locale);
  return locale === "es" ? `Los pagos en ${name} llegan pronto` : `Payouts in ${name} are coming soon`;
}

/** Waitlist keys: any country in Stripe's data, or the USDC option. */
export function isWaitlistKey(raw: string | null | undefined): boolean {
  return norm(raw) === "USDC" || isKnownPayoutCountry(raw);
}

/** Human label (with flag) for an ISO-2 code, or the raw code if unknown. */
export function payoutCountryLabel(
  iso2: string | null | undefined,
  locale: PayoutLocale = "en",
): string {
  if (!iso2) return locale === "es" ? "tu país" : "your country";
  const code = norm(iso2);
  return isKnownPayoutCountry(code) ? `${flagOf(code)} ${regionName(code, locale)}` : iso2;
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


function routed(pred: (route: PayoutRoute) => boolean): ReadonlySet<string> {
  return new Set(CODES.filter((c) => pred(payoutRoute(c))));
}

/** Countries with a full (card-capable) account route. */
export const CONNECT_FULL_SERVICE_COUNTRIES: ReadonlySet<string> = routed((r) => r === "c1_us_platform" || r === "c1_mx_platform");

/** Countries paid through a receive-only (recipient agreement) account. */
export const CONNECT_RECIPIENT_ONLY_COUNTRIES: ReadonlySet<string> = routed((r) => r === "c2_recipient_us");

/** Every country Stripe Connect can route for us (ignores the live list). */
export const CONNECT_PAYOUT_COUNTRIES: ReadonlySet<string> = new Set([
  ...CONNECT_FULL_SERVICE_COUNTRIES,
  ...CONNECT_RECIPIENT_ONLY_COUNTRIES,
]);

/** Can Stripe Connect route this country at all? (not a live check) */
export function isConnectPayoutCountry(iso2: string | null | undefined): boolean {
  return CONNECT_PAYOUT_COUNTRIES.has(norm(iso2));
}

/** Does account creation on the US platform need the RECIPIENT service
 *  agreement? Stripe hard-errors without it for receive-only countries, so
 *  this drives the accounts.create payload. MX keeps today's behaviour. */
export function requiresRecipientAgreement(iso2: string | null | undefined): boolean {
  const c = norm(iso2);
  return CONNECT_RECIPIENT_ONLY_COUNTRIES.has(c) || PAYOUT_COUNTRY_OVERRIDES[c]?.recipientOnUsPlatform === true;
}

/** Default local payout currency (ISO-4217, lowercase); falls back to USD. */
export function defaultPayoutCurrency(iso2: string | null | undefined): string {
  return PAYOUT_COUNTRY_OVERRIDES[norm(iso2)]?.currency ?? FALLBACK_CURRENCY;
}
