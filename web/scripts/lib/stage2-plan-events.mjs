/**
 * Events on T1 (La Cantina del Puerto) and the weekly class on T5. Every night is an explicit `sessions` row with its own capacity
 * pools (the materialise-sessions cron is idempotent on (series_id, starts_at), so it will not duplicate them).
 *
 *   DJ        12 Fridays 21:00 America/Cancun. Weeks 1-3 free (price phase), then GA 80 + VIP 20 as CHILD pools under a total of 100,
 *             plus a hidden comp tier (child of the same total).
 *   Free      0-price tier, cap 50.
 *   Overnight 22:00 to 02:00 (crosses local midnight).
 *   Pool-of-1 a single chef's table.
 *   New York  weekly Saturdays 21:00 America/New_York, 2026-10-24 .. 2026-11-28: crosses the 2026-11-01 DST change (UTC offset moves, wall clock does not).
 *   Class     weekly Wednesday yoga with an instructor and 12 paid seats (T5).
 * Held-migration check (_pending_pm, all 19 files): none of these tables or columns is in a held file.
 */
import { addDays, nextDow, weekly, ymdOf, zonedWallToUtc } from "./stage2-time.mjs";
import { insert, offeringOp, poolOp, s2Id } from "./stage2-ops.mjs";
import { T1_WS } from "./stage2-plan-t1.mjs";

export const CANCUN = "America/Cancun";
export const NY = "America/New_York";
export const DJ_WEEKS = 12;
export const DJ_FREE_WEEKS = 3;
export const NY_FIRST = "2026-10-24";
export const NY_WEEKS = 6;

/** The event's catalog row + the event row. Tiers are variants of that offering. */
function eventOps(fx, key, ws, e) {
  const ops = [
    offeringOp(fx, `${key}-event`, ws, {
      kind: "package", title: e.title, titleEn: e.titleEn, description: e.description, descriptionEn: e.descriptionEn, category: "Eventos",
      cents: e.cents, currency: e.currency ?? "MXN", sort: e.sort ?? 200,
    }),
    insert(fx, "public.events", `event:${key}`, {
      id: s2Id(`event:${key}`), tenant_id: ws, slug: e.slug, title: e.title, description: e.description, status: "published", published_at: e.at.toISOString(),
      offering_id: s2Id(`offering:${key}-event`), admission_kind: e.admission ?? "ticket", doors_offset_minutes: 30, venue_id: e.venueId ?? null,
      ...(e.seriesKey ? { series_id: s2Id(`series:${e.seriesKey}`) } : {}),
    }),
  ];
  return ops;
}

const tierOp = (fx, key, tag, t, offeringKey) =>
  insert(fx, "public.talent_offering_variants", `variant:${key}-${tag}`, {
    id: s2Id(`variant:${key}-${tag}`), offering_id: s2Id(`offering:${offeringKey}`), label: t.label, amount_cents: t.cents, sort_order: t.sort ?? 0,
    pool_key: t.poolKey, min_per_order: 1, max_per_order: t.max ?? 4, is_hidden: Boolean(t.hidden),
  });

const sessionOp = (fx, key, ws, s) =>
  insert(fx, "public.sessions", `session:${key}`, {
    id: s2Id(`session:${key}`), tenant_id: ws, event_id: s.eventKey ? s2Id(`event:${s.eventKey}`) : null, offering_id: s2Id(`offering:${s.offeringKey}`),
    series_id: s.seriesKey ? s2Id(`series:${s.seriesKey}`) : null, venue_id: s.venueId ?? null, starts_at: s.startsAt, ends_at: s.endsAt, status: "scheduled",
    ...(s.instructor ? { instructor_user_id: s.instructor } : {}),
  });

const seriesOp = (fx, key, ws, s) =>
  insert(fx, "public.session_series", `series:${key}`, {
    id: s2Id(`series:${key}`), tenant_id: ws, venue_id: s.venueId, offering_id: s2Id(`offering:${s.offeringKey}`), title: s.title, local_time: s.localTime,
    duration_minutes: s.minutes, weekdays: [s.dow], seats: s.seats, starts_on: s.dates[0], ends_on: s.dates[s.dates.length - 1], is_active: true, timezone: s.tz,
    ...(s.instructor ? { instructor_user_id: s.instructor } : {}),
  });

const tierPool = (fx, key, ws, sessionKey, t, parentKey = null) =>
  poolOp(fx, `${key}`, ws, { kind: "session_tier", subjectId: s2Id(`session:${sessionKey}`), poolKey: t.poolKey, units: t.units, label: "seat", parentKey });

/** One single-night event with one tier. */
export function singleNight(fx, key, ws, venueId, tz, e) {
  const startsAt = zonedWallToUtc(e.date, e.from, tz);
  const endsAt = zonedWallToUtc(e.endDate ?? e.date, e.to, tz);
  const tier = { label: e.tier, cents: e.cents, poolKey: e.poolKey, max: e.max ?? 4, units: e.seats };
  return [
    ...eventOps(fx, key, ws, { ...e, venueId, cents: e.cents }),
    sessionOp(fx, `${key}-n1`, ws, { eventKey: key, offeringKey: `${key}-event`, venueId, startsAt, endsAt }),
    tierOp(fx, key, "tier", tier, `${key}-event`),
    tierPool(fx, `${key}-n1-${e.poolKey}`, ws, `${key}-n1`, tier),
  ];
}

export function planEvents(at) {
  const fx = "EV";
  const ws = T1_WS;
  const venueA = s2Id("venue:t1-a");
  const venueC = s2Id("venue:t1-c");
  const today = ymdOf(at);
  const ops = [];

  // ---- DJ Fridays: 12 weeks, child pools under a total of 100, hidden comp tier, weeks 1-3 free via price phases
  const fridays = weekly(nextDow(addDays(today, 8), 5), DJ_WEEKS);
  const dj = "dj";
  ops.push(
    ...eventOps(fx, dj, ws, {
      title: "Viernes de DJ", titleEn: "DJ Fridays", slug: "s2-cantina-viernes-dj", description: "Música electrónica en vivo cada viernes.",
      descriptionEn: "Live electronic music every Friday.", cents: 8000, venueId: venueA, seriesKey: dj, at,
    }),
  );
  // The series row must exist before the event row that points at it: move it ahead of the event.
  const eventIdx = ops.findIndex((o) => o.table === "public.events");
  ops.splice(eventIdx, 0, seriesOp(fx, dj, ws, { venueId: venueA, offeringKey: `${dj}-event`, title: "Viernes de DJ", localTime: "21:00", minutes: 240, dow: 5, seats: 100, dates: fridays, tz: CANCUN }));
  const djTiers = [
    { tag: "ga", label: "General", cents: 8000, poolKey: "ga", units: 80, sort: 0 },
    { tag: "vip", label: "VIP", cents: 20000, poolKey: "vip", units: 20, sort: 1 },
    { tag: "cortesia", label: "Lista de cortesía", cents: 0, poolKey: "cortesia_k4", units: 10, sort: 2, hidden: true },
  ];
  for (const t of djTiers) ops.push(tierOp(fx, dj, t.tag, t, `${dj}-event`));
  fridays.forEach((d, i) => {
    const n = i + 1;
    const startsAt = zonedWallToUtc(d, "21:00", CANCUN);
    const endsAt = zonedWallToUtc(addDays(d, 1), "01:00", CANCUN);
    ops.push(sessionOp(fx, `${dj}-w${n}`, ws, { eventKey: dj, offeringKey: `${dj}-event`, seriesKey: dj, venueId: venueA, startsAt, endsAt }));
    ops.push(poolOp(fx, `${dj}-w${n}-total`, ws, { kind: "session_tier", subjectId: s2Id(`session:${dj}-w${n}`), poolKey: "total", units: 100, label: "seat" }));
    for (const t of djTiers) ops.push(tierPool(fx, `${dj}-w${n}-${t.tag}`, ws, `${dj}-w${n}`, t, `${dj}-w${n}-total`));
  });
  // Weeks 1-3 free, then GA 80 pesos: two phases on the GA tier (per-occurrence pricing itself is Phase 4, G4.6; this is what exists today).
  const week4 = zonedWallToUtc(fridays[DJ_FREE_WEEKS], "00:00", CANCUN);
  ops.push(
    insert(fx, "public.offering_price_phases", `phase:${dj}-ga-free`, {
      id: s2Id(`phase:${dj}-ga-free`), tenant_id: ws, offering_id: s2Id(`offering:${dj}-event`), variant_id: s2Id(`variant:${dj}-ga`), label: "Entrada libre",
      starts_at: addDays(today, -1) + "T00:00:00.000Z", ends_at: week4, price_cents: 0,
    }),
    insert(fx, "public.offering_price_phases", `phase:${dj}-ga-paid`, {
      id: s2Id(`phase:${dj}-ga-paid`), tenant_id: ws, offering_id: s2Id(`offering:${dj}-event`), variant_id: s2Id(`variant:${dj}-ga`), label: "General",
      starts_at: week4, ends_at: null, price_cents: 8000,
    }),
  );

  // ---- Free event, overnight, pool-of-1
  ops.push(
    ...singleNight(fx, "libre", ws, venueA, CANCUN, {
      title: "Tertulia de música", titleEn: "Music gathering", slug: "s2-cantina-tertulia", description: "Entrada libre con registro.", descriptionEn: "Free entry with registration.",
      admission: "registration", date: addDays(today, 10), from: "19:00", to: "21:00", tier: "Registro libre", cents: 0, poolKey: "registro", seats: 50, at,
    }),
    ...singleNight(fx, "noche", ws, venueA, CANCUN, {
      title: "Noche larga", titleEn: "Long night", slug: "s2-cantina-noche-larga", description: "De las 22:00 a las 02:00.", descriptionEn: "From 10 pm to 2 am.",
      date: addDays(today, 14), endDate: addDays(today, 15), from: "22:00", to: "02:00", tier: "General", cents: 5000, poolKey: "ga", seats: 60, at,
    }),
    ...singleNight(fx, "chef", ws, venueA, CANCUN, {
      title: "Cena en la mesa del chef", titleEn: "Chef's table dinner", slug: "s2-cantina-cena-chef", description: "Una sola mesa, una sola noche.", descriptionEn: "One table, one night.",
      date: addDays(today, 20), from: "20:00", to: "23:00", tier: "Mesa del chef", cents: 150000, poolKey: "mesa", seats: 1, max: 1, at,
    }),
  );

  // ---- New York series crossing the 2026-11-01 DST change (venue C, USD)
  const ny = "ny";
  const nyDates = weekly(NY_FIRST, NY_WEEKS);
  ops.push(
    offeringOp(fx, `${ny}-event`, ws, {
      kind: "package", title: "Sábados en Nueva York", titleEn: "New York Saturdays", description: "Música en vivo cada sábado.", descriptionEn: "Live music every Saturday.",
      category: "Eventos", cents: 4000, currency: "USD", sort: 210,
    }),
    seriesOp(fx, ny, ws, { venueId: venueC, offeringKey: `${ny}-event`, title: "Sábados en Nueva York", localTime: "21:00", minutes: 120, dow: 6, seats: 40, dates: nyDates, tz: NY }),
    insert(fx, "public.events", `event:${ny}`, {
      id: s2Id(`event:${ny}`), tenant_id: ws, slug: "s2-cantina-sabados-ny", title: "Sábados en Nueva York", description: "Música en vivo cada sábado.", status: "published",
      published_at: at.toISOString(), offering_id: s2Id(`offering:${ny}-event`), admission_kind: "ticket", doors_offset_minutes: 30, venue_id: venueC, series_id: s2Id(`series:${ny}`),
    }),
  );
  const nyTier = { label: "General", cents: 4000, poolKey: "general_ny", units: 40, max: 4 };
  ops.push(tierOp(fx, ny, "tier", nyTier, `${ny}-event`));
  nyDates.forEach((d, i) => {
    const key = `${ny}-w${i + 1}`;
    ops.push(sessionOp(fx, key, ws, { eventKey: ny, offeringKey: `${ny}-event`, seriesKey: ny, venueId: venueC, startsAt: zonedWallToUtc(d, "21:00", NY), endsAt: zonedWallToUtc(d, "23:00", NY) }));
    ops.push(tierPool(fx, `${key}-general_ny`, ws, key, nyTier));
  });
  return ops;
}

/** Weekly yoga class on T5: instructor + 12 paid seats, 8 Wednesdays 08:00 America/Cancun. */
export function planClass(ws, venueId, at) {
  const fx = "T5";
  const key = "clase";
  const instructor = s2Id("user:t5-instructor");
  const dates = weekly(nextDow(addDays(ymdOf(at), 3), 3), 8);
  const ops = [
    offeringOp(fx, `${key}-oferta`, ws, {
      kind: "service", title: "Clase de yoga", titleEn: "Yoga class", description: "Clase semanal de una hora con instructora.", descriptionEn: "Weekly one-hour class with an instructor.",
      category: "Clases", cents: 25000, bookingMode: "instant", sort: 10, extra: { duration_minutes: 60 },
    }),
    seriesOp(fx, key, ws, { venueId, offeringKey: `${key}-oferta`, title: "Clase de yoga", localTime: "08:00", minutes: 60, dow: 3, seats: 12, dates, tz: CANCUN, instructor }),
  ];
  dates.forEach((d, i) => {
    const sk = `${key}-w${i + 1}`;
    ops.push(sessionOp(fx, sk, ws, { offeringKey: `${key}-oferta`, seriesKey: key, venueId, startsAt: zonedWallToUtc(d, "08:00", CANCUN), endsAt: zonedWallToUtc(d, "09:00", CANCUN), instructor }));
    ops.push(poolOp(fx, `${sk}-default`, ws, { kind: "session_tier", subjectId: s2Id(`session:${sk}`), poolKey: "default", units: 12, label: "seat" }));
  });
  return ops;
}
