"use client";

export function formatDurationMs(ms: number): string {
  if (ms <= 0) return "0 m";

  const totalMinutes = Math.max(1, Math.round(ms / 60_000));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    if (hours > 0) return `${days} d ${hours} h`;
    return `${days} d`;
  }
  if (hours > 0 && minutes > 0) return `${hours} h ${minutes}`;
  if (hours > 0) return `${hours} h`;
  return `${minutes} m`;
}

export function formatCountdown(
  target: string | number | Date,
  now: number = Date.now(),
): string {
  const targetMs = new Date(target).getTime();
  if (!Number.isFinite(targetMs)) return "Time unavailable";
  const diff = targetMs - now;
  if (diff <= 0) return "Expired";
  return formatDurationMs(diff);
}

export function CountdownText({
  target,
  prefix,
  className,
}: {
  target: string | number | Date;
  prefix?: string;
  className?: string;
}) {
  const value = formatCountdown(target);
  // T9.3: readable text only — do not aria-live announce every tick.
  return (
    <span className={className} aria-label={prefix ? `${prefix} ${value}` : value}>
      {prefix ? `${prefix} ${value}` : value}
    </span>
  );
}
