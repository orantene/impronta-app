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

const ISO_DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;

/**
 * Short calendar date: es "8 oct", en "Oct 8".
 *
 * Accepts a Date, an epoch number, or an ISO date ("2026-10-08") / ISO
 * timestamp. A date-only ISO string is a calendar day, so it is formatted in
 * UTC and never shifts with the zone. A timestamp is formatted in `timeZone`
 * (default UTC). Any other string (free text such as "May 14") is returned
 * untouched, so stored and mock data is never rewritten.
 */
export function formatShortDate(
  input: TimeInput,
  locale: string | null | undefined,
  timeZone: string = "UTC",
): string {
  let d: Date | null;
  let zone = timeZone;
  if (typeof input === "string") {
    const raw = input.trim();
    if (ISO_DATE_ONLY.test(raw)) {
      zone = "UTC";
      d = toDate(raw);
    } else if (ISO_TIMESTAMP.test(raw)) {
      d = toDate(raw);
    } else {
      return input;
    }
  } else {
    d = toDate(input);
  }
  if (!d) return typeof input === "string" ? input : "";
  const es = isSpanishLocale(locale);
  const out = new Intl.DateTimeFormat(es ? "es-MX" : "en-US", {
    day: "numeric",
    month: "short",
    timeZone: zone,
  }).format(d);
  return es ? out.replace(/\./g, "").replace(/\s+/g, " ").trim() : out;
}
