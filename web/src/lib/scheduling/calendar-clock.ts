/**
 * The zone and "today" the workspace Calendar header shows (TUL-700).
 *
 * A workspace nobody has set a zone on resolves to the platform "UTC" default
 * (`agencies.timezone` and its venue both default to it). Shown as is, the
 * header read "UTC" and the day rolled over at 7 pm in Cancun. The device
 * zone is the better guess for that case; a workspace with a real zone keeps
 * it. Language plays no part: the same inputs give the same clock in ES and EN.
 */
import { isValidIanaTimeZone, utcToZonedYmd } from "@/lib/scheduling/tz";

export type CalendarClockInput = {
  serverZone: string;
  serverTodayYmd: string;
  browserZone: string;
  now: Date;
};

export function resolveCalendarClock(input: CalendarClockInput): { timeZone: string; todayYmd: string } {
  const { serverZone, serverTodayYmd, browserZone, now } = input;
  if (serverZone === "UTC" && browserZone && browserZone !== "UTC" && isValidIanaTimeZone(browserZone)) {
    const todayYmd = utcToZonedYmd(now, browserZone);
    if (todayYmd) return { timeZone: browserZone, todayYmd };
  }
  return { timeZone: serverZone, todayYmd: serverTodayYmd };
}
