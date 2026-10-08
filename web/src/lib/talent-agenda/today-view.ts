/**
 * Pure derivations for the Agenda V2 Today page (mockup today_d / tc_today).
 *
 * First-run vs established is decided from real facts (services, agenda,
 * published site), never from the old 6-step checklist: an established
 * talent with services and a live website must never see "Set up your day".
 */

import { resolveAttentionCta } from "./attention-cta";
import type { TalentAgendaItem } from "./types";

/**
 * `loading` is the honest answer while the facts are still in flight: it used
 * to collapse into `established`, so a brand-new account first painted the
 * regular "Good morning" Today and only flipped to the "Welcome" launch view
 * when offerings resolved (or never, when that call failed). Callers give up
 * waiting after a short window by passing `settled: true`.
 */
export type TodayMode = "first_run" | "established" | "loading";

export type TodayModeFacts = {
  /** Loaded agenda items (any state). */
  agendaItemCount: number;
  /** Non-archived services/offerings; null while loading. */
  bookableCount: number | null;
  /** Public website is published. */
  sitePublished: boolean;
  /**
   * True once the caller stopped waiting for `bookableCount` (load failed or
   * timed out). Defaults to true so pure callers keep the old behavior.
   */
  settled?: boolean;
};

/**
 * First run only when the talent is provably new: nothing to sell, nothing
 * booked, no live site. Unknown (still loading) never claims "new".
 */
export function resolveTodayMode(facts: TodayModeFacts): TodayMode {
  if (facts.sitePublished) return "established";
  if (facts.agendaItemCount > 0) return "established";
  if (facts.bookableCount == null) return facts.settled === false ? "loading" : "established";
  return facts.bookableCount > 0 ? "established" : "first_run";
}

export type QualityCardMode = "checklist" | "ready" | "live" | "hidden";

/** Profile quality card: checklist below 100, live variant once published. */
export function resolveQualityCardMode(input: {
  percent: number | null;
  sitePublished: boolean;
}): QualityCardMode {
  if (input.sitePublished) return "live";
  if (input.percent == null) return "hidden";
  return input.percent >= 100 ? "ready" : "checklist";
}

export type AttentionTone = "info" | "warn" | "brand";

export type TodayAttentionAction = {
  /** EN label; translate at render. */
  label: string;
  tone: AttentionTone;
  /** EN chip label; translate at render. */
  chip: string;
};

/** One action per attention row (mockup: Reply / Send a payment link / Review). */
export function todayAttentionAction(item: TalentAgendaItem): TodayAttentionAction {
  if (item.managedBy && (item.kind === "request" || item.booking === "requested")) {
    return { label: "Review", tone: "brand", chip: item.managedBy.name };
  }
  if (item.kind === "request" || item.booking === "requested") {
    return { label: "Reply", tone: "info", chip: "Requested" };
  }
  if ((item.kind === "hold" || item.booking === "hold") && item.payment !== "checking") {
    return { label: "Send a payment link", tone: "warn", chip: "Hold" };
  }
  if (item.payment === "overdue") {
    return { label: "Send a payment link", tone: "warn", chip: "Overdue" };
  }
  const cta = resolveAttentionCta(item);
  return { label: cta.label, tone: "warn", chip: cta.kind === "collect" ? "Due" : "Open" };
}

export type AppointmentActionKind = "check_in" | "collect" | "request_deposit" | "payment_link";

/** Row action for today's appointments (mockup: Check in / Collect / Request deposit). */
export function todayAppointmentAction(
  item: TalentAgendaItem,
  now: Date,
): { kind: AppointmentActionKind; cents?: number } | null {
  if (item.kind !== "booking" && item.kind !== "hold") return null;
  if (item.booking === "completed" || item.booking === "cancelled" || item.booking === "no_show") {
    return null;
  }
  if (item.booking === "hold_expired") return null;
  if (item.payment === "due" || item.payment === "partial" || item.payment === "overdue") {
    return item.money.dueCents > 0 ? { kind: "collect", cents: item.money.dueCents } : null;
  }
  if ((item.payment === "none" || item.payment === "awaiting") && (item.money.paidCents ?? 0) === 0) {
    // No agreed price yet: the talent types the amount into a payment link.
    return item.money.totalCents > 0 ? { kind: "request_deposit" } : { kind: "payment_link" };
  }
  const ends = Date.parse(item.endsAt);
  if ((item.payment === "paid" || item.payment === "agency") && Number.isFinite(ends) && ends >= now.getTime()) {
    return { kind: "check_in" };
  }
  return null;
}

function localYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const LIVE_STATES: ReadonlySet<TalentAgendaItem["booking"]> = new Set([
  "confirmed",
  "hold",
  "completed",
]);

/** Today's appointment rows: bookings and holds starting today, time order. */
export function todayAppointments(
  items: readonly TalentAgendaItem[],
  now: Date,
): TalentAgendaItem[] {
  const key = localYmd(now);
  return items
    .filter(
      (i) =>
        (i.kind === "booking" || i.kind === "hold") &&
        LIVE_STATES.has(i.booking) &&
        localYmd(new Date(i.startsAt)) === key,
    )
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}

/** "Up next": the first later day that has appointments in the loaded range. */
export function upNextDay(
  items: readonly TalentAgendaItem[],
  now: Date,
): { day: Date; items: TalentAgendaItem[] } | null {
  const todayKey = localYmd(now);
  const future = items
    .filter(
      (i) =>
        (i.kind === "booking" || i.kind === "hold") &&
        (i.booking === "confirmed" || i.booking === "hold") &&
        localYmd(new Date(i.startsAt)) > todayKey,
    )
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const first = future[0];
  if (!first) return null;
  const key = localYmd(new Date(first.startsAt));
  const day = new Date(first.startsAt);
  return { day, items: future.filter((i) => localYmd(new Date(i.startsAt)) === key) };
}

/** Owed to you: overdue anywhere plus balances due on work that has started. */
export function owedFromAgenda(
  items: readonly TalentAgendaItem[],
  now: Date,
): { cents: number; count: number; currency: string | null } {
  let cents = 0;
  let count = 0;
  let currency: string | null = null;
  for (const item of items) {
    if (item.money.dueCents <= 0) continue;
    if (item.booking === "cancelled") continue;
    const started = Date.parse(item.startsAt) <= now.getTime();
    const owed =
      item.payment === "overdue" ||
      (started && (item.payment === "due" || item.payment === "partial"));
    if (!owed) continue;
    cents += item.money.dueCents;
    count += 1;
    currency = currency ?? item.money.currency ?? null;
  }
  return { cents, count, currency };
}

/** "60 min", "135 min" — the mockup writes durations in minutes. */
export function durationMinutes(item: Pick<TalentAgendaItem, "startsAt" | "endsAt" | "allDay">): number | null {
  if (item.allDay) return null;
  const m = Math.round((Date.parse(item.endsAt) - Date.parse(item.startsAt)) / 60_000);
  return Number.isFinite(m) && m > 0 ? m : null;
}

/** "4 h 15", "3 h", "45 min". */
export function bookedLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h} h ${m}`;
  if (h > 0) return `${h} h`;
  return `${m} min`;
}

export type Greeting = "Good morning" | "Good afternoon" | "Good evening";

export function greetingFor(now: Date): Greeting {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

/**
 * DS-51: which of the two Today header buttons is the filled one. Booking-first
 * is the default (a solo talent books far more often than she quotes); trades
 * whose money pattern is a quote (events, gigs, projects) keep the quote first.
 */
export function todayPrimaryAction(moneyPattern: string | null | undefined): "booking" | "quote" {
  return (moneyPattern ?? "").startsWith("quote") ? "quote" : "booking";
}
