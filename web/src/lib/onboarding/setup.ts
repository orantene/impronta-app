/**
 * Onboarding 1B step 3, pure: "Set up the essentials". Helpers the screen and
 * the server action share (the data model itself is `essentials.ts`, 1C).
 */

import {
  MAX_ESSENTIAL_SERVICES,
  defaultWeeklyHours,
  hoursHaveAnyOpenDay,
  type DayKey,
  type EssentialService,
  type Essentials,
  type HourRange,
  type WeeklyEssentialHours,
} from "./essentials";
import type { OnboardingChoice } from "./choice";

/** Monday first for people, Sunday = "0" for the data. */
export const DAY_ORDER: readonly DayKey[] = ["1", "2", "3", "4", "5", "6", "0"];

export const DAY_LABELS: Record<"en" | "es", Record<DayKey, string>> = {
  en: { "1": "Mon", "2": "Tue", "3": "Wed", "4": "Thu", "5": "Fri", "6": "Sat", "0": "Sun" },
  es: { "1": "Lun", "2": "Mar", "3": "Mié", "4": "Jue", "5": "Vie", "6": "Sáb", "0": "Dom" },
};

/** Zones offered on setup. MX first so Cancún/CDMX are choosable; labels bilingual. */
export const TIMEZONE_OPTIONS: ReadonlyArray<{ id: string; label: { en: string; es: string } }> = [
  { id: "America/Cancun", label: { en: "Cancún", es: "Cancún" } },
  { id: "America/Mexico_City", label: { en: "Mexico City (CDMX)", es: "Ciudad de México (CDMX)" } },
  { id: "America/Tijuana", label: { en: "Tijuana", es: "Tijuana" } },
  { id: "America/Mazatlan", label: { en: "Mazatlán", es: "Mazatlán" } },
  { id: "America/Hermosillo", label: { en: "Hermosillo", es: "Hermosillo" } },
  { id: "America/Chihuahua", label: { en: "Chihuahua", es: "Chihuahua" } },
  { id: "America/Ciudad_Juarez", label: { en: "Ciudad Juárez", es: "Ciudad Juárez" } },
  { id: "America/New_York", label: { en: "New York (ET)", es: "Nueva York (ET)" } },
  { id: "America/Chicago", label: { en: "Chicago (CT)", es: "Chicago (CT)" } },
  { id: "America/Denver", label: { en: "Denver (MT)", es: "Denver (MT)" } },
  { id: "America/Los_Angeles", label: { en: "Los Angeles (PT)", es: "Los Ángeles (PT)" } },
  { id: "America/Bogota", label: { en: "Bogotá", es: "Bogotá" } },
  { id: "America/Argentina/Buenos_Aires", label: { en: "Buenos Aires", es: "Buenos Aires" } },
  { id: "Europe/Madrid", label: { en: "Madrid", es: "Madrid" } },
  { id: "Europe/London", label: { en: "London", es: "Londres" } },
];

/**
 * Always ask: Mexico has several zones (Cancún ≠ CDMX). Country/city still
 * preselects; the picker lets the person correct it.
 */
export function needsTimezoneQuestion(_country: string | null | undefined): boolean {
  return true;
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

/** Drop empty rows; a row without a number is a quote; cap the list. */
export function cleanServices(services: EssentialService[]): EssentialService[] {
  return services
    .map((s) => ({ ...s, name: s.name.trim() }))
    .filter((s) => s.name.length > 0)
    .map((s) => ({ ...s, quote: s.quote || s.priceCents === null, priceCents: s.quote ? null : s.priceCents }))
    .slice(0, MAX_ESSENTIAL_SERVICES);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type SetupIssue = "services" | "hours" | "place" | "timezone" | "providerEmail";

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
