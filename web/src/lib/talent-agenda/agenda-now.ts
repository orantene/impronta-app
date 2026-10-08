/**
 * Optional QA clock. Prefer an injected `now` prop; never call Date.now inside derive.
 * Dev/QA may pin with `?agendaNow=2026-09-24T09:50:00`.
 */
import { utcToZonedHmm, utcToZonedYmd, zonedLocalToUtc } from "@/lib/scheduling/tz";

export function readAgendaNowFromSearch(search: string | null | undefined, fallback = new Date()): Date {
  if (!search) return fallback;
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const raw = params.get("agendaNow");
  if (!raw) return fallback;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

export function readAgendaNowClient(fallback = new Date()): Date {
  if (typeof window === "undefined") return fallback;
  return readAgendaNowFromSearch(window.location.search, fallback);
}

/**
 * The instant `now` as a wall-clock Date in the talent's timezone: a Date whose
 * local getters (getHours, getDate...) read the talent's wall time, so the
 * calendar grid's sameDay/minutesOf/localYmd math follows the talent timezone,
 * not the browser's or the server's. Falls back to `now` for a missing or
 * invalid zone.
 */
export function wallClockIn(now: Date, timeZone: string | null | undefined): Date {
  if (!timeZone) return now;
  const ymd = utcToZonedYmd(now, timeZone);
  const hm = utcToZonedHmm(now, timeZone);
  if (!ymd || !hm) return now;
  const [y, m, d] = ymd.split("-").map(Number);
  const [h, min] = hm.split(":").map(Number);
  return new Date(y, m - 1, d, h, min, now.getSeconds(), now.getMilliseconds());
}

/**
 * The same agenda items with startsAt/endsAt re-expressed as talent wall-clock
 * instants (same trick as `wallClockIn`), so the week/day grid's local-getter
 * math (day bucket, top offset) places blocks in the talent's timezone, not the
 * viewer's browser timezone. Use for GRID PLACEMENT only.
 */
export function itemsInTalentWallClock<T extends { startsAt: string; endsAt: string }>(
  items: readonly T[],
  timeZone: string | null | undefined,
): T[] {
  if (!timeZone) return [...items];
  const shift = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : wallClockIn(d, timeZone).toISOString();
  };
  return items.map((item) => ({ ...item, startsAt: shift(item.startsAt), endsAt: shift(item.endsAt) }));
}

/**
 * Inverse of `wallClockIn`: a Date whose LOCAL getters read the talent's wall
 * time (what the grid shows/produces) back to the real instant. Identity with
 * no/invalid timezone; a nonexistent DST-gap time returns the input unchanged.
 */
export function talentWallClockToInstant(localDate: Date, timeZone: string | null | undefined): Date {
  if (!timeZone) return localDate;
  const pad = (n: number) => String(n).padStart(2, "0");
  const ymd = `${localDate.getFullYear()}-${pad(localDate.getMonth() + 1)}-${pad(localDate.getDate())}`;
  const real = zonedLocalToUtc(ymd, localDate.getHours() * 60 + localDate.getMinutes(), timeZone);
  if (!real) return localDate;
  return new Date(real.getTime() + localDate.getSeconds() * 1000 + localDate.getMilliseconds());
}
