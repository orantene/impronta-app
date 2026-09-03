/**
 * IANA timezone helpers for the appointments slot generator.
 *
 * PURE. Slots are UTC instants. Wall-clock math happens only here, via Intl,
 * and is never re-derived from a stored string later.
 *
 * DST policy:
 *   - ambiguous local times (fall-back overlap) → first occurrence (earliest UTC).
 *     Not configurable: both instants are real, and the earlier one is the answer
 *     for every caller we have.
 *   - nonexistent local times (spring-forward gap) → THE CALLER CHOOSES, because
 *     the right answer genuinely differs by caller and a shared default would be
 *     silently wrong for one of them:
 *
 *       gap: "skip" (default)  return null. Correct for an appointment SLOT:
 *                              there is no such moment to offer, and the next
 *                              slot covers it. Every pre-existing caller.
 *       gap: "next"            return the instant the clock reaches. Correct for
 *                              a recurring CLASS: the studio opens and the
 *                              teacher turns up on the gap day. Returning null
 *                              there deletes one occurrence a year in every DST
 *                              zone — no session, no pool, no seat, and no error
 *                              raised anywhere, which is quieter than a wrong
 *                              time and therefore worse.
 *
 * This parameter exists because two resolvers with OPPOSITE gap policies briefly
 * shipped — this one and a duplicate in lib/sessions/recurrence.ts — which is the
 * two-guards-asserting-opposite-things shape. The fix is not to pick a winner and
 * silently change a caller's behaviour; it is one implementation with the choice
 * NAMED AT THE CALL SITE. Proposed by the Sessions & Classes Manager, whose
 * argument that null is the quieter failure is the reason the default did not
 * simply win.
 */

export type GapPolicy = "skip" | "next";

/**
 * HOW a wall clock resolved, not just what it resolved to.
 *
 * `zonedLocalToUtc` returns a bare Date, so a caller cannot tell an instant that
 * genuinely reads back as the requested clock from one that was SHIFTED out of a
 * spring-forward gap. That distinction is not cosmetic — under gap:"next" two
 * different wall clocks collapse onto ONE instant:
 *
 *   Europe/Madrid, 2027-03-28, gap:"next"
 *     02:30 requested -> 2027-03-28T01:30:00.000Z  (03:30 local)
 *     03:30 requested -> 2027-03-28T01:30:00.000Z  (03:30 local)  <- same instant
 *
 * A club with a 02:30 show and a 03:30 show gets two sessions at one instant on
 * gap night, each with its own capacity pool, each selling the same room. Nothing
 * refuses it while those pools are parentless. Found by the Reservations Manager
 * and reproduced by Sessions & Classes; the same collapse makes a booking page
 * offer one instant twice under two labels.
 *
 * A caller cannot defend against that if it cannot SEE the shift, so this reports
 * it. `shifted` is the only outcome that needs handling; the rest behave normally.
 */
export type WallClockResolution =
  | { kind: "exact"; instant: Date }
  /** Fall-back overlap: the clock reads this twice. The EARLIER instant is given. */
  | { kind: "ambiguous"; instant: Date }
  /** Spring-forward gap under gap:"next". The instant does NOT read back as asked. */
  | { kind: "shifted"; instant: Date }
  /** Spring-forward gap under gap:"skip", or unusable inputs. */
  | { kind: "nonexistent" };

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * A real calendar date, or null.
 *
 * The shape check is NOT enough. `Date.UTC(2027, 12, 40)` does not fail, it rolls
 * over into 2028-02-09 — so `weekdayUtc("2027-13-40")` returned 3, a confident
 * answer about a date that does not exist, and `addUtcDays` walked off the same
 * cliff. Callers already handle null (`if (weekday == null) continue`), so this
 * can only turn a wrong answer into a skip.
 *
 * Same family as the DST gap this module already refuses: a function should say
 * "there is no answer" rather than invent a plausible one. The round trip also
 * rejects dates that do not exist, like 31 February.
 */
function parseYmd(ymd: string): { y: number; m: number; d: number } | null {
  const match = YMD_RE.exec(ymd);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const at = new Date(Date.UTC(y, m - 1, d));
  if (at.getUTCFullYear() !== y || at.getUTCMonth() !== m - 1 || at.getUTCDate() !== d) return null;
  return { y, m, d };
}

export function isValidIanaTimeZone(timeZone: string): boolean {
  if (typeof timeZone !== "string" || timeZone.trim().length === 0) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function formatInZone(
  instant: Date,
  timeZone: string,
): { ymd: string; hour: number; minute: number } | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).formatToParts(instant);
    const get = (type: Intl.DateTimeFormatPartTypes): string =>
      parts.find((p) => p.type === type)?.value ?? "";
    const ymd = `${get("year")}-${get("month")}-${get("day")}`;
    const hour = Number(get("hour"));
    const minute = Number(get("minute"));
    if (!YMD_RE.test(ymd) || !Number.isFinite(hour) || !Number.isFinite(minute)) {
      return null;
    }
    return { ymd, hour, minute };
  } catch {
    return null;
  }
}

/**
 * Convert a local civil time in `timeZone` to a UTC instant.
 *
 * `ymd` is YYYY-MM-DD. `minutesOfDay` is minutes since local midnight
 * (0..1439). Returns null when the local time does not exist (DST gap) or
 * the zone/inputs are unusable.
 */
export function resolveWallClock(
  ymd: string,
  minutesOfDay: number,
  timeZone: string,
  options: { gap?: GapPolicy } = {},
): WallClockResolution {
  if (!isValidIanaTimeZone(timeZone)) return { kind: "nonexistent" };
  const parsed = parseYmd(ymd);
  if (!parsed) return { kind: "nonexistent" };
  if (!Number.isInteger(minutesOfDay) || minutesOfDay < 0 || minutesOfDay > 1439) {
    return { kind: "nonexistent" };
  }

  const year = parsed.y;
  const month = parsed.m;
  const day = parsed.d;
  const hour = Math.floor(minutesOfDay / 60);
  const minute = minutesOfDay % 60;

  const utcAsIf = Date.UTC(year, month - 1, day, hour, minute, 0);

  const offsetAt = (ms: number): number => {
    const formatted = formatInZone(new Date(ms), timeZone);
    if (!formatted) return 0;
    const [y, mo, d] = formatted.ymd.split("-").map(Number);
    const localAsUtc = Date.UTC(y!, mo! - 1, d!, formatted.hour, formatted.minute, 0);
    return localAsUtc - ms;
  };

  const matches = (ms: number): boolean => {
    const formatted = formatInZone(new Date(ms), timeZone);
    return Boolean(
      formatted &&
        formatted.ymd === ymd &&
        formatted.hour === hour &&
        formatted.minute === minute,
    );
  };

  let ms = utcAsIf - offsetAt(utcAsIf);
  ms = utcAsIf - offsetAt(ms);

  if (!matches(ms)) {
    const nearby = [ms - 3_600_000, ms + 3_600_000, ms - 7_200_000, ms + 7_200_000];
    const hit = nearby.find((candidate) => matches(candidate));
    if (hit == null) {
      // Nothing reads back as the requested wall clock: it is inside a gap.
      if ((options.gap ?? "skip") === "skip") return { kind: "nonexistent" };
      // "next": the instant the clock actually reaches. Take the candidate built
      // from the POST-transition offset — the later of the two — which shifts the
      // request forward by exactly the width of the gap.
      const after = utcAsIf - offsetAt(utcAsIf + 86_400_000);
      const before = utcAsIf - offsetAt(utcAsIf - 86_400_000);
      return { kind: "shifted", instant: new Date(Math.max(after, before)) };
    }
    ms = hit;
  }

  // Ambiguous wall times: the clock reads this twice, so BOTH instants match.
  // Test both directions — the two-pass above can land on either one, and the
  // original code only noticed when it happened to land on the later, so a
  // genuinely ambiguous time was reported as exact half the time.
  const earlier = ms - 3_600_000;
  const later = ms + 3_600_000;
  if (matches(earlier)) return { kind: "ambiguous", instant: new Date(earlier) };
  if (matches(later)) return { kind: "ambiguous", instant: new Date(ms) };

  return { kind: "exact", instant: new Date(ms) };
}

/**
 * The instant for a local civil time, or null when it does not exist.
 *
 * The convenient form. Use `resolveWallClock` when you need to know WHETHER the
 * answer was shifted out of a gap — a shifted instant can equal another wall
 * clock's instant, and only the caller knows whether that matters.
 */
export function zonedLocalToUtc(
  ymd: string,
  minutesOfDay: number,
  timeZone: string,
  options: { gap?: GapPolicy } = {},
): Date | null {
  const r = resolveWallClock(ymd, minutesOfDay, timeZone, options);
  return r.kind === "nonexistent" ? null : r.instant;
}

/** Local YYYY-MM-DD for an instant in `timeZone`, or null. */
export function utcToZonedYmd(instant: Date, timeZone: string): string | null {
  if (!isValidIanaTimeZone(timeZone) || Number.isNaN(instant.getTime())) return null;
  return formatInZone(instant, timeZone)?.ymd ?? null;
}

/** Local HH:MM for an instant in `timeZone`, or null. */
export function utcToZonedHmm(instant: Date, timeZone: string): string | null {
  if (!isValidIanaTimeZone(timeZone) || Number.isNaN(instant.getTime())) return null;
  const z = formatInZone(instant, timeZone);
  if (!z) return null;
  return minutesToHmm(z.hour * 60 + z.minute);
}

/** Add `days` civil days to a YYYY-MM-DD string (UTC calendar, not zone). */
export function addUtcDays(ymd: string, days: number): string | null {
  const parsed = parseYmd(ymd);
  if (!parsed || !Number.isInteger(days)) return null;
  const dt = new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d + days));
  if (Number.isNaN(dt.getTime())) return null;
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

/** JS weekday 0=Sunday for a civil date (independent of timezone). */
export function weekdayUtc(ymd: string): number | null {
  const parsed = parseYmd(ymd);
  if (!parsed) return null;
  return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d)).getUTCDay();
}

export function minutesToHmm(minutesOfDay: number): string {
  const h = Math.floor(minutesOfDay / 60);
  const m = minutesOfDay % 60;
  return `${pad2(h)}:${pad2(m)}`;
}
