/**
 * Locale display format for the Working hours editor (QA DS-39).
 *
 * The browser's own <input type="time"> / <input type="date"> follow the
 * OPERATING SYSTEM locale, so a Spanish dashboard on an English machine showed
 * "10:00 AM" and "mm/dd/yyyy". The rule here follows the DASHBOARD locale:
 *
 *   es -> 24h times ("10:00 – 18:00"), dates dd/mm/aaaa
 *   en -> 12h times ("10:00 AM – 6:00 PM"), dates mm/dd/yyyy
 *
 * Stored values are untouched: times stay "HH:MM" strings and minutes since
 * midnight, dates stay ISO "YYYY-MM-DD". This module only formats and parses.
 * Pure, no React.
 */

export function isSpanishHoursLocale(locale: string): boolean {
  return locale.toLowerCase().startsWith("es");
}

/** True when the dashboard locale reads clock times on a 24 hour clock. */
export function usesTwentyFourHour(locale: string): boolean {
  return isSpanishHoursLocale(locale);
}

/** "HH:MM" (24h) -> display string for the locale. Bad input is returned as is. */
export function formatHoursTime(hhmm: string, locale: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return hhmm;
  const h = Number(m[1]);
  const min = m[2]!;
  if (usesTwentyFourHour(locale)) return `${String(h).padStart(2, "0")}:${min}`;
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${min} ${suffix}`;
}

export function formatHoursRange(startHhmm: string, endHhmm: string, locale: string): string {
  return `${formatHoursTime(startHhmm, locale)} – ${formatHoursTime(endHhmm, locale)}`;
}

/** ISO "YYYY-MM-DD" -> "dd/mm/yyyy" (es) or "mm/dd/yyyy" (en). Bad input is returned as is. */
export function formatHoursDate(iso: string, locale: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return isSpanishHoursLocale(locale) ? `${m[3]}/${m[2]}/${m[1]}` : `${m[2]}/${m[3]}/${m[1]}`;
}

export function hoursDatePlaceholder(locale: string): string {
  return isSpanishHoursLocale(locale) ? "dd/mm/aaaa" : "mm/dd/yyyy";
}

/**
 * Typed date -> ISO, or null when it is not a real calendar date. Accepts "/",
 * "-" or "." between parts and a four digit year.
 */
export function parseHoursDate(text: string, locale: string): string | null {
  const m = /^\s*(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})\s*$/.exec(text);
  if (!m) return null;
  const es = isSpanishHoursLocale(locale);
  const day = Number(es ? m[1] : m[2]);
  const month = Number(es ? m[2] : m[1]);
  const year = Number(m[3]);
  if (month < 1 || month > 12 || day < 1) return null;
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Minute choices for the 24h picker: every 5 minutes, plus a stored odd minute. */
export function minuteChoices(current: number | null): number[] {
  const out = new Set<number>();
  for (let m = 0; m < 60; m += 5) out.add(m);
  if (current != null && current >= 0 && current < 60) out.add(current);
  return [...out].sort((a, b) => a - b);
}
