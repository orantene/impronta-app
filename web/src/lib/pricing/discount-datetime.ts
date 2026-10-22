/**
 * discount-datetime.ts (TUL-1860) · the one place a discount start/end moves between what an operator types
 * (a wall-clock time in their own zone) and what is stored (an absolute instant, ISO with an offset).
 *
 * Create and edit both go through `wallTimeToIso`, the server accepts only ISO WITH an offset and never
 * re-applies a time zone, and the list/drawer read back through `isoToWallTime` / `formatInstant` in the same
 * zone. Pure and client-safe: no IO, no "server-only".
 */

const WALL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** Offset of `timeZone` from UTC at instant `ms`, in ms (Intl-based, so DST is honoured). */
function zoneOffsetMs(ms: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(ms));
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second"));
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/**
 * "2026-10-22T01:08" typed in `timeZone` (default: the viewer's own zone) -> "2026-10-22T06:08:00.000Z".
 * Returns null for an empty or malformed value.
 */
export function wallTimeToIso(wall: string, timeZone?: string): string | null {
  const m = WALL.exec(wall.trim());
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  let ms: number;
  if (timeZone) {
    const guess = Date.UTC(y, mo - 1, d, h, mi);
    ms = guess - zoneOffsetMs(guess, timeZone);
    ms = guess - zoneOffsetMs(ms, timeZone); // second pass settles a DST edge
  } else {
    ms = new Date(y, mo - 1, d, h, mi).getTime(); // explicit components: no string-parse ambiguity
  }
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

/** Stored instant -> the "YYYY-MM-DDTHH:mm" a datetime-local input shows, in `timeZone` (default: viewer's). */
export function isoToWallTime(iso: string | null, timeZone?: string): string {
  if (!iso) return "";
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    ...(timeZone ? { timeZone } : {}),
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(ms));
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}`;
}

export function viewerTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** "22 Oct 2026, 01:08" in the viewer's zone (the zone itself is named once, in the list/drawer note). */
export function formatInstant(iso: string | null, locale: string, timeZone?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat(locale, {
    ...(timeZone ? { timeZone } : {}),
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}
