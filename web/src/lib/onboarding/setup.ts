/**
 * Onboarding 1B step 3, pure: "Set up the essentials". Helpers the screen and
 * the server action share (the data model itself is `essentials.ts`, 1C).
 */

import {
  MAX_ESSENTIAL_SERVICES,
  defaultWeeklyHours,
  hoursHaveAnyOpenDay,
  currencyForCountry,
  isMexico,
  type DayKey,
  type EssentialService,
  type Essentials,
  type HourRange,
  type WeeklyEssentialHours,
} from "./essentials";
import type { OnboardingChoice } from "./choice";
import { isValidIanaTimeZone } from "@/lib/scheduling/tz";
import { hasUnconfirmedPrice } from "./service-price-choice";

/** Monday first for people, Sunday = "0" for the data. */
export const DAY_ORDER: readonly DayKey[] = ["1", "2", "3", "4", "5", "6", "0"];

export const DAY_LABELS: Record<"en" | "es", Record<DayKey, string>> = {
  en: { "1": "Mon", "2": "Tue", "3": "Wed", "4": "Thu", "5": "Fri", "6": "Sat", "0": "Sun" },
  es: { "1": "Lun", "2": "Mar", "3": "Mié", "4": "Jue", "5": "Vie", "6": "Sáb", "0": "Dom" },
};

/** Zones offered when the person is not in Mexico. The list is short on purpose; the rest is "Other". */
export const TIMEZONE_OPTIONS: ReadonlyArray<{ id: string; label: string }> = [
  { id: "America/Mexico_City", label: "Ciudad de México (CT)" },
  { id: "America/Cancun", label: "Cancún (EST)" },
  { id: "America/Merida", label: "Mérida (Yucatán)" },
  { id: "America/Monterrey", label: "Monterrey" },
  { id: "America/Tijuana", label: "Tijuana" },
  { id: "America/Mazatlan", label: "Mazatlán" },
  { id: "America/New_York", label: "New York (ET)" },
  { id: "America/Chicago", label: "Chicago (CT)" },
  { id: "America/Denver", label: "Denver (MT)" },
  { id: "America/Los_Angeles", label: "Los Angeles (PT)" },
  { id: "America/Bogota", label: "Bogota" },
  { id: "America/Argentina/Buenos_Aires", label: "Buenos Aires" },
  { id: "Europe/Madrid", label: "Madrid" },
  { id: "Europe/London", label: "London" },
];

/** TUL-540 / onb1-01: Spanish names for the zones whose English label differs. */
const TIMEZONE_LABEL_ES: Readonly<Record<string, string>> = {
  "America/New_York": "Nueva York (ET)",
  "America/Los_Angeles": "Los Ángeles (PT)",
  "America/Bogota": "Bogotá",
  "Europe/London": "Londres",
};

/** Label of a zone in the setup picker, in the flow language. Unknown ids fall back to the given label. */
export function timezoneOptionLabel(id: string, locale: "en" | "es", fallback?: string): string {
  if (locale === "es" && TIMEZONE_LABEL_ES[id]) return TIMEZONE_LABEL_ES[id];
  return TIMEZONE_OPTIONS.find((z) => z.id === id)?.label ?? fallback ?? (id.split("/").pop() ?? id).replace(/_/g, " ");
}

/** The short list, plus the current zone when it is not on it (the browser's zone, a saved one). */
export function timezoneChoices(current: string | null | undefined): ReadonlyArray<{ id: string; label: string }> {
  const id = current?.trim();
  if (!id || TIMEZONE_OPTIONS.some((z) => z.id === id)) return TIMEZONE_OPTIONS;
  const label = (id.split("/").pop() ?? id).replace(/_/g, " ");
  return [{ id, label }, ...TIMEZONE_OPTIONS];
}

/** TUL-815: the zone the browser reports fills a missing one silently, in every country. A saved or city-derived zone wins. */
export function timezoneWithBrowserFallback(saved: string | null | undefined, browser: string | null | undefined): string | null {
  const own = saved?.trim();
  if (own) return own;
  const b = browser?.trim();
  return b && isValidIanaTimeZone(b) ? b : null;
}

/** Short readable name for a zone id (the list label when known). */
export function timezoneLabel(id: string): string {
  return TIMEZONE_OPTIONS.find((z) => z.id === id)?.label ?? (id.split("/").pop() ?? id).replace(/_/g, " ");
}

/**
 * TUL-815: how a zone reads on the review step: "Hora de Cancún" / "Cancún time".
 * The list label minus its "(EST)" style suffix, so the person reads a place, not an abbreviation.
 */
export function timezoneDisplayName(id: string, locale: "en" | "es"): string {
  const place = timezoneLabel(id).replace(/\s*\([^)]*\)\s*$/, "").trim();
  return locale === "es" ? `Hora de ${place}` : `${place} time`;
}

/** TUL-808: trades that go to the client never offer "at my studio". Beauty keeps all three. */
const MOBILE_TRADES: ReadonlySet<string> = new Set(["cleaning"]);

export function placeModesForTrade(tradeKey: string | null | undefined): ReadonlyArray<"studio" | "home" | "client"> {
  return tradeKey && MOBILE_TRADES.has(tradeKey) ? ["client"] : ["studio", "home", "client"];
}

/** A mobile trade opens with "I go to the client" already chosen; others open with no choice. */
export function defaultPlaceForTrade(tradeKey: string | null | undefined): { mode: "client"; area: null } | null {
  return tradeKey && MOBILE_TRADES.has(tradeKey) ? { mode: "client", area: null } : null;
}

/** Only outside Mexico: inside, the zone comes from the country and is never asked. */
export function needsTimezoneQuestion(country: string | null | undefined): boolean {
  return !isMexico(country);
}

/** "12:30" <-> minutes. */
export function minToTime(min: number): string {
  const h = Math.floor(min / 60).toString().padStart(2, "0");
  const m = (min % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}
export function timeToMin(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  return h <= 24 && mm < 60 && h * 60 + mm <= 1440 ? h * 60 + mm : null;
}

/** Copy one day's hours to every other open day ("apply to all"). */
export function copyDayToAll(week: WeeklyEssentialHours, from: DayKey): WeeklyEssentialHours {
  const src = week[from];
  const next = { ...week };
  for (const d of DAY_ORDER) if (week[d].length > 0 || d === from) next[d] = src.map((r) => ({ ...r }));
  return next;
}

export function toggleDay(week: WeeklyEssentialHours, day: DayKey): WeeklyEssentialHours {
  const open = week[day].length > 0;
  return { ...week, [day]: open ? [] : [{ startMin: 9 * 60, endMin: 19 * 60 }] };
}

export function setDayRange(week: WeeklyEssentialHours, day: DayKey, range: HourRange): WeeklyEssentialHours {
  if (range.endMin <= range.startMin) return week;
  return { ...week, [day]: [range] };
}

/** Price typed in major units ("350", "1,200.50") -> minor units; null when empty or not a number. */
export function parsePriceToCents(value: string): number | null {
  const cleaned = value.replace(/[^\d.,]/g, "").trim();
  if (!cleaned) return null;
  // The last separator is the decimal one only when 1-2 digits follow it.
  const m = /^(.*?)[.,](\d{1,2})$/.exec(cleaned);
  const whole = (m ? m[1] : cleaned).replace(/[.,]/g, "");
  const frac = m ? m[2].padEnd(2, "0") : "00";
  if (!/^\d+$/.test(whole)) return null;
  const cents = Number(whole) * 100 + Number(frac);
  return Number.isFinite(cents) && cents > 0 ? cents : null;
}

export function centsToInput(cents: number | null): string {
  if (cents === null || cents <= 0) return "";
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}

export function blankService(currency: string): EssentialService {
  return { name: "", durationMin: 60, priceCents: null, quote: false, currency, packKey: null };
}

/**
 * TUL-16 b: the currency the services step prices in. The person's own pick
 * wins; otherwise the country decides (Mexico: pesos). With no country yet, a
 * Spanish flow starts in pesos instead of a silent USD. MXN and USD only.
 */
export function setupCurrency(input: { chosen: string | null; country: string | null | undefined; locale: string }): string {
  if (input.chosen === "MXN" || input.chosen === "USD") return input.chosen;
  if (input.country && input.country.trim()) return currencyForCountry(input.country);
  return input.locale === "es" ? "MXN" : "USD";
}

/** One currency for every service line (a menu does not mix them). */
export function applyServiceCurrency(services: EssentialService[], currency: string): EssentialService[] {
  return services.map((s) => (s.currency === currency ? s : { ...s, currency }));
}

/** Drop empty rows; a row without a number is a quote; cap the list. */
export function cleanServices(services: EssentialService[]): EssentialService[] {
  return services
    .map((s) => ({ ...s, name: s.name.trim() }))
    .filter((s) => s.name.length > 0)
    .map((s) => ({ ...s, quote: s.quote || s.priceCents === null, priceCents: s.quote ? null : s.priceCents, quoteChosen: s.quoteChosen === true && (s.quote || s.priceCents === null) }))
    .slice(0, MAX_ESSENTIAL_SERVICES);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type SetupIssue = "services" | "confirmPrices" | "hours" | "place" | "timezone" | "providerEmail";

/** What blocks "Continue". Studio may add the first provider later; an invalid typed email still blocks. */
export function setupIssues(input: {
  choice: OnboardingChoice;
  essentials: Essentials;
  country: string | null;
  providerEmailDraft: string;
}): SetupIssue[] {
  const { choice, essentials: e } = input;
  const issues: SetupIssue[] = [];
  if (cleanServices(e.services).length === 0) issues.push("services");
  if (hasUnconfirmedPrice(e.services)) issues.push("confirmPrices");
  if (!hoursHaveAnyOpenDay(e.hours)) issues.push("hours");
  if (!e.place) issues.push("place");
  if (needsTimezoneQuestion(input.country) && !e.timezone) issues.push("timezone");
  const draft = input.providerEmailDraft.trim();
  if (choice === "studio" && draft && !EMAIL_RE.test(draft)) issues.push("providerEmail");
  return issues;
}

/** The record the server stores: confirmed, cleaned, and "manual" once the person edited the lines. */
export function finalizeSetup(e: Essentials, providerEmailDraft: string, edited: boolean): Essentials {
  const email = providerEmailDraft.trim().toLowerCase();
  return {
    ...e,
    services: cleanServices(e.services),
    firstProviderEmail: EMAIL_RE.test(email) ? email : null,
    confirmed: true,
    source: edited ? "manual" : e.source,
  };
}

/** Mon-Sat 9-19 when nothing is saved (the same default the build applies). */
export function defaultWeekFallback(): WeeklyEssentialHours {
  return defaultWeeklyHours();
}
