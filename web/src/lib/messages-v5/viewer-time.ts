/**
 * TUL-1909: message times are drawn in the VIEWER's time zone. A client component is also
 * rendered once on the server (UTC), so the zone is only known after mount: `useViewerTimeZone`
 * returns null on the server and on the first client pass (matching markup, no hydration
 * mismatch) and the browser's zone afterwards. The saved account zone, when one exists, can be
 * passed in as `preferred`. Pure helpers take the zone as an argument so tests pin a non-UTC zone.
 */
import { useSyncExternalStore } from "react";

import { formatClock } from "./clock";

const subscribe = () => () => {};

function browserZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/** The viewer's zone: `preferred` (a saved zone) when valid, else the browser's; null until mounted. */
export function useViewerTimeZone(preferred?: string | null): string | null {
  const zone = useSyncExternalStore(subscribe, browserZone, () => null);
  if (zone === null) return null;
  return validZone(preferred) ?? zone;
}

export function validZone(z: string | null | undefined): string | null {
  const v = typeof z === "string" ? z.trim() : "";
  if (!v) return null;
  try {
    new Intl.DateTimeFormat("en", { timeZone: v });
    return v;
  } catch {
    return null;
  }
}

/** yyyy-mm-dd of the instant in the zone: the "same day" test must use the viewer's calendar, not the runtime's. */
export function zonedDayKey(date: Date, timeZone?: string | null): string {
  const zone = validZone(timeZone) ?? undefined;
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: zone }).format(date);
}

/** "now / 5m / 3:30 PM / Mon / Oct 1 / Oct 1, 2025" for list rows, in the viewer's zone. */
export function formatRelativeShortZoned(iso: string, now: Date, locale: string | undefined, timeZone?: string | null): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "";
  const zone = validZone(timeZone) ?? undefined;
  const diffMs = now.getTime() - dt.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "now";
  if (diffMin < 60) return `${diffMin}m`;
  if (zonedDayKey(dt, zone) === zonedDayKey(now, zone)) return formatClock(iso, locale ?? "en", zone);
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffDays < 7) return new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: zone }).format(dt);
  const sameYear = zonedDayKey(dt, zone).slice(0, 4) === zonedDayKey(now, zone).slice(0, 4);
  return new Intl.DateTimeFormat(locale, sameYear ? { month: "short", day: "numeric", timeZone: zone } : { month: "short", day: "numeric", year: "numeric", timeZone: zone }).format(dt);
}

/** A message stamp: the clock when sent today, else "Oct 1 · clock", in the viewer's zone. */
export function formatStampZoned(iso: string, now: Date, locale: string | undefined, timeZone?: string | null): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso;
  const zone = validZone(timeZone) ?? undefined;
  const clock = formatClock(iso, locale ?? "en", zone);
  if (zonedDayKey(dt, zone) === zonedDayKey(now, zone)) return clock;
  return `${new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone: zone }).format(dt)} · ${clock}`;
}
