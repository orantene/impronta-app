/**
 * Relative age for support ticket rows. Numbers + unit letters so the
 * same string works across en/es/fr. Lives here so the widget never
 * imports from shell/internal/messages.
 */
export function relTime(iso: string, nowMs = Date.now()): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "0m";
  const mins = Math.max(0, Math.floor((nowMs - then) / 60_000));
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}
