#!/usr/bin/env node
/**
 * qa-appointments.mjs — prove the appointments engine over HTTP, no browser.
 *
 * WHY THIS EXISTS: the house rule is that agents never browser-QA, so every
 * wave used to end with an unverified engine and a report full of "not
 * clicked". But almost nothing the integrator proved by hand actually needed a
 * browser: fetch the slots endpoint, assert it answers JSON rather than the
 * branded HTML 404, seed a bookable service, watch a hold remove exactly its
 * slot, watch an overlapping hold get refused by Postgres. That is a script.
 *
 *   npm run qa:appointments                 # READ-ONLY, safe anywhere
 *   npm run qa:appointments -- --host https://improntamodels.com
 *   npm run qa:appointments -- --seed --tenant <uuid> --talent <uuid> --i-understand-this-writes-to-the-database
 *
 * ⚠️ SAFETY: local env points at the PRODUCTION database. `--seed` therefore
 * refuses to run without an explicit tenant, an explicit talent, and an
 * explicit confirmation flag. Every row it creates is tagged `QA:` and removed
 * in a finally block, including on failure, and it refuses outright if the
 * talent already has real appointment data.
 */

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? null : args[i + 1] ?? null;
};

const HOST = (value("host") ?? "http://localhost:3000").replace(/\/$/, "");
const TAG = "QA:appointments-harness";

let failures = 0;
const ok = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const bad = (m) => { failures++; console.log(`  \x1b[31m✗\x1b[0m ${m}`); };
const head = (m) => console.log(`\n\x1b[1m${m}\x1b[0m`);

async function get(path) {
  try {
    const res = await fetch(`${HOST}${path}`, { redirect: "manual" });
    const body = await res.text();
    return { status: res.status, body, json: safeJson(body), unreachable: false };
  } catch (err) {
    // A dead host is a legible failure, not a stack trace. Without this, a
    // typo'd --host or a stopped dev server crashes the harness with an
    // unhandled rejection and an exit code nobody can interpret.
    return {
      status: 0,
      body: "",
      json: null,
      unreachable: true,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
function safeJson(t) { try { return JSON.parse(t); } catch { return null; } }
const isHtml = (b) => b.trimStart().startsWith("<!DOCTYPE") || b.trimStart().startsWith("<html");

// ── Read-only assertions ────────────────────────────────────────────────────
async function readOnly() {
  head(`Read-only probes against ${HOST}`);

  const reach = await get("/api/health/guest-chat");
  if (reach.unreachable) {
    bad(`cannot reach ${HOST} (${reach.error}). Start the dev server or pass --host.`);
    return;
  }

  const bogus = await get(
    "/api/public/booking/slots?offering=00000000-0000-0000-0000-000000000000&from=2026-01-05&days=1",
  );
  // The reachability signal: this handler returns JSON in EVERY branch, so an
  // HTML body means the route was never entered (surface allow-list / proxy),
  // not that the offering is missing. That distinction shipped to prod twice.
  if (isHtml(bogus.body)) {
    bad(`slots endpoint answered HTML ${bogus.status} — the route is UNREACHABLE on this host, not merely 404. Check SHARED_API_PREFIXES.`);
  } else if (bogus.json) {
    ok(`slots endpoint reachable and speaks JSON (${bogus.status} ${JSON.stringify(bogus.json).slice(0, 60)})`);
  } else {
    bad(`slots endpoint returned neither JSON nor HTML (${bogus.status})`);
  }

  const malformed = await get("/api/public/booking/slots?offering=not-a-uuid&from=2026-01-05&days=1");
  if (malformed.json?.error === "invalid_offering") ok("malformed offering id → invalid_offering");
  else if (isHtml(malformed.body)) bad("malformed offering id → HTML (unreachable route)");
  else bad(`malformed offering id → unexpected ${malformed.status} ${malformed.body.slice(0, 80)}`);

  if (isHtml(reach.body)) bad("/api/health/guest-chat answered HTML — host gating is misconfigured");
  else ok(`health endpoint reachable (${reach.status})`);
}

// ── Seeded assertions (opt-in, self-cleaning) ───────────────────────────────
async function seeded() {
  const tenantId = value("tenant");
  const talentId = value("talent");
  if (!tenantId || !talentId || !flag("i-understand-this-writes-to-the-database")) {
    console.error(
      "\n--seed requires --tenant <uuid> --talent <uuid> " +
        "--i-understand-this-writes-to-the-database\n" +
        "Local env points at PRODUCTION. Refusing.\n",
    );
    process.exit(2);
  }

  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error("Missing Supabase env; cannot seed."); process.exit(2); }
  const db = createClient(url, key, { auth: { persistSession: false } });

  head("Pre-flight: refusing to touch a talent with real appointment data");
  const [{ count: bookings }, { count: holds }, { count: hours }] = await Promise.all([
    db.from("talent_bookings").select("id", { count: "exact", head: true }).eq("talent_profile_id", talentId),
    db.from("talent_holds").select("id", { count: "exact", head: true }).eq("talent_profile_id", talentId),
    db.from("talent_booking_hours").select("talent_profile_id", { count: "exact", head: true }).eq("talent_profile_id", talentId),
  ]);
  if (bookings || holds || hours) {
    console.error(`  Talent already has ${bookings} bookings, ${holds} holds, ${hours} hours rows. Refusing.`);
    process.exit(2);
  }
  ok("talent has no existing appointment rows");

  const created = { offering: null, hours: false, hold: null, booking: null };
  try {
    head("Seeding a bookable service");
    const { data: off, error: offErr } = await db.from("talent_offerings").insert({
      talent_profile_id: talentId, tenant_id: tenantId, kind: "service",
      title: `${TAG} 30-min service`, description: TAG,
      price_type: "event", price_display: "exact", amount_cents: 1000, currency: "USD",
      booking_mode: "request", reserve_mode: "free", allow_pay_in_person: true,
      duration_minutes: 30, status: "published", visibility: "public", moderation_state: "approved",
    }).select("id").single();
    if (offErr) throw offErr;
    created.offering = off.id;
    ok(`offering ${off.id}`);

    // Weekday keys are 0-6 with startMin/endMin. Anything else parses to an
    // empty week and yields zero slots, silently.
    const { error: hErr } = await db.from("talent_booking_hours").insert({
      talent_profile_id: talentId, tenant_id: tenantId, timezone: "UTC",
      weekly: { 1: [{ startMin: 540, endMin: 660 }], 2: [{ startMin: 540, endMin: 660 }],
                3: [{ startMin: 540, endMin: 660 }], 4: [{ startMin: 540, endMin: 660 }],
                5: [{ startMin: 540, endMin: 660 }] },
      exceptions: [], slot_minutes: 30, buffer_before_min: 0, buffer_after_min: 0,
      min_notice_min: 0, horizon_days: 60,
    });
    if (hErr) throw hErr;
    created.hours = true;
    ok("hours 09:00-11:00 UTC Mon-Fri, 30-minute slots");

    const monday = nextWeekday(1);
    const first = await slots(created.offering, monday);
    if (first.length >= 4) ok(`slots API returned ${first.length} times (${first[0]?.slice(11, 16)}…)`);
    else bad(`expected ≥4 slots, got ${first.length} — a malformed weekly blob yields zero, silently`);

    head("A firm hold removes exactly its own slot");
    const target = first[1];
    if (!target) { bad("no slot to hold"); return; }
    const { data: hold, error: holdErr } = await db.from("talent_holds").insert({
      talent_profile_id: talentId, tenant_id: tenantId, title: `${TAG} hold`,
      starts_at: target, ends_at: new Date(Date.parse(target) + 30 * 60000).toISOString(),
      hold_strength: "firm", expires_at: new Date(Date.now() + 3600_000).toISOString(), all_day: false,
    }).select("id").single();
    if (holdErr) throw holdErr;
    created.hold = hold.id;

    const afterHold = await slots(created.offering, monday);
    if (!afterHold.includes(target) && afterHold.length === first.length - 1) {
      ok(`${first.length} → ${afterHold.length}; ${target.slice(11, 16)} gone, neighbours intact`);
    } else {
      bad(`expected exactly one slot removed; got ${first.length} → ${afterHold.length}`);
    }

    head("An overlapping firm hold is refused by Postgres");
    const { error: dupeErr } = await db.from("talent_holds").insert({
      talent_profile_id: talentId, tenant_id: tenantId, title: `${TAG} overlap`,
      starts_at: new Date(Date.parse(target) + 15 * 60000).toISOString(),
      ends_at: new Date(Date.parse(target) + 45 * 60000).toISOString(),
      hold_strength: "firm", expires_at: new Date(Date.now() + 3600_000).toISOString(), all_day: false,
    });
    if (dupeErr?.code === "23P01") ok("SQLSTATE 23P01 — double-booking impossible at the storage layer");
    else bad(`expected 23P01, got ${dupeErr?.code ?? "no error (SLOT WAS DOUBLE-BOOKED)"}`);

    head("A confirmed booking hides the slot too (one calendar)");
    const bStart = first[3] ?? first[first.length - 1];
    const { data: bk, error: bkErr } = await db.from("talent_bookings").insert({
      talent_profile_id: talentId, tenant_id: tenantId, title: `${TAG} booking`,
      starts_at: bStart, ends_at: new Date(Date.parse(bStart) + 30 * 60000).toISOString(),
      status: "confirmed", all_day: false,
    }).select("id").single();
    if (bkErr) throw bkErr;
    created.booking = bk.id;
    const afterBooking = await slots(created.offering, monday);
    if (!afterBooking.includes(bStart)) ok(`${bStart.slice(11, 16)} removed by the booking mirror`);
    else bad("a confirmed booking did NOT remove its slot — one-calendar is broken");
  } finally {
    head("Cleanup");
    if (created.booking) { await db.from("talent_bookings").delete().eq("id", created.booking); ok("booking deleted"); }
    if (created.hold) { await db.from("talent_holds").delete().eq("id", created.hold); }
    await db.from("talent_holds").delete().eq("talent_profile_id", talentId).like("title", `${TAG}%`);
    ok("holds deleted");
    if (created.hours) { await db.from("talent_booking_hours").delete().eq("talent_profile_id", talentId); ok("hours deleted"); }
    if (created.offering) { await db.from("talent_offerings").delete().eq("id", created.offering); ok("offering deleted"); }
  }

  async function slots(offeringId, fromYmd) {
    const r = await get(`/api/public/booking/slots?offering=${offeringId}&from=${fromYmd}&days=1&cb=${Date.now()}`);
    return r.json?.slots ?? [];
  }
}

function nextWeekday(target) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 7);
  while (d.getUTCDay() !== target) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

const started = Date.now();
// Validate --seed's guard rails BEFORE any network work, so a refusal is
// unambiguous and never mixed with probe failures.
if (flag("seed")) {
  const okToSeed =
    value("tenant") && value("talent") && flag("i-understand-this-writes-to-the-database");
  if (!okToSeed) {
    console.error(
      "\n--seed requires --tenant <uuid> --talent <uuid> " +
        "--i-understand-this-writes-to-the-database\n" +
        "Local env points at PRODUCTION. Refusing.\n",
    );
    process.exit(2);
  }
}
await readOnly();
if (flag("seed")) await seeded();
console.log(
  `\n${failures === 0 ? "\x1b[32mPASS\x1b[0m" : `\x1b[31m${failures} FAILURE(S)\x1b[0m`} ` +
    `in ${((Date.now() - started) / 1000).toFixed(1)}s\n`,
);
process.exit(failures === 0 ? 0 : 1);
