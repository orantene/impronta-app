/**
 * Wall-clock helpers for the event and class fixtures (pure). A series is defined on a LOCAL wall clock in an IANA zone; each
 * occurrence is resolved to its own UTC instant, so a series that crosses a DST change (America/New_York, 2026-11-01) keeps its
 * local time and moves its UTC time, exactly like the app's resolver.
 */

function offsetMs(utcMs, tz) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(new Date(utcMs))
      .map((p) => [p.type, p.value]),
  );
  return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second) - utcMs;
}

/** "2026-11-07" + "21:00" in America/New_York -> ISO instant. */
export function zonedWallToUtc(ymd, hm, tz) {
  const [y, m, d] = ymd.split("-").map(Number);
  const [hh, mm] = hm.split(":").map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  let guess = wall;
  for (let i = 0; i < 4; i += 1) {
    const next = wall - offsetMs(guess, tz);
    if (next === guess) break;
    guess = next;
  }
  return new Date(guess).toISOString();
}

export const addDays = (ymd, n) => new Date(Date.UTC(...ymd.split("-").map((v, i) => (i === 1 ? +v - 1 : +v))) + n * 86400000).toISOString().slice(0, 10);
export const ymdOf = (d) => d.toISOString().slice(0, 10);
/** ISO weekday (1 = Monday .. 7 = Sunday) of a YYYY-MM-DD date. */
export const isoDow = (ymd) => ((new Date(`${ymd}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
/** First date on or after `from` (YYYY-MM-DD) that falls on this ISO weekday. */
export const nextDow = (from, dow) => addDays(from, (dow - isoDow(from) + 7) % 7);
/** `n` weekly dates starting at `first`. */
export const weekly = (first, n) => Array.from({ length: n }, (_, i) => addDays(first, 7 * i));
