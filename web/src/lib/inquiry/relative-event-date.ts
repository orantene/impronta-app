/**
 * TUL-1415 / TUL-1587 · a day word in a guest's sentence ("el sábado", "tomorrow") resolved to a
 * calendar date, deterministically, in the WORKSPACE's time zone. A model asked to do this once
 * answered Thursday 29 Oct for "Saturday" on Thursday 22 Oct, so the model no longer decides
 * a day that a rule can decide. Pure: no I/O, the clock is a parameter.
 *
 * Only relative words are resolved here. A sentence that names an explicit date (ISO, 24/10, a month
 * name) is left to the model, which reads those correctly.
 */

const WEEKDAYS: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
  domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6,
};

const MONTHS = new Set([
  "january", "february", "march", "april", "june", "july", "august", "september", "october", "november", "december",
  "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "setiembre", "octubre", "noviembre", "diciembre",
]);

function fold(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** The calendar date (YYYY-MM-DD) of `now` in `timeZone`; falls back to UTC for an unknown zone. */
export function localDateIso(now: Date, timeZone: string | null | undefined): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timeZone || "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
    if (/^\d{4}-\d{2}-\d{2}$/.test(parts)) return parts;
  } catch {
    /* unknown zone: fall through to UTC */
  }
  return now.toISOString().slice(0, 10);
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function weekdayOf(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

const EXPLICIT_DATE_RE = /\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\s*[/.-]\s*\d{1,2}\b/;

/** The date a day word names, or null when there is none or the sentence names an explicit date. */
export function resolveRelativeEventDate(text: string, now: Date, timeZone: string | null | undefined): string | null {
  const folded = fold(text);
  if (EXPLICIT_DATE_RE.test(folded)) return null;
  const tokens = folded.match(/[a-z0-9]+/g) ?? [];
  if (tokens.some((t) => MONTHS.has(t))) return null;
  const today = localDateIso(now, timeZone);
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    const prev = tokens[i - 1];
    if (t === "today" || t === "hoy" || t === "tonight") return today;
    if (t === "tomorrow") return addDays(today, 1);
    if (t === "pasado" && tokens[i + 1] === "manana") return addDays(today, 2);
    // "por la mañana" / "esta mañana" is the morning, not tomorrow.
    if (t === "manana" && prev !== "la" && prev !== "esta" && prev !== "pasado") return addDays(today, 1);
    const wd = WEEKDAYS[t];
    if (wd !== undefined) {
      const ahead = (wd - weekdayOf(today) + 7) % 7;
      return addDays(today, ahead === 0 ? 7 : ahead);
    }
  }
  return null;
}

/** "Thursday 2026-10-22": the line the model reads as today. */
export function todayLine(now: Date, timeZone: string | null | undefined): string {
  const iso = localDateIso(now, timeZone);
  const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return `${names[weekdayOf(iso)]} ${iso}`;
}
