/**
 * Ground truth the wiring specs SEED, so a control is exercised rather than
 * skipped when the fixture happens not to carry the row it needs.
 *
 * Every seeder writes to the isolated qa-journeys tenant only (the service
 * client refuses production) and returns a cleanup that removes what it
 * wrote. Nothing here reads the UI; specs assert the UI, then read these
 * rows back for the engine's answer.
 */
import { randomUUID } from "node:crypto";

import type { Page } from "@playwright/test";

import { isolatedService, JOURNEYS_TENANT_ID } from "./_isolated-db";

/**
 * Wait until React owns `selector`, reloading ONCE if it never does.
 *
 * A Turbopack dev server's first compile of a route can reference a chunk it
 * has already replaced; the HTML renders, the chunk 404s, and the page never
 * hydrates (incident: "tenant pages die on hydration"). A click on that page
 * is a click on nothing and the spec would fail for a reason that is not the
 * control's. One reload is the whole remedy; a second failure is reported.
 */
export async function ensureHydrated(page: Page, selector: string): Promise<void> {
  const owned = () =>
    page
      .waitForFunction(
        (sel) => {
          const el = document.querySelector(sel);
          return Boolean(el && Object.keys(el).some((k) => k.startsWith("__react")));
        },
        selector,
        { timeout: 15_000 },
      )
      .then(() => true)
      .catch(() => false);
  await page.locator(selector).first().waitFor({ timeout: 60_000 });
  if (await owned()) return;
  await page.reload();
  await page.locator(selector).first().waitFor({ timeout: 60_000 });
  if (!(await owned())) throw new Error(`${selector} never hydrated, even after one reload`);
}

const T = JOURNEYS_TENANT_ID;

function must<T>(label: string, r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(`${label}: ${r.error.message}`);
  if (r.data == null) throw new Error(`${label}: no row`);
  return r.data;
}

export const QA_TALENT_A = "33330003-0000-4000-8000-000000000001";
export const QA_TALENT_B = "33330003-0000-4000-8000-000000000002";

/** A confirmed project starting tomorrow with talent A assigned (W48 / W50 fixtures). */
export async function seedProject(input: {
  title: string;
  status: "confirmed" | "completed" | "cancelled";
  talentId?: string | null;
}): Promise<{ bookingId: string; startsAt: string; endsAt: string; cleanup: () => Promise<void> }> {
  const sb = isolatedService();
  const startsAt = new Date(Date.now() + 24 * 3600_000);
  startsAt.setUTCMinutes(0, 0, 0);
  const endsAt = new Date(startsAt.getTime() + 2 * 3600_000);
  const booking = must(
    "seedProject/agency_bookings",
    await sb
      .from("agency_bookings")
      .insert({
        tenant_id: T,
        title: input.title,
        status: input.status,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        currency_code: "USD",
        total_client_revenue: 500,
        contact_name: "WIRE seed",
      })
      .select("id")
      .single(),
  ) as { id: string };
  if (input.talentId !== null) {
    must(
      "seedProject/booking_talent",
      await sb
        .from("booking_talent")
        .insert({
          tenant_id: T,
          booking_id: booking.id,
          talent_profile_id: input.talentId ?? QA_TALENT_A,
          talent_name_snapshot: "QA Journeys Talent",
          role_label: "Seed role",
          pricing_unit: "event",
          units: 1,
          talent_cost_rate: 0,
          client_charge_rate: 500,
          talent_cost_total: 0,
          client_charge_total: 500,
          gross_profit: 500,
        })
        .select("id")
        .single(),
    );
  }
  return {
    bookingId: booking.id,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    cleanup: async () => {
      await sb.from("booking_talent").delete().eq("booking_id", booking.id);
      await sb.from("agency_bookings").delete().eq("id", booking.id);
    },
  };
}

/** A confirmed talent booking that overlaps [startsAt, endsAt): the engine's `talent_unavailable`. */
export async function seedTalentConflict(input: {
  talentId: string;
  startsAt: string;
  endsAt: string;
}): Promise<{ id: string; cleanup: () => Promise<void> }> {
  const sb = isolatedService();
  const row = must(
    "seedTalentConflict/talent_bookings",
    await sb
      .from("talent_bookings")
      .insert({
        tenant_id: T,
        talent_profile_id: input.talentId,
        title: "WIRE conflict",
        starts_at: input.startsAt,
        ends_at: input.endsAt,
        status: "confirmed",
      })
      .select("id")
      .single(),
  ) as { id: string };
  return {
    id: row.id,
    cleanup: async () => {
      await sb.from("talent_bookings").delete().eq("id", row.id);
    },
  };
}

/** The workspace's default location (every layout hangs off one). */
async function defaultLocationId(): Promise<string> {
  const sb = isolatedService();
  const row = must(
    "defaultLocationId",
    await sb.from("venue_locations").select("id").eq("tenant_id", T).eq("is_default", true).limit(1).maybeSingle(),
  ) as { id: string };
  return row.id;
}

/**
 * A seat map for a published event's night: one layout, two seat spaces on
 * it, and the `event_seat_maps` row the public picker reads. Returns the seat
 * ids in the order the picker lists them.
 */
export async function seedSeatMap(input: { sessionId: string }): Promise<{
  layoutId: string;
  seatIds: string[];
  cleanup: () => Promise<void>;
}> {
  const sb = isolatedService();
  const venue = must(
    "seedSeatMap/venue",
    await sb.from("spaces").select("venue_id").eq("tenant_id", T).not("venue_id", "is", null).limit(1).maybeSingle(),
  ) as { venue_id: string };
  const locationId = await defaultLocationId();
  const layout = must(
    "seedSeatMap/space_layouts",
    await sb
      .from("space_layouts")
      .insert({ tenant_id: T, location_id: locationId, name: `WIRE seats ${randomUUID().slice(0, 6)}` })
      .select("id")
      .single(),
  ) as { id: string };
  const tag = randomUUID().slice(0, 4).toUpperCase();
  const seats = must(
    "seedSeatMap/spaces",
    await sb
      .from("spaces")
      .insert([
        { tenant_id: T, venue_id: venue.venue_id, location_id: locationId, kind: "seat", code: `W${tag}1`, name: `Seat ${tag}1`, party_min: 1, party_max: 1 },
        { tenant_id: T, venue_id: venue.venue_id, location_id: locationId, kind: "seat", code: `W${tag}2`, name: `Seat ${tag}2`, party_min: 1, party_max: 1 },
      ])
      .select("id"),
  ) as Array<{ id: string }>;
  const seatIds = seats.map((s) => s.id);
  must(
    "seedSeatMap/space_layout_items",
    await sb
      .from("space_layout_items")
      .insert(seatIds.map((id, i) => ({ layout_id: layout.id, space_id: id, x: 10 + i * 40, y: 10, w: 30, h: 30 })))
      .select("id"),
  );
  must(
    "seedSeatMap/event_seat_maps",
    await sb
      .from("event_seat_maps")
      .insert({ tenant_id: T, session_id: input.sessionId, layout_id: layout.id })
      .select("id")
      .single(),
  );
  return {
    layoutId: layout.id,
    seatIds,
    cleanup: async () => {
      await sb.from("admission_holds").delete().in("seat_space_id", seatIds);
      await sb.from("event_seat_maps").delete().eq("session_id", input.sessionId).eq("layout_id", layout.id);
      await sb.from("space_layout_items").delete().eq("layout_id", layout.id);
      await sb.from("space_layouts").delete().eq("id", layout.id);
      await sb.from("spaces").delete().in("id", seatIds);
    },
  };
}

/**
 * A future night on a published, sellable event: a new `sessions` row two
 * days out, with the same tier pools as the event's existing night so the
 * picker offers it. Returns the event's slug for the public page.
 */
export async function seedEventNight(input: { daysOut?: number; hour?: number } = {}): Promise<{
  eventId: string;
  slug: string;
  sessionId: string;
  startsAt: string;
  cleanup: () => Promise<void>;
}> {
  const sb = isolatedService();
  const { data: candidates } = await sb
    .from("sessions")
    .select("id, event_id, venue_id")
    .eq("tenant_id", T)
    .not("event_id", "is", null)
    .order("starts_at", { ascending: false })
    .limit(20);
  let picked: { eventId: string; slug: string; fromSessionId: string; venueId: string | null } | null = null;
  for (const s of (candidates ?? []) as Array<{ id: string; event_id: string; venue_id: string | null }>) {
    const { data: ev } = await sb
      .from("events")
      .select("id, slug, status, offering_id")
      .eq("id", s.event_id)
      .eq("status", "published")
      .not("offering_id", "is", null)
      .maybeSingle();
    if (!ev) continue;
    const { data: offering } = await sb.from("talent_offerings").select("status").eq("id", ev.offering_id as string).maybeSingle();
    if ((offering as { status: string } | null)?.status !== "published") continue;
    const { count } = await sb
      .from("capacity_pools")
      .select("id", { count: "exact", head: true })
      .eq("subject_kind", "session_tier")
      .eq("subject_id", s.id)
      .eq("is_active", true);
    if (!count) continue;
    picked = { eventId: ev.id as string, slug: ev.slug as string, fromSessionId: s.id, venueId: s.venue_id };
    break;
  }
  if (!picked) throw new Error("seedEventNight: no published event with a pooled night to clone");
  const startsAt = new Date(Date.now() + (input.daysOut ?? 2) * 24 * 3600_000);
  startsAt.setUTCHours(input.hour ?? 20, 0, 0, 0);
  const endsAt = new Date(startsAt.getTime() + 2 * 3600_000);
  const session = must(
    "seedEventNight/sessions",
    await sb
      .from("sessions")
      .insert({
        tenant_id: T,
        event_id: picked.eventId,
        venue_id: picked.venueId,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        status: "scheduled",
      })
      .select("id")
      .single(),
  ) as { id: string };
  const pools = must(
    "seedEventNight/pools",
    await sb
      .from("capacity_pools")
      .select("pool_key, units_total, overbook_units, hold_ttl_seconds, unit_label")
      .eq("subject_kind", "session_tier")
      .eq("subject_id", picked.fromSessionId)
      .eq("is_active", true),
  ) as Array<{ pool_key: string; units_total: number; overbook_units: number; hold_ttl_seconds: number; unit_label: string | null }>;
  const inserted = must(
    "seedEventNight/capacity_pools",
    await sb
      .from("capacity_pools")
      .insert(
        pools.map((p) => ({
          tenant_id: T,
          subject_kind: "session_tier",
          subject_id: session.id,
          pool_key: p.pool_key,
          units_total: p.units_total,
          overbook_units: p.overbook_units,
          hold_ttl_seconds: p.hold_ttl_seconds,
          unit_label: p.unit_label,
          is_active: true,
        })),
      )
      .select("id"),
  ) as Array<{ id: string }>;
  return {
    eventId: picked.eventId,
    slug: picked.slug,
    sessionId: session.id,
    startsAt: startsAt.toISOString(),
    cleanup: async () => {
      await sb.from("capacity_allocations").delete().in("pool_id", inserted.map((r) => r.id));
      await sb.from("capacity_pools").delete().in("id", inserted.map((r) => r.id));
      await sb.from("sessions").delete().eq("id", session.id);
    },
  };
}

/** An open table visit (Q01/Q05). `close()` ends it the way the floor does. */
export async function seedVisit(): Promise<{ id: string; token: string; close: () => Promise<void>; cleanup: () => Promise<void> }> {
  const sb = isolatedService();
  // A table with no open visit (`visits_one_open_per_space`); T1 has carried
  // a fixture visit since 2026-09-11.
  const { data: open } = await sb.from("visits").select("space_id").eq("tenant_id", T).eq("status", "open");
  const busy = new Set(((open ?? []) as { space_id: string }[]).map((v) => v.space_id));
  const tables = must(
    "seedVisit/space",
    await sb.from("spaces").select("id").eq("tenant_id", T).eq("kind", "table").eq("status", "active").order("code", { ascending: false }).limit(20),
  ) as { id: string }[];
  const space = tables.find((t) => !busy.has(t.id));
  if (!space) throw new Error("seedVisit: every table has an open visit");
  const token = `wire${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const row = must(
    "seedVisit/visits",
    await sb
      .from("visits")
      .insert({ tenant_id: T, space_id: space.id, public_token: token, status: "open", service_kind: "table", party_size: 2 })
      .select("id")
      .single(),
  ) as { id: string };
  return {
    id: row.id,
    token,
    close: async () => {
      const { error } = await sb.from("visits").update({ status: "closed", closed_at: new Date().toISOString() }).eq("id", row.id);
      if (error) throw new Error(`seedVisit/close: ${error.message}`);
    },
    cleanup: async () => {
      await sb.from("visits").delete().eq("id", row.id);
    },
  };
}

/**
 * A valid admission on the first of three seeded sessions (its own series,
 * `seedSeries`), and a sibling whose pool is set to zero seats so it reads
 * `full`. The series and everything on it go on cleanup.
 */
export async function seedSeriesMove(): Promise<{
  admissionId: string;
  fromSessionId: string;
  openSessionId: string;
  fullSessionId: string;
  cleanup: () => Promise<void>;
}> {
  const sb = isolatedService();
  const series = await seedSeries({ title: `WIRE move ${Date.now()}`, statuses: ["scheduled", "scheduled", "scheduled"], seats: 2 });
  const [from, open, full] = series.sessionIds;
  const pool = must(
    "seedSeriesMove/pool",
    await sb
      .from("capacity_pools")
      .select("id, units_total")
      .eq("tenant_id", T)
      .eq("subject_kind", "session_tier")
      .eq("subject_id", full)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle(),
  ) as { id: string; units_total: number };
  const admission = must(
    "seedSeriesMove/admission",
    await sb
      .from("admissions")
      .insert({ tenant_id: T, session_id: from, status: "valid", party_size: 1, holder_name: "WIRE mover" })
      .select("id")
      .single(),
  ) as { id: string };
  const { error: fullErr } = await sb.from("capacity_pools").update({ units_total: 0 }).eq("id", pool.id);
  if (fullErr) throw new Error(`seedSeriesMove/full: ${fullErr.message}`);
  return {
    admissionId: admission.id,
    fromSessionId: from,
    openSessionId: open,
    fullSessionId: full,
    cleanup: async () => {
      await series.cleanup();
    },
  };
}

/**
 * A named customer with a confirmed appointment tomorrow that still owes its
 * full price (1.5 `POSLinkBooking`). The candidate list matches the booking
 * through the customer's own order (`booking-candidates.ts`), so the seed is
 * three rows: `customers`, an `orders` row for that customer, and the
 * `agency_bookings` row pointing at the order.
 */
export async function seedBookingWithBalance(input: { email: string; revenue?: number }): Promise<{
  customerId: string;
  bookingId: string;
  orderId: string;
  cleanup: () => Promise<void>;
}> {
  const sb = isolatedService();
  const revenue = input.revenue ?? 120;
  const customer = must(
    "seedBookingWithBalance/customers",
    await sb
      .from("customers")
      .insert({ tenant_id: T, email: input.email, display_name: input.email.split("@")[0] })
      .select("id")
      .single(),
  ) as { id: string };
  const order = must(
    "seedBookingWithBalance/orders",
    await sb
      .from("orders")
      .insert({ tenant_id: T, customer_id: customer.id, status: "paid", source_channel: "instant_book", currency: "USD", subtotal_cents: 0, total_cents: 0 })
      .select("id")
      .single(),
  ) as { id: string };
  const startsAt = new Date(Date.now() + 24 * 3600_000);
  startsAt.setUTCMinutes(0, 0, 0);
  const endsAt = new Date(startsAt.getTime() + 3600_000);
  const booking = must(
    "seedBookingWithBalance/agency_bookings",
    await sb
      .from("agency_bookings")
      .insert({
        tenant_id: T,
        title: "WIRE link seed",
        status: "confirmed",
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        currency_code: "USD",
        total_client_revenue: revenue,
        contact_name: input.email.split("@")[0],
        contact_email: input.email,
        order_id: order.id,
      })
      .select("id")
      .single(),
  ) as { id: string };
  return {
    customerId: customer.id,
    bookingId: booking.id,
    orderId: order.id,
    cleanup: async () => {
      await sb.from("agency_bookings").delete().eq("id", booking.id);
      await sb.from("orders").delete().eq("id", order.id);
      await sb.from("customers").delete().eq("id", customer.id);
    },
  };
}

/**
 * Two people waiting on the fixture's next class (1.10 Front desk waitlist).
 * Returns the session, its Front-desk day offset (the desk pages by `day=<n>`
 * from today in the venue's zone), and the entry ids in joined order.
 */
export async function seedClassWaitlist(input: { count: number }): Promise<{
  sessionId: string;
  dayOffset: number;
  entryIds: string[];
  cleanup: () => Promise<void>;
}> {
  const sb = isolatedService();
  const nowIso = new Date().toISOString();
  const { data: session, error: sessionError } = await sb
    .from("sessions")
    .select("id, starts_at")
    .eq("tenant_id", T)
    .eq("status", "scheduled")
    .gt("starts_at", nowIso)
    .order("starts_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (sessionError || !session) throw new Error(`failed-fixture: no upcoming class session (${sessionError?.message ?? "none"})`);
  const s = session as { id: string; starts_at: string };
  const { data: tz } = await sb.from("agencies").select("timezone").eq("id", T).maybeSingle();
  const timeZone = (tz as { timezone: string | null } | null)?.timezone || "UTC";
  const ymd = (iso: string) => {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
    return Date.UTC(Number(parts.slice(0, 4)), Number(parts.slice(5, 7)) - 1, Number(parts.slice(8, 10)));
  };
  const dayOffset = Math.round((ymd(s.starts_at) - ymd(nowIso)) / 86_400_000);
  const stamp = Date.now();
  const rows = Array.from({ length: input.count }, (_, i) => ({
    tenant_id: T,
    session_id: s.id,
    customer_name: `WIRE wait ${i + 1} ${stamp}`,
    customer_email: `wire-wait-${i + 1}-${stamp}@impronta.test`,
    party_size: 1,
    status: "waiting",
    joined_at: new Date(stamp + i * 1000).toISOString(),
  }));
  const inserted = must("seedClassWaitlist/session_waitlist_entries", await sb.from("session_waitlist_entries").insert(rows).select("id")) as { id: string }[];
  const entryIds = inserted.map((r) => r.id);
  return {
    sessionId: s.id,
    dayOffset,
    entryIds,
    cleanup: async () => {
      await sb.from("waitlist_offers").delete().in("waitlist_entry_id", entryIds);
      await sb.from("session_waitlist_entries").delete().in("id", entryIds);
    },
  };
}

export const QA_OWNER_USER = "33330001-0000-4000-8000-000000000001";
export const QA_VIEWER_USER = "33330001-0000-4000-8000-000000000002";
export const QA_VENUE = "33330010-0000-4000-8000-000000000001";

/**
 * A series with sessions on the next days (2.2 / 2.4 scopes). `statuses`
 * lists one status per session, in day order starting tomorrow 06:15Z; a
 * `seats` value also gives each scheduled session a pool (2.3 / 2.4 seats).
 */
export async function seedSeries(input: {
  title: string;
  statuses: ("scheduled" | "cancelled")[];
  seats?: number;
  instructorUserId?: string | null;
}): Promise<{ seriesId: string; sessionIds: string[]; poolIds: string[]; cleanup: () => Promise<void> }> {
  const sb = isolatedService();
  const series = must(
    "seedSeries/session_series",
    await sb
      .from("session_series")
      .insert({
        tenant_id: T,
        venue_id: QA_VENUE,
        title: input.title,
        local_time: "06:15",
        timezone: "UTC",
        duration_minutes: 60,
        weekdays: [1, 2, 3, 4, 5, 6, 7],
        seats: input.seats ?? 4,
        starts_on: new Date().toISOString().slice(0, 10),
        is_active: true,
        instructor_user_id: input.instructorUserId ?? QA_OWNER_USER,
      })
      .select("id")
      .single(),
  ) as { id: string };
  const base = new Date();
  base.setUTCHours(6, 15, 0, 0);
  const rows = input.statuses.map((status, i) => {
    const starts = new Date(base.getTime() + (i + 1) * 86_400_000);
    return {
      id: randomUUID(),
      tenant_id: T,
      series_id: series.id,
      venue_id: QA_VENUE,
      title: `${input.title} ${i + 1}`,
      starts_at: starts.toISOString(),
      ends_at: new Date(starts.getTime() + 3600_000).toISOString(),
      status,
      instructor_user_id: input.instructorUserId ?? QA_OWNER_USER,
    };
  });
  must("seedSeries/sessions", await sb.from("sessions").insert(rows).select("id"));
  const sessionIds = rows.map((r) => r.id);
  const poolIds: string[] = [];
  if (input.seats) {
    for (const r of rows) {
      if (r.status !== "scheduled") continue;
      const poolId = randomUUID();
      const pool = must(
        "seedSeries/capacity_pools",
        await sb
          .from("capacity_pools")
          .insert({ id: poolId, tenant_id: T, subject_kind: "session_tier", subject_id: r.id, pool_key: "seat", pool_path: [poolId], units_total: input.seats, unit_label: "seat", is_active: true })
          .select("id")
          .single(),
      ) as { id: string };
      poolIds.push(pool.id);
    }
  }
  return {
    seriesId: series.id,
    sessionIds,
    poolIds,
    cleanup: async () => {
      await sb.from("admissions").delete().in("session_id", sessionIds);
      await sb.from("capacity_allocations").delete().in("pool_id", poolIds);
      await sb.from("capacity_pools").delete().in("subject_id", sessionIds);
      await sb.from("sessions").delete().in("id", sessionIds);
      await sb.from("session_series").delete().eq("id", series.id);
    },
  };
}
