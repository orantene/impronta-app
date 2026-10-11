/**
 * What the client reads on the pay page, as words (TUL-467).
 *
 * ONE money format ("$1,000 MXN", no decimals when whole) and times spoken the way a
 * person says them in the TALENT's zone: "9:24 pm", "Jue 10 oct · 5:00 pm". The page used
 * to print the raw instant through an English 24-hour formatter ("03:24").
 *
 * Pure: every function takes the instant it formats and the zone to read it in. The only
 * clock read is the optional `nowMs` default of {@link expiryParts}, so server and test
 * can pin it.
 */
import { formatDashboardMoneyCents } from "@/lib/money/dashboard-money-format";
import { usdEquivalentLabel, type UsdRates } from "@/lib/pricing/usd-equivalent";
import { isValidIanaTimeZone } from "@/lib/scheduling/tz";

export function payMoney(cents: number, currency: string | null | undefined, locale: string): string {
  return formatDashboardMoneyCents(cents, currency || null, locale);
}

/** "≈ US$55" under a non-USD amount; null when the currency is USD or no honest rate exists. */
export function payUsdLine(
  cents: number,
  currency: string | null | undefined,
  rates: UsdRates | null | undefined,
  locale: string,
): string | null {
  return usdEquivalentLabel(cents, currency, rates, locale);
}

function zone(timeZone: string): string {
  return isValidIanaTimeZone(timeZone) ? timeZone : "UTC";
}

function intlLocale(locale: string): string {
  return locale.toLowerCase().startsWith("es") ? "es-MX" : "en-US";
}

/** "9:24 pm" (12-hour, lowercase, no dots) in `timeZone`; null for a bad instant. */
export function clockWords(iso: string, timeZone: string, locale: string): string | null {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  const text = new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: zone(timeZone),
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(at);
  return text.replace(/\s*([ap])\.?\s?m\.?/i, (_m, h: string) => ` ${h.toLowerCase()}m`).trim();
}

/** "Jue 10 oct" / "Thu Oct 10" in `timeZone`; null for a bad instant. */
export function dayWords(iso: string, timeZone: string, locale: string): string | null {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  const parts = new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: zone(timeZone),
    weekday: "short",
    day: "numeric",
    month: "short",
  }).formatToParts(at);
  const pick = (type: string) => (parts.find((p) => p.type === type)?.value ?? "").replace(/\./g, "").trim();
  const weekday = pick("weekday");
  const out =
    intlLocale(locale) === "es-MX"
      ? `${weekday} ${pick("day")} ${pick("month")}`
      : `${weekday} ${pick("month")} ${pick("day")}`;
  return out.charAt(0).toUpperCase() + out.slice(1);
}

const ZONE_CITY_ES: Record<string, string> = {
  "America/Mexico_City": "Ciudad de México",
  "America/Cancun": "Cancún",
  "America/Merida": "Mérida",
  "America/Mazatlan": "Mazatlán",
  "America/Bogota": "Bogotá",
  "America/Sao_Paulo": "São Paulo",
};

/** The city a zone is named for: "Ciudad de México", "Cancún", "Los Angeles"; null for UTC or an unusable zone. */
export function zoneCity(timeZone: string, locale: string): string | null {
  if (!isValidIanaTimeZone(timeZone) || timeZone === "UTC") return null;
  if (intlLocale(locale) === "es-MX" && ZONE_CITY_ES[timeZone]) return ZONE_CITY_ES[timeZone];
  const last = timeZone.split("/").pop() ?? "";
  const city = last.replace(/_/g, " ").trim();
  return city || null;
}

/** "hora de Cancún" / "Cancún time" / "heure de Cancún": says which clock the time is on. */
export function zoneNote(timeZone: string, locale: string): string | null {
  const city = zoneCity(timeZone, locale);
  if (!city) return null;
  const lang = locale.toLowerCase();
  if (lang.startsWith("es")) return `hora de ${city}`;
  if (lang.startsWith("fr")) return `heure de ${city}`;
  return `${city} time`;
}

/** "Jue 10 oct · 5:00 pm · hora de Cancún": the appointment, with the clock it is read on. */
export function whenWords(iso: string, timeZone: string, locale: string): string | null {
  const day = dayWords(iso, timeZone, locale);
  const clock = clockWords(iso, timeZone, locale);
  if (!day || !clock) return null;
  const note = zoneNote(timeZone, locale);
  return `${day} · ${clock}${note ? ` · ${note}` : ""}`;
}

function ymdIn(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: zone(timeZone), year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

export type ExpiryParts = { time: string; day: string | null };

/**
 * The link's expiry as the parts of "Válido hasta las 9:24 pm": `day` is set only when the
 * expiry is not today in the talent's zone ("Válido hasta el Jue 10 oct, 9:24 pm").
 */
export function expiryParts(
  iso: string,
  timeZone: string,
  locale: string,
  nowMs: number = Date.now(),
): ExpiryParts | null {
  const time = clockWords(iso, timeZone, locale);
  if (!time) return null;
  const at = new Date(iso);
  const sameDay = ymdIn(at, timeZone) === ymdIn(new Date(nowMs), timeZone);
  return { time, day: sameDay ? null : dayWords(iso, timeZone, locale) };
}
