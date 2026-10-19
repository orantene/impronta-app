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

/**
 * The zone to render the Overview date and greeting in. A workspace that never
 * picked a venue zone is stored (and snapshotted) as "UTC", which put a Cancun
 * admin at 7 PM under a UTC date and greeting (TUL-734). Treat UTC / empty as
 * "unset" so the viewer's own clock is used; a real venue zone still wins.
 */
export function venueZoneOrNull(timeZone?: string | null): string | null {
  const zone = timeZone?.trim();
  if (!zone) return null;
  const upper = zone.toUpperCase();
  if (upper === "UTC" || upper === "ETC/UTC" || upper === "GMT" || upper === "ETC/GMT" || upper === "Z") return null;
  return zone;
}
