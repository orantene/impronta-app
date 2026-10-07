/** Pure helpers for the client account popover. No I/O, no clock of their own. */

export const RESEND_COOLDOWN_SECONDS = 30;

/** Whole seconds left before "Resend code" is allowed again; 0 means allowed. */
export function resendSecondsLeft(
  nowMs: number,
  lastSentMs: number | null,
  cooldownSeconds: number = RESEND_COOLDOWN_SECONDS,
): number {
  if (lastSentMs === null || !Number.isFinite(lastSentMs)) return 0;
  const left = Math.ceil((lastSentMs + cooldownSeconds * 1000 - nowMs) / 1000);
  return left > 0 ? Math.min(left, cooldownSeconds) : 0;
}

/** One or two capital letters for the signed-in avatar; "?" when nothing usable. */
export function accountInitials(displayName: string | null | undefined, email?: string | null): string {
  const name = (displayName ?? "").trim();
  const source = name || (email ?? "").split("@")[0]?.replace(/[._+-]+/g, " ").trim() || "";
  const words = source.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = Array.from(words[0])[0] ?? "";
  const second = words.length > 1 ? (Array.from(words[words.length - 1])[0] ?? "") : "";
  return (first + second).toLocaleUpperCase();
}

/** Staff, talent and platform accounts are never treated as clients here. */
export function isClientAccountEligible(appRole: string | null | undefined): boolean {
  return appRole === "client" || appRole === null || appRole === undefined || appRole === "";
}

export type SummaryVisit = {
  title: string | null;
  eventDate: string | null;
  status: string | null;
  amountCents: number | null;
  currencyCode: string | null;
  paymentStatus: string | null;
};

export type AccountSummary = {
  nextVisit: { service: string | null; dateLabel: string; timeLabel: string } | null;
  unread: number;
  balanceDue: { amountCents: number; currencyCode: string } | null;
};

export const EMPTY_ACCOUNT_SUMMARY: AccountSummary = { nextVisit: null, unread: 0, balanceDue: null };

const OWED = new Set(["unpaid", "partial"]);

function zoned(ms: number, tz: string, locale: string, opts: Intl.DateTimeFormatOptions): string {
  const loc = locale === "es" ? "es-MX" : "en-US";
  try {
    return new Intl.DateTimeFormat(loc, { timeZone: tz, ...opts }).format(ms);
  } catch {
    return new Intl.DateTimeFormat(loc, { timeZone: "UTC", ...opts }).format(ms);
  }
}

/**
 * Shapes the card. `upcoming` must already be tenant-scoped and owned by the
 * caller (the loader guarantees both). Balance sums only unpaid or partial
 * bookings in ONE currency; mixed currencies show the first, never a sum.
 */
export function shapeAccountSummary(input: {
  upcoming: readonly SummaryVisit[];
  unread: number;
  nowMs: number;
  timeZone: string;
  locale: string;
}): AccountSummary {
  const dated = input.upcoming
    .map((v) => ({ v, ms: v.eventDate ? Date.parse(v.eventDate) : NaN }))
    .filter((x) => Number.isFinite(x.ms) && x.ms >= input.nowMs - 3600_000)
    .sort((a, b) => a.ms - b.ms);
  const next = dated[0];
  const owed = input.upcoming.filter(
    (v) => OWED.has(v.paymentStatus ?? "") && (v.amountCents ?? 0) > 0 && v.currencyCode,
  );
  const currency = owed[0]?.currencyCode ?? null;
  const total = currency
    ? owed.filter((v) => v.currencyCode === currency).reduce((s, v) => s + (v.amountCents ?? 0), 0)
    : 0;
  return {
    nextVisit: next
      ? {
          service: next.v.title?.trim() || null,
          dateLabel: zoned(next.ms, input.timeZone, input.locale, { weekday: "short", day: "numeric", month: "short" }),
          timeLabel: zoned(next.ms, input.timeZone, input.locale, { hour: "numeric", minute: "2-digit" }),
        }
      : null,
    unread: Math.max(0, Math.floor(input.unread || 0)),
    balanceDue: currency && total > 0 ? { amountCents: total, currencyCode: currency } : null,
  };
}
