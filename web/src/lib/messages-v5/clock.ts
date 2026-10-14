/**
 * One clock for Messages (TUL-379). English keeps its own convention; every
 * other dashboard language (es, es-MX, fr) reads a 24 hour clock. `es-MX` and
 * `es-419` default to "4:30 p.m." in Intl, which is not what a Spanish
 * dashboard shows elsewhere. `hourCycle: "h23"` (not `hour12: false`) so
 * midnight prints 00:05, not 24:05.
 */
export function usesTwentyFourHour(locale: string): boolean {
  return !/^en(?:[-_]|$)/i.test((locale || "en").trim());
}

export function clockOptions(locale: string, timeZone?: string | null): Intl.DateTimeFormatOptions {
  const zone = timeZone ? { timeZone } : {};
  return usesTwentyFourHour(locale)
    ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23", ...zone }
    : { hour: "numeric", minute: "2-digit", ...zone };
}

export function formatClock(iso: string, locale = "en", timeZone?: string | null): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(locale, clockOptions(locale, timeZone)).format(d);
  } catch {
    return new Intl.DateTimeFormat(locale, clockOptions(locale)).format(d);
  }
}
