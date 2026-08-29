/**
 * IANA timezone helpers for the appointments slot generator.
 *
 * PURE. Slots are UTC instants. Wall-clock math happens only here, via Intl,
 * and is never re-derived from a stored string later.
 *
 * DST policy (locked in the appointments plan):
 *   - nonexistent local times (spring-forward gap) → skip (return null)
 *   - ambiguous local times (fall-back overlap) → first occurrence (earliest UTC)
 */

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

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
export function zonedLocalToUtc(
  ymd: string,
  minutesOfDay: number,
  timeZone: string,
): Date | null {
  if (!isValidIanaTimeZone(timeZone)) return null;
  const match = YMD_RE.exec(ymd);
  if (!match) return null;
  if (!Number.isInteger(minutesOfDay) || minutesOfDay < 0 || minutesOfDay > 1439) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
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
    if (hit == null) return null;
    ms = hit;
  }

  // Ambiguous wall times: keep the earliest UTC instant (first occurrence).
  if (matches(ms - 3_600_000)) ms -= 3_600_000;

  return new Date(ms);
}

/** Local YYYY-MM-DD for an instant in `timeZone`, or null. */
export function utcToZonedYmd(instant: Date, timeZone: string): string | null {
  if (!isValidIanaTimeZone(timeZone) || Number.isNaN(instant.getTime())) return null;
  return formatInZone(instant, timeZone)?.ymd ?? null;
}

/** Add `days` civil days to a YYYY-MM-DD string (UTC calendar, not zone). */
export function addUtcDays(ymd: string, days: number): string | null {
  const match = YMD_RE.exec(ymd);
  if (!match || !Number.isInteger(days)) return null;
  const dt = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  if (Number.isNaN(dt.getTime())) return null;
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

/** JS weekday 0=Sunday for a civil date (independent of timezone). */
export function weekdayUtc(ymd: string): number | null {
  const match = YMD_RE.exec(ymd);
  if (!match) return null;
  return new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  ).getUTCDay();
}

export function minutesToHmm(minutesOfDay: number): string {
  const h = Math.floor(minutesOfDay / 60);
  const m = minutesOfDay % 60;
  return `${pad2(h)}:${pad2(m)}`;
}
