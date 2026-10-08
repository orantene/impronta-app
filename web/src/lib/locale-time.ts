/**
 * Locale-aware clock and relative-age formatting for dashboard surfaces.
 *
 * Pure and timezone-explicit: the caller passes the locale and (optionally) the
 * IANA time zone, so the server render and the client render of the same
 * instant produce the same string. Nothing here reads the process or browser
 * default locale; that default is what rendered "01:41 AM" on a Spanish UI.
 *
 * es => 24h "HH:mm" (es-MX style). Everything else => 12h "h:mm AM".
 */

export type TimeInput = Date | string | number;

export function isSpanishLocale(locale: string | null | undefined): boolean {
  return (locale ?? "").toLowerCase().startsWith("es");
}

function toDate(input: TimeInput): Date | null {
  const d = input instanceof Date ? input : new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Clock time: es "13:41" (24h), en "1:41 PM" (12h). Invalid input returns "". */
export function formatClockTime(
  input: TimeInput,
  locale: string | null | undefined,
  timeZone?: string,
): string {
  const d = toDate(input);
  if (!d) return "";
  const es = isSpanishLocale(locale);
  return new Intl.DateTimeFormat(es ? "es-MX" : "en-US", {
    hour: es ? "2-digit" : "numeric",
    minute: "2-digit",
    hourCycle: es ? "h23" : "h12",
    ...(timeZone ? { timeZone } : {}),
  }).format(d);
}

/**
 * Compact age for list rows, from an hours-ago number.
 * en: "now" / "5h" / "3d" (unchanged historical output).
 * es: "ahora" / "hace 20 min" / "hace 5 h" / "hace 3 d".
 */
export function formatAgeHours(hrs: number, locale?: string | null): string {
  if (!isSpanishLocale(locale)) {
    return hrs < 1 ? "now" : hrs < 24 ? `${Math.floor(hrs)}h` : `${Math.floor(hrs / 24)}d`;
  }
  if (hrs < 1) {
    const min = Math.floor(hrs * 60);
    return min < 1 ? "ahora" : `hace ${min} min`;
  }
  return hrs < 24 ? `hace ${Math.floor(hrs)} h` : `hace ${Math.floor(hrs / 24)} d`;
}

/** Day-group header text for an inbox bucket. */
export function dayGroupLabel(
  bucket: "today" | "yesterday" | "week" | "older",
  locale?: string | null,
): string {
  if (isSpanishLocale(locale)) {
    return { today: "Hoy", yesterday: "Ayer", week: "Esta semana", older: "Anteriores" }[bucket];
  }
  return { today: "Today", yesterday: "Yesterday", week: "This week", older: "Older" }[bucket];
}
