/**
 * Hour of day (0-23) at the workspace's venue. The Overview date already
 * formats in the venue time zone; the greeting used the browser's local hour,
 * so a Cancun admin on a UTC laptop saw "Good evening" under a morning date
 * (TUL-734). Falls back to the runtime-local hour when no zone is known.
 */
export function greetingHour(now: Date, timeZone?: string | null): number {
  if (!timeZone) return now.getHours();
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone,
    }).formatToParts(now);
    const hour = Number(parts.find((p) => p.type === "hour")?.value);
    return Number.isFinite(hour) ? hour % 24 : now.getHours();
  } catch {
    return now.getHours();
  }
}
