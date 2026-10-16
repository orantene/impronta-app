/**
 * Real inputs for the smart callouts (design L5). Pure: rows in, `CalloutInputs`
 * pieces out. The IO lives in `inputs.server.ts`.
 */
import { windowsForDate, type BookingHours, type WeekdayIndex } from "@/lib/scheduling/hours-types";
import { boundKey, localParts } from "../local-time";
import type { Promo } from "../types";
import type { CalloutInputs } from "./engine";

export type Lang = "es" | "en";
type UpcomingDay = NonNullable<CalloutInputs["upcomingDays"]>[number];

export type BookingSpan = { starts_at: string; ends_at: string; status: string; updated_at?: string | null };

const MIN = 60_000;
const DAY = 86_400_000;
export const UPCOMING_DAYS = 7;
export const LAPSED_DAYS = 90;
export const CANCELLATION_LOOKBACK_HOURS = 48;
export const IDLE_WINDOW_DAYS = 30;

function dayName(ymd: string, lang: Lang): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  const s = new Intl.DateTimeFormat(lang === "es" ? "es-MX" : "en-US", { timeZone: "UTC", weekday: "long", day: "numeric" }).format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Wall-clock ms of an instant in `tz` (so minutes since a local midnight are plain arithmetic). */
function wallMs(ms: number, tz: string): number {
  return ms + localParts(ms, tz).offsetMinutes * MIN;
}

/** True when a live or upcoming auto promo can apply on that local day. */
export function promoCoversDay(p: Promo, ymd: string, weekday: number): boolean {
  if (p.is_draft || p.is_paused || p.archived_at) return false;
  if (p.weekdays && p.weekdays.length > 0 && !p.weekdays.includes(weekday)) return false;
  if (p.starts_at && boundKey(p.starts_at, p.tz, "start").slice(0, 10) > ymd) return false;
  if (p.ends_at && boundKey(p.ends_at, p.tz, "end").slice(0, 10) < ymd) return false;
  return true;
}

/** Next local days (today first) with open and booked hours inside the talent's working windows. */
export function buildUpcomingDays(input: {
  now: Date;
  hours: BookingHours;
  busy: readonly BookingSpan[];
  promos: readonly Promo[];
  lang?: Lang;
  days?: number;
}): UpcomingDay[] {
  const { hours, now } = input;
  const tz = hours.timezone;
  const lang = input.lang ?? "es";
  const spans = input.busy
    .filter((b) => b.status !== "cancelled")
    .map((b) => ({ s: wallMs(Date.parse(b.starts_at), tz), e: wallMs(Date.parse(b.ends_at), tz) }))
    .filter((b) => Number.isFinite(b.s) && Number.isFinite(b.e) && b.e > b.s);
  const out: UpcomingDay[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < (input.days ?? UPCOMING_DAYS); i += 1) {
    const lp = localParts(now.getTime() + i * DAY, tz);
    if (seen.has(lp.date)) continue;
    seen.add(lp.date);
    const windows = windowsForDate(hours, lp.date, lp.weekday as WeekdayIndex);
    if (windows.length === 0) continue; // a closed day is not an empty day
    const dayStart = Date.parse(`${lp.date}T00:00:00Z`);
    let open = 0;
    let booked = 0;
    for (const w of windows) {
      // Today only counts the time still ahead.
      const from = i === 0 ? Math.max(w.startMin, lp.minutes) : w.startMin;
      if (w.endMin <= from) continue;
      open += w.endMin - from;
      const a = dayStart + from * MIN;
      const b = dayStart + w.endMin * MIN;
      for (const s of spans) booked += Math.max(0, Math.min(b, s.e) - Math.max(a, s.s)) / MIN;
    }
    if (open <= 0) continue;
    out.push({
      label: dayName(lp.date, lang),
      openHours: Math.round((open / 60) * 10) / 10,
      bookedHours: Math.round((Math.min(booked, open) / 60) * 10) / 10,
      coveredByLivePromo: input.promos.some((p) => promoCoversDay(p, lp.date, lp.weekday)),
    });
  }
  return out;
}

/** The freshest cancelled slot (last 48h) that is still 3h+ away and inside working hours. */
export function pickCancellation(input: {
  now: Date;
  hours: BookingHours;
  rows: readonly BookingSpan[];
}): CalloutInputs["cancellation"] {
  const { now, hours } = input;
  const since = now.getTime() - CANCELLATION_LOOKBACK_HOURS * 3600_000;
  const fresh = input.rows
    .filter((r) => r.status === "cancelled" && Date.parse(r.updated_at ?? "") >= since && Date.parse(r.starts_at) > now.getTime())
    .sort((a, b) => Date.parse(b.updated_at ?? "") - Date.parse(a.updated_at ?? ""));
  const r = fresh[0];
  if (!r) return null;
  const start = Date.parse(r.starts_at);
  const lp = localParts(start, hours.timezone);
  const within = windowsForDate(hours, lp.date, lp.weekday as WeekdayIndex).some((w) => lp.minutes >= w.startMin && lp.minutes < w.endMin);
  const hh = String(Math.floor(lp.minutes / 60)).padStart(2, "0");
  const mm = String(lp.minutes % 60).padStart(2, "0");
  return { slotLabel: `${hh}:${mm}`, hoursAway: (start - now.getTime()) / 3600_000, withinWorkingHours: within };
}

export type OrderStub = { customer_id: string | null; created_at: string };

/** Clients with 2+ confirmed orders, none in the last 90 days. */
export function countLapsedClients(orders: readonly OrderStub[], now: Date): number {
  const cutoff = now.getTime() - LAPSED_DAYS * DAY;
  const by = new Map<string, { n: number; last: number }>();
  for (const o of orders) {
    if (!o.customer_id) continue;
    const t = Date.parse(o.created_at);
    if (!Number.isFinite(t)) continue;
    const cur = by.get(o.customer_id) ?? { n: 0, last: 0 };
    by.set(o.customer_id, { n: cur.n + 1, last: Math.max(cur.last, t) });
  }
  let lapsed = 0;
  for (const v of by.values()) if (v.n >= 2 && v.last < cutoff) lapsed += 1;
  return lapsed;
}

/** Published services with the number of confirmed bookings in the last 30 days. */
export function serviceBookingCounts(
  services: readonly { id: string; title: string }[],
  lines: readonly { offering_id: string | null }[],
): { id: string; name: string; bookings30d: number }[] {
  const counts = new Map<string, number>();
  for (const l of lines) if (l.offering_id) counts.set(l.offering_id, (counts.get(l.offering_id) ?? 0) + 1);
  return services.map((s) => ({ id: s.id, name: s.title, bookings30d: counts.get(s.id) ?? 0 }));
}
