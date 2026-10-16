/**
 * Local wall-clock helpers for promo time rules (design L3).
 *
 * Rules are compared as local "YYYY-MM-DDTHH:MM:SS" keys, which sort
 * lexicographically, so a "Tue 10-14" rule stays 10-14 local across DST.
 * Intl only, no date library.
 */

export type LocalParts = {
  date: string; // YYYY-MM-DD
  key: string; // YYYY-MM-DDTHH:MM:SS
  weekday: number; // 0 = Sunday
  minutes: number; // minutes since local midnight
  offsetMinutes: number; // local - UTC
};

const fmtCache = new Map<string, Intl.DateTimeFormat>();
const WEEKDAYS: Readonly<Record<string, number>> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function formatter(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    });
    fmtCache.set(tz, f);
  }
  return f;
}

export function localParts(ms: number, tz: string): LocalParts {
  const parts: Record<string, string> = {};
  for (const p of formatter(tz).formatToParts(new Date(ms))) parts[p.type] = p.value;
  const y = Number(parts.year);
  const mo = Number(parts.month);
  const d = Number(parts.day);
  const h = Number(parts.hour) % 24;
  const mi = Number(parts.minute);
  const s = Number(parts.second);
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const hh = String(h).padStart(2, "0");
  const wallMs = Date.UTC(y, mo - 1, d, h, mi, s);
  const flooredMs = Math.floor(ms / 1000) * 1000;
  return {
    date,
    key: `${date}T${hh}:${parts.minute}:${parts.second}`,
    weekday: WEEKDAYS[parts.weekday ?? ""] ?? 0,
    minutes: h * 60 + mi,
    offsetMinutes: Math.round((wallMs - flooredMs) / 60000),
  };
}

/**
 * True when this instant is the SECOND pass through a repeated local hour
 * (DST fall-back). L3: a repeated hour counts once, first occurrence.
 */
export function isRepeatedHourSecondPass(ms: number, tz: string): boolean {
  return localParts(ms - 3600_000, tz).offsetMinutes > localParts(ms, tz).offsetMinutes;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const HAS_OFFSET = /([zZ]|[+-]\d{2}:?\d{2})$/;

/** A rule bound as a local key. Date-only ends are inclusive to 23:59:59 local. */
export function boundKey(value: string, tz: string, edge: "start" | "end"): string {
  if (DATE_ONLY.test(value)) return `${value}T${edge === "start" ? "00:00:00" : "23:59:59"}`;
  if (HAS_OFFSET.test(value)) return localParts(Date.parse(value), tz).key;
  const [date, time = "00:00"] = value.split("T");
  const [h = "00", m = "00", s = "00"] = time.split(":");
  return `${date}T${h.padStart(2, "0")}:${m.padStart(2, "0")}:${s.slice(0, 2).padStart(2, "0")}`;
}

export function hhmmToMinutes(v: string): number {
  const [h = "0", m = "0"] = v.split(":");
  return Number(h) * 60 + Number(m);
}

/** Whole days from date a to date b ("YYYY-MM-DD"). */
export function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}
