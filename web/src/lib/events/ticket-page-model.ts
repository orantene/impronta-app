/**
 * ticket-page-model.ts — the pure decisions behind `/ticket/<code>`.
 *
 * No Supabase, no `server-only`: everything here is a function of its
 * arguments so it gates in CI. The page (`app/(public)/ticket/[code]`) reads
 * rows, hands them here, and renders the answers.
 *
 * Every time label is formatted in the VENUE'S zone and never the reader's;
 * with no zone, no clock (a wrong hour on a ticket sends a guest to a shut
 * door). `resolvePublicZone` already refuses the platform rung, so a null zone
 * here means "the venue has not said", and the helpers say so too.
 */

import { doorsAt } from "./event-policy";

export type TicketLocale = "en" | "es";

/** "es", "es-AR", "ES" read Spanish; anything else reads English. */
export function ticketLocale(raw: string | null | undefined): TicketLocale {
  return (raw ?? "").trim().toLowerCase().startsWith("es") ? "es" : "en";
}

export type DateBadge = { weekday: string; day: string; month: string };

/**
 * The cover's date badge: "SÁB · 03 · OCT" in the venue's zone. Null when the
 * instant or the zone is unusable, and the cover then shows no badge rather
 * than a guessed one.
 */
export function dateBadge(iso: string | null, timeZone: string | null, locale: TicketLocale): DateBadge | null {
  if (!iso || !timeZone) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat(locale === "es" ? "es" : "en", {
      timeZone,
      weekday: "short",
      day: "2-digit",
      month: "short",
    }).formatToParts(d);
    const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    const strip = (s: string) => s.replace(/\.$/, "");
    return {
      weekday: strip(pick("weekday")).toUpperCase(),
      day: pick("day"),
      month: strip(pick("month")).toUpperCase(),
    };
  } catch {
    return null;
  }
}

/** "20:00" (es, 24h) or "8:00 PM" (en); "" without a zone or a real instant. */
export function clockLabel(iso: string | Date | null, timeZone: string | null, locale: TicketLocale): string {
  if (!iso || !timeZone) return "";
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(locale === "es" ? "es" : "en", {
      timeZone,
      hour: locale === "es" ? "2-digit" : "numeric",
      minute: "2-digit",
      hour12: locale !== "es",
    }).format(d);
  } catch {
    return "";
  }
}

/**
 * Doors and show clocks for the cover. Doors is `startsAt - offset`
 * (`doorsAt`, subtraction against an instant, no zone involved); an offset of
 * zero means doors open with the show and the doors clock is omitted rather
 * than repeated.
 */
export function nightClocks(
  startsAt: string | null,
  doorsOffsetMinutes: number,
  timeZone: string | null,
  locale: TicketLocale,
): { doors: string | null; show: string | null } {
  const show = clockLabel(startsAt, timeZone, locale) || null;
  if (!show || !startsAt) return { doors: null, show };
  const doors = doorsOffsetMinutes > 0 ? doorsAt(startsAt, doorsOffsetMinutes) : null;
  return { doors: doors ? clockLabel(doors, timeZone, locale) || null : null, show };
}

/** A tier whose label says VIP or names a table is drawn with the VIP badge. */
export function isVipTier(label: string | null | undefined): boolean {
  return /\b(vip|mesa|table)\b/i.test(label ?? "");
}

/**
 * "n of m" inside the order. Siblings are every admission the same order
 * minted, in `line_seq` order and then by id so the numbering is stable across
 * renders. A single admission has no position (null): "1 of 1" is noise.
 */
export function orderPosition(
  admissionId: string,
  siblings: ReadonlyArray<{ id: string; lineSeq: number | null }>,
): { n: number; m: number } | null {
  if (siblings.length < 2) return null;
  const sorted = [...siblings].sort((a, b) => {
    const sa = a.lineSeq ?? Number.MAX_SAFE_INTEGER;
    const sb = b.lineSeq ?? Number.MAX_SAFE_INTEGER;
    return sa - sb || a.id.localeCompare(b.id);
  });
  const idx = sorted.findIndex((s) => s.id === admissionId);
  return idx < 0 ? null : { n: idx + 1, m: sorted.length };
}

/** "#R-3F9A": the receipt's last four, upper-cased, as the ticket prints it. */
export function receiptTag(receiptCode: string | null | undefined): string | null {
  const code = (receiptCode ?? "").trim();
  if (!code) return null;
  return `#R-${code.slice(-4).toUpperCase()}`;
}

export type RefundEligibilityReason =
  | "refunds_closed"
  | "already_used"
  | "not_valid"
  | "event_cancelled"
  | "nothing_to_refund"
  | "already_requested";

export type RefundEligibility = { ok: true } | { ok: false; reason: RefundEligibilityReason };

/**
 * May THIS holder ask for a refund right now. Every "no" carries its reason so
 * the page renders a sentence, never a missing button.
 *
 * `refundsOpen` undefined reads CLOSED: the column may be absent for one
 * deploy (schema ships before code), and an absent switch must not read as an
 * open one.
 */
export function refundEligibility(args: {
  refundsOpen: boolean | null | undefined;
  refundsCloseAt: string | null | undefined;
  now: string | Date;
  admissionStatus: string;
  admittedCount: number;
  eventStatus: string | null;
  lineTotalCents: number;
  lineRefundedCents: number;
  alreadyRequested: boolean;
}): RefundEligibility {
  if (args.eventStatus === "cancelled") return { ok: false, reason: "event_cancelled" };
  if (args.admissionStatus !== "valid") return { ok: false, reason: "not_valid" };
  if (args.admittedCount > 0) return { ok: false, reason: "already_used" };
  if (args.alreadyRequested) return { ok: false, reason: "already_requested" };
  if (args.refundsOpen !== true) return { ok: false, reason: "refunds_closed" };
  if (args.refundsCloseAt) {
    const close = Date.parse(args.refundsCloseAt);
    const now = args.now instanceof Date ? args.now.getTime() : Date.parse(args.now);
    if (Number.isFinite(close) && Number.isFinite(now) && now >= close) return { ok: false, reason: "refunds_closed" };
  }
  if (args.lineTotalCents <= args.lineRefundedCents) return { ok: false, reason: "nothing_to_refund" };
  return { ok: true };
}

/** The WhatsApp share fallback when the Web Share API is absent. */
export function whatsappShareHref(text: string, url: string): string {
  return `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`.trim())}`;
}
