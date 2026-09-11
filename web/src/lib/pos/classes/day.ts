/**
 * day.ts — one venue day as the Classes mode of the point of sale sees it:
 * the appointments in arrival order, the sessions with their seats and their
 * roster, and the queue behind each session.
 *
 * WHAT THIS FILE IS. A READER over rows other surfaces write. Every figure
 * here traces to the same rule the workspace already uses for it:
 *
 *   - an appointment is an `agency_bookings` row, exactly as Operate ›
 *     Appointments lists it (`appointments-actions.ts`); "today" is decided
 *     against the VENUE's zone with the same `utcToZonedYmd` the board uses,
 *     never the reader's clock;
 *   - what an appointment still owes is `orders.total_cents` minus its paid
 *     `booking_transactions`, which is the rule `loadPosSale` (`sale-read.ts`)
 *     applies to a counter sale — the same order, the same figure;
 *   - a session's seats are `capacity_remaining_public` through
 *     `readSessionSeats` (`waitlist-desk.ts`), the one reader the Waitlist
 *     view already trusts; a count of rows here would be a second, weaker
 *     answer;
 *   - the roster is the session's `admissions` (what the door and the
 *     attendance command read) plus the waitlist entries that ACCEPTED a
 *     place and hold a committed allocation with no admission behind it
 *     (`session-waitlist.ts`, D-105) — listed so a person who took a place
 *     from the queue is on the roster the instructor reads;
 *   - the queue is `orderWaitlist` and `nextInLine`, the same ordering the
 *     Waitlist view renders.
 *
 * TAKES THE CLIENT AS AN ARGUMENT, like `waitlist-desk.ts`, so a test or a
 * script can drive it without a signed-in browser. The staff check and the
 * translation happen in the route's own action file.
 *
 * MULTI-TIER SESSIONS. A night with two tiers has two pools. The seat figure
 * shown for the session is the SUM across its pools, and one unreadable pool
 * makes the whole session unreadable rather than a smaller number that looks
 * complete. The per-tier breakdown rides along so a walk-in can pick a tier.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";
import { readSessionSeats, type WaitlistSeats } from "@/lib/scheduling/waitlist-desk";
import {
  nextInLine,
  orderWaitlist,
  type WaitlistEntry,
} from "@/lib/scheduling/session-waitlist";
import { addUtcDays, utcToZonedYmd, zonedLocalToUtc } from "@/lib/scheduling/tz";

type Admin = Pick<SupabaseClient, "from" | "rpc">;

/** A booking's stored status, restated so the screen never branches on prose. */
export type ClassesAppointmentState =
  | "draft"
  | "tentative"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "archived"
  | "unknown";

const KNOWN_STATES: readonly ClassesAppointmentState[] = [
  "draft",
  "tentative",
  "confirmed",
  "in_progress",
  "completed",
  "cancelled",
  "archived",
];

export function appointmentState(raw: string | null | undefined): ClassesAppointmentState {
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return KNOWN_STATES.find((state) => state === value) ?? "unknown";
}

/**
 * Which stored statuses "Check in" moves to `in_progress`. The same list the
 * board's reschedule accepts minus `in_progress` itself, which is what a
 * checked-in booking already is.
 */
export const CHECKINABLE_STATES: readonly ClassesAppointmentState[] = [
  "tentative",
  "confirmed",
  "draft",
];

export type ClassesAppointment = {
  readonly id: string;
  readonly title: string;
  readonly state: ClassesAppointmentState;
  readonly startsAt: string;
  readonly endsAt: string | null;
  readonly customerName: string | null;
  /** The order the money lives on, when there is one. */
  readonly orderId: string | null;
  /** `orders.version` the till is looking at; null without an order. */
  readonly orderVersion: number | null;
  /** Owed on the order, by `loadPosSale`'s rule. 0 without an order. */
  readonly outstandingCents: number;
  readonly currency: string;
  /** Can this order still be collected at the till (draft or pending)? */
  readonly collectable: boolean;
};

export type ClassesTier = {
  readonly variantId: string;
  readonly label: string;
  readonly amountCents: number;
  readonly poolKey: string;
};

export type ClassesRosterEntry =
  | {
      readonly kind: "admission";
      readonly admissionId: string;
      readonly name: string | null;
      readonly partySize: number;
      readonly admittedCount: number;
      /** `admissions.status`: valid, refunded, void ... */
      readonly status: string;
    }
  | {
      /** Took a place from the queue; holds a seat, has no ticket row yet. */
      readonly kind: "waitlist_place";
      readonly entryId: string;
      readonly name: string;
      readonly partySize: number;
    };

export type ClassesSession = {
  readonly id: string;
  readonly title: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly offeringId: string | null;
  readonly offeringTitle: string | null;
  readonly seats: WaitlistSeats;
  readonly tiers: readonly ClassesTier[];
  readonly roster: readonly ClassesRosterEntry[];
  readonly waitlist: readonly WaitlistEntry[];
  readonly nextInLineId: string | null;
};

export type ClassesDay = {
  readonly timeZone: string;
  /** The venue day shown, YYYY-MM-DD in `timeZone`. */
  readonly ymd: string;
  /** Days from the venue's today: 0 is today, 1 tomorrow, -1 yesterday. */
  readonly dayOffset: number;
  readonly appointments: readonly ClassesAppointment[];
  readonly sessions: readonly ClassesSession[];
};

export type ClassesDayResult = { ok: true; day: ClassesDay } | { ok: false; error: string };

const LOAD_ERROR = "Could not load the day.";

/** How far from today the till may page. A front desk works the near days. */
export const MAX_DAY_OFFSET = 14;

export function clampDayOffset(raw: unknown): number {
  const n = typeof raw === "string" ? Number(raw) : typeof raw === "number" ? raw : 0;
  if (!Number.isFinite(n)) return 0;
  return Math.max(-MAX_DAY_OFFSET, Math.min(MAX_DAY_OFFSET, Math.trunc(n)));
}

/**
 * The venue day's instant window, or null when the zone cannot be read.
 *
 * Both bounds come from the venue's own midnight. A day that starts on a
 * clock change is handled by `zonedLocalToUtc` (midnight is never inside a
 * DST gap in any zone in use, but the function refuses rather than guesses).
 */
export function venueDayWindow(
  now: Date,
  timeZone: string,
  dayOffset: number,
): { ymd: string; from: Date; to: Date } | null {
  const today = utcToZonedYmd(now, timeZone);
  if (!today) return null;
  const ymd = addUtcDays(today, dayOffset);
  if (!ymd) return null;
  const next = addUtcDays(ymd, 1);
  if (!next) return null;
  const from = zonedLocalToUtc(ymd, 0, timeZone);
  const to = zonedLocalToUtc(next, 0, timeZone);
  if (!from || !to) return null;
  return { ymd, from, to };
}

function num(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Arrival order: by start, then id, so two 10:00s never swap under a cursor. */
export function compareByStart<T extends { startsAt: string; id: string }>(a: T, b: T): number {
  const d = Date.parse(a.startsAt) - Date.parse(b.startsAt);
  if (d !== 0) return d;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Fold a session's pools into one seat answer. One unreadable pool poisons
 * the sum; no pools at all is `uncounted`.
 */
export function sumSeats(perPool: readonly WaitlistSeats[]): WaitlistSeats {
  if (perPool.length === 0) return { kind: "uncounted" };
  let total = 0;
  let remaining = 0;
  let unreadable = false;
  for (const seats of perPool) {
    if (seats.kind === "uncounted") continue;
    total += seats.total;
    if (seats.kind === "unreadable") unreadable = true;
    else remaining += seats.remaining;
  }
  if (perPool.every((s) => s.kind === "uncounted")) return { kind: "uncounted" };
  if (unreadable) return { kind: "unreadable", total };
  return { kind: "counted", total, remaining };
}

export async function loadClassesDay(
  admin: Admin,
  input: { tenantId: string; timeZone: string; now: Date; dayOffset: number },
): Promise<ClassesDayResult> {
  const window = venueDayWindow(input.now, input.timeZone, input.dayOffset);
  if (!window) return { ok: false, error: LOAD_ERROR };
  const fromIso = window.from.toISOString();
  const toIso = window.to.toISOString();

  const [bookingsRead, sessionsRead] = await Promise.all([
    admin
      .from("agency_bookings")
      .select("id, title, status, starts_at, ends_at, contact_name, client_account_name, order_id")
      .eq("tenant_id", input.tenantId)
      .gte("starts_at", fromIso)
      .lt("starts_at", toIso)
      .order("starts_at", { ascending: true })
      .limit(400),
    admin
      .from("sessions")
      .select("id, title, starts_at, ends_at, status, offering_id")
      .eq("tenant_id", input.tenantId)
      .eq("status", "scheduled")
      .gte("starts_at", fromIso)
      .lt("starts_at", toIso)
      .order("starts_at", { ascending: true })
      .limit(60),
  ]);
  if (bookingsRead.error) {
    logServerError("pos.classes.day/bookings", bookingsRead.error);
    return { ok: false, error: LOAD_ERROR };
  }
  if (sessionsRead.error) {
    logServerError("pos.classes.day/sessions", sessionsRead.error);
    return { ok: false, error: LOAD_ERROR };
  }

  const bookingRows = bookingsRead.data ?? [];
  const sessionRows = sessionsRead.data ?? [];

  // ── The money behind the appointments, by the counter's own rule.
  const orderIds = [...new Set(bookingRows.map((b) => b.order_id).filter((id): id is string => typeof id === "string" && id.length > 0))];
  const ordersById = new Map<string, { version: number; totalCents: number; currency: string; status: string }>();
  const paidByOrder = new Map<string, number>();
  if (orderIds.length > 0) {
    const [ordersRead, paidRead] = await Promise.all([
      admin.from("orders").select("id, version, total_cents, currency, status").eq("tenant_id", input.tenantId).in("id", orderIds),
      admin.from("booking_transactions").select("order_id, gross_amount_cents, status").in("order_id", orderIds),
    ]);
    if (ordersRead.error) {
      logServerError("pos.classes.day/orders", ordersRead.error);
      return { ok: false, error: LOAD_ERROR };
    }
    if (paidRead.error) {
      logServerError("pos.classes.day/paid", paidRead.error);
      return { ok: false, error: LOAD_ERROR };
    }
    for (const o of ordersRead.data ?? []) {
      ordersById.set(String(o.id), {
        version: Number(o.version) || 1,
        totalCents: num(o.total_cents),
        currency: text(o.currency) ?? "USD",
        status: text(o.status) ?? "",
      });
    }
    for (const t of paidRead.data ?? []) {
      if (t.status !== "paid" || typeof t.order_id !== "string") continue;
      paidByOrder.set(t.order_id, (paidByOrder.get(t.order_id) ?? 0) + num(t.gross_amount_cents));
    }
  }

  const appointments: ClassesAppointment[] = bookingRows
    .filter((b): b is typeof b & { starts_at: string } => typeof b.starts_at === "string")
    .map((b) => {
      const order = b.order_id ? ordersById.get(b.order_id) : undefined;
      const outstanding = order ? Math.max(0, order.totalCents - (paidByOrder.get(b.order_id ?? "") ?? 0)) : 0;
      return {
        id: String(b.id),
        title: text(b.title) ?? "Untitled booking",
        state: appointmentState(typeof b.status === "string" ? b.status : null),
        startsAt: b.starts_at,
        endsAt: typeof b.ends_at === "string" ? b.ends_at : null,
        customerName: text(b.contact_name) ?? text(b.client_account_name),
        orderId: order ? (b.order_id ?? null) : null,
        orderVersion: order ? order.version : null,
        outstandingCents: outstanding,
        currency: order?.currency ?? "USD",
        collectable: order ? order.status === "draft" || order.status === "pending_payment" : false,
      };
    })
    .sort(compareByStart);

  if (sessionRows.length === 0) {
    return { ok: true, day: { timeZone: input.timeZone, ymd: window.ymd, dayOffset: input.dayOffset, appointments, sessions: [] } };
  }

  // ── Seats, tiers, roster, queue for the day's sessions.
  const sessionIds = sessionRows.map((s) => String(s.id));
  const offeringIds = [...new Set(sessionRows.map((s) => s.offering_id).filter((id): id is string => typeof id === "string" && id.length > 0))];
  const [poolsRead, admissionsRead, waitlistRead, variantsRead, offeringsRead] = await Promise.all([
    admin.from("capacity_pools").select("id, subject_id, units_total, pool_key").eq("tenant_id", input.tenantId).eq("subject_kind", "session_tier").in("subject_id", sessionIds),
    admin.from("admissions").select("id, session_id, holder_name, party_size, admitted_count, status, order_line_id, created_at").eq("tenant_id", input.tenantId).in("session_id", sessionIds).order("created_at", { ascending: true }),
    admin.from("session_waitlist_entries").select("id, session_id, customer_name, customer_email, party_size, status, joined_at, offered_at, offer_expires_at").eq("tenant_id", input.tenantId).in("session_id", sessionIds).order("joined_at", { ascending: true }),
    offeringIds.length > 0
      ? admin.from("talent_offering_variants").select("id, offering_id, label, amount_cents, pool_key, is_hidden").in("offering_id", offeringIds)
      : Promise.resolve({ data: [], error: null }),
    offeringIds.length > 0
      ? admin.from("talent_offerings").select("id, title").eq("tenant_id", input.tenantId).in("id", offeringIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (poolsRead.error) {
    logServerError("pos.classes.day/pools", poolsRead.error);
    return { ok: false, error: LOAD_ERROR };
  }
  if (admissionsRead.error) {
    logServerError("pos.classes.day/admissions", admissionsRead.error);
    return { ok: false, error: LOAD_ERROR };
  }
  if (waitlistRead.error) {
    logServerError("pos.classes.day/waitlist", waitlistRead.error);
    return { ok: false, error: LOAD_ERROR };
  }
  if (variantsRead.error) {
    logServerError("pos.classes.day/variants", variantsRead.error);
    return { ok: false, error: LOAD_ERROR };
  }
  if (offeringsRead.error) {
    logServerError("pos.classes.day/offerings", offeringsRead.error);
    return { ok: false, error: LOAD_ERROR };
  }

  // NAMES FOR TICKETS SOLD AT THE COUNTER. A counter sale mints its
  // admissions with no holder name (the name lives on the order's customer),
  // so the roster reads it back through the order line rather than printing
  // a blank beside a real seat.
  const unnamedLineIds = (admissionsRead.data ?? [])
    .filter((a) => !text(a.holder_name) && typeof a.order_line_id === "string")
    .map((a) => String(a.order_line_id));
  const nameByLine = new Map<string, string>();
  if (unnamedLineIds.length > 0) {
    const linesRead = await admin.from("order_lines").select("id, order_id").in("id", unnamedLineIds);
    if (linesRead.error) {
      logServerError("pos.classes.day/lines", linesRead.error);
      return { ok: false, error: LOAD_ERROR };
    }
    const lineOrderIds = [...new Set((linesRead.data ?? []).map((l) => String(l.order_id)))];
    if (lineOrderIds.length > 0) {
      const orderCustomers = await admin.from("orders").select("id, customer_id").eq("tenant_id", input.tenantId).in("id", lineOrderIds);
      if (orderCustomers.error) {
        logServerError("pos.classes.day/orderCustomers", orderCustomers.error);
        return { ok: false, error: LOAD_ERROR };
      }
      const customerIds = [...new Set((orderCustomers.data ?? []).map((o) => o.customer_id).filter((id): id is string => typeof id === "string"))];
      const customerName = new Map<string, string>();
      if (customerIds.length > 0) {
        const customers = await admin.from("customers").select("id, display_name, email").eq("tenant_id", input.tenantId).in("id", customerIds);
        if (customers.error) {
          logServerError("pos.classes.day/customers", customers.error);
          return { ok: false, error: LOAD_ERROR };
        }
        for (const c of customers.data ?? []) {
          const name = text(c.display_name) ?? text(c.email);
          if (name) customerName.set(String(c.id), name);
        }
      }
      const customerByOrder = new Map((orderCustomers.data ?? []).map((o) => [String(o.id), typeof o.customer_id === "string" ? o.customer_id : null]));
      for (const l of linesRead.data ?? []) {
        const cid = customerByOrder.get(String(l.order_id));
        const name = cid ? customerName.get(cid) : undefined;
        if (name) nameByLine.set(String(l.id), name);
      }
    }
  }

  const poolsBySession = new Map<string, Array<{ id: string; unitsTotal: number; poolKey: string }>>();
  for (const p of poolsRead.data ?? []) {
    const list = poolsBySession.get(String(p.subject_id)) ?? [];
    list.push({ id: String(p.id), unitsTotal: num(p.units_total), poolKey: text(p.pool_key) ?? "default" });
    poolsBySession.set(String(p.subject_id), list);
  }
  const offeringTitle = new Map((offeringsRead.data ?? []).map((o) => [String(o.id), text(o.title)]));
  const variantsByOffering = new Map<string, ClassesTier[]>();
  for (const v of variantsRead.data ?? []) {
    if (v.is_hidden === true) continue;
    const key = text(v.pool_key);
    if (!key) continue;
    const list = variantsByOffering.get(String(v.offering_id)) ?? [];
    list.push({ variantId: String(v.id), label: text(v.label) ?? key, amountCents: num(v.amount_cents), poolKey: key });
    variantsByOffering.set(String(v.offering_id), list);
  }

  const sessions: ClassesSession[] = [];
  for (const s of sessionRows) {
    const id = String(s.id);
    const startsAt = String(s.starts_at);
    const endsAt = String(s.ends_at);
    const pools = poolsBySession.get(id) ?? [];
    const perPool: WaitlistSeats[] = [];
    for (const pool of pools) {
      perPool.push(
        await readSessionSeats(admin, { id: pool.id, unitsTotal: pool.unitsTotal }, {
          id,
          title: text(s.title),
          starts_at: startsAt,
          ends_at: endsAt,
          status: String(s.status),
        }),
      );
    }
    const mine = (waitlistRead.data ?? []).filter((w) => w.session_id === id);
    const ordered = orderWaitlist(
      mine.map((w) => ({
        id: String(w.id),
        session_id: String(w.session_id),
        customer_name: String(w.customer_name ?? ""),
        customer_email: text(w.customer_email),
        party_size: typeof w.party_size === "number" ? w.party_size : null,
        status: String(w.status),
        joined_at: String(w.joined_at),
        offered_at: text(w.offered_at),
        offer_expires_at: text(w.offer_expires_at),
      })),
      input.now,
    );
    const roster: ClassesRosterEntry[] = [];
    for (const a of admissionsRead.data ?? []) {
      if (a.session_id !== id) continue;
      roster.push({
        kind: "admission",
        admissionId: String(a.id),
        name: text(a.holder_name) ?? (typeof a.order_line_id === "string" ? nameByLine.get(a.order_line_id) ?? null : null),
        partySize: num(a.party_size),
        admittedCount: num(a.admitted_count),
        status: text(a.status) ?? "",
      });
    }
    for (const w of ordered) {
      if (w.status !== "accepted") continue;
      roster.push({ kind: "waitlist_place", entryId: w.id, name: w.customerName, partySize: w.partySize });
    }
    const offeringId = text(s.offering_id);
    // A tier is only offered to a walk-in when this session really has a
    // pool under that key; a variant with no pool for tonight sells nothing.
    const poolKeys = new Set(pools.map((p) => p.poolKey));
    const tiers = (offeringId ? variantsByOffering.get(offeringId) ?? [] : []).filter((t) => poolKeys.has(t.poolKey));
    sessions.push({
      id,
      title: text(s.title) ?? offeringTitle.get(offeringId ?? "") ?? "Untitled session",
      startsAt,
      endsAt,
      offeringId,
      offeringTitle: offeringId ? offeringTitle.get(offeringId) ?? null : null,
      seats: sumSeats(perPool),
      tiers,
      roster,
      waitlist: ordered,
      nextInLineId: nextInLine(ordered, input.now)?.id ?? null,
    });
  }
  sessions.sort(compareByStart);

  return { ok: true, day: { timeZone: input.timeZone, ymd: window.ymd, dayOffset: input.dayOffset, appointments, sessions } };
}
