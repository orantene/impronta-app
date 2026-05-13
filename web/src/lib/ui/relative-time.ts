/**
 * Relative-time helpers (G.5, G.9).
 *
 * Canonical formatter for "X minutes ago" style timestamps used across
 * inbox rows, message bubbles, notification feed, and activity logs.
 * Pure function — pair with `useRelativeTime` to get auto-refresh in
 * React components.
 */

const MIN = 60_000;
const HR = 60 * MIN;
const DAY = 24 * HR;
const WK = 7 * DAY;

export type RelativeTimeOptions = {
  /** "short" → "5m"; "long" → "5 minutes ago". Default "short". */
  style?: "short" | "long";
  /** ISO override of "now" for tests. */
  now?: number;
};

export function formatRelativeTime(
  iso: string | Date,
  opts: RelativeTimeOptions = {},
): string {
  const style = opts.style ?? "short";
  const now = opts.now ?? Date.now();
  const ts = typeof iso === "string" ? new Date(iso).getTime() : iso.getTime();
  if (!Number.isFinite(ts)) return "—";
  const diff = now - ts;
  const future = diff < 0;
  const abs = Math.abs(diff);

  if (abs < 45_000) return style === "short" ? "now" : "just now";

  const v =
    abs < HR ? { n: Math.round(abs / MIN), short: "m", long: "minute" }
    : abs < DAY ? { n: Math.round(abs / HR), short: "h", long: "hour" }
    : abs < WK ? { n: Math.round(abs / DAY), short: "d", long: "day" }
    : { n: Math.round(abs / WK), short: "w", long: "week" };

  if (style === "short") {
    return future ? `in ${v.n}${v.short}` : `${v.n}${v.short}`;
  }
  const plural = v.n === 1 ? "" : "s";
  return future ? `in ${v.n} ${v.long}${plural}` : `${v.n} ${v.long}${plural} ago`;
}

/**
 * Friendly compact timestamp for chat-style message bubbles (G.9).
 * - Today          → "14:32"
 * - Yesterday      → "Yesterday 14:32"
 * - This week      → "Mon 14:32"
 * - Earlier        → "May 8 · 14:32"
 * - Different year → "May 8 2025 · 14:32"
 */
export function formatMessageTime(iso: string | Date, now: number = Date.now()): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "—";

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const todayStart = today.getTime();
  const yesterdayStart = todayStart - DAY;
  const weekStart = todayStart - 6 * DAY;

  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  const time = `${hh}:${mm}`;

  const stamp = d.getTime();
  if (stamp >= todayStart) return time;
  if (stamp >= yesterdayStart) return `Yesterday ${time}`;
  if (stamp >= weekStart) {
    const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
    return `${day} ${time}`;
  }
  const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getMonth()];
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return sameYear
    ? `${month} ${d.getDate()} · ${time}`
    : `${month} ${d.getDate()} ${d.getFullYear()} · ${time}`;
}
