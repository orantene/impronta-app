/**
 * proof-appointments-journey.ts — the P3 waitlist and reschedule journeys,
 * driven end to end against the isolated `qa-journeys` Supabase branch.
 *
 * WHY THIS EXISTS. Everything in this slice type-checked and every unit test
 * passed while the waitlist journey was dead: the loader built its list of
 * sessions out of waitlist rows that already existed, so the control that adds
 * the FIRST person never rendered, and the join action had no reachable
 * caller. No gate could see it, because a fixture that presupposes the row
 * exists never asks how the row got there.
 *
 * So this script starts from nothing. It creates a workspace, a class, and
 * sells its only seat; then it calls THE SAME FUNCTIONS THE SCREEN CALLS —
 * `loadWaitlistDesk`, `joinWaitlist`, `promoteWaitlistEntry`,
 * `rescheduleWithNames` — and prints the rows after every step. Not a copy of
 * them, and not SQL that stands in for them: the modules the server actions
 * delegate to, imported here.
 *
 * WHAT IT PROVES
 *   1  a class that just sold out appears on the desk with an empty queue
 *   2  the first person can be added to that queue
 *   3  a free seat is refused: sell it, do not queue for it
 *   4  a duplicate email is refused
 *   5  a nameless person is refused
 *   6  a session whose seats were never set is refused
 *   7  promoting while the class is full is refused, and says how many are held
 *   8  a released seat can be offered, with a window
 *   9  a live offer holds that seat against a second promote
 *  10  a stale screen cannot promote (conflict)
 *  11  the class an operator opened by name is shown even when it is not full
 *  12  a capped read says so, instead of looking like a workspace with nothing full
 *  13  a reschedule onto an occupied person is refused BY NAME
 *  14  a reschedule from a stale window is refused (conflict)
 *
 * SAFETY. It refuses to run against anything but the isolated branch, and it
 * deletes the workspace it created on the way out, including after a failure.
 *
 *   node --env-file=.env.capacity-isolated.local \
 *     --import tsx scripts/proof-appointments-journey.ts
 *
 * Exit codes: 0 every assertion held, 1 an assertion failed, 2 refused.
 */

import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  belongsOnWaitlistDesk,
  joinWaitlist,
  loadWaitlistDesk,
} from "@/lib/scheduling/waitlist-desk";
import { promoteWaitlistEntry } from "@/lib/scheduling/session-waitlist";
import { rescheduleWithNames } from "@/lib/scheduling/reschedule-desk";

/* ── refuse anything that is not the isolated branch ───────────────────────── */

const QA_JOURNEYS_PROJECT_REF = "fxlankepwnvelxjrahwk";
const PRODUCTION_PROJECT_REF = "pluhdapdnuiulvxmyspd";

function refuse(message: string): never {
  console.error(`[proof] refusing: ${message}`);
  process.exit(2);
}

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
if (!url || !serviceKey) refuse("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
if (url.includes(PRODUCTION_PROJECT_REF)) refuse("that is production.");
if (!url.includes(QA_JOURNEYS_PROJECT_REF)) {
  refuse(`only the isolated ${QA_JOURNEYS_PROJECT_REF} branch may be written to.`);
}
if ((process.env.SUPABASE_PROJECT_REF ?? "").trim() !== QA_JOURNEYS_PROJECT_REF) {
  refuse("SUPABASE_PROJECT_REF does not name the isolated branch.");
}

const admin: SupabaseClient = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/* ── tiny harness ──────────────────────────────────────────────────────────── */

let checks = 0;
let failures = 0;

function ok(label: string, passed: boolean, detail: unknown = "") {
  checks += 1;
  if (!passed) failures += 1;
  const shown = detail === "" ? "" : `  ${typeof detail === "string" ? detail : JSON.stringify(detail)}`;
  console.log(`  ${passed ? "PASS" : "FAIL"}  ${label}${shown}`);
}

/** Postgres renders `+00:00` and JS renders `Z`; the instant is what matters. */
function sameInstant(a: string, b: string): boolean {
  return Date.parse(a) === Date.parse(b);
}

function step(title: string) {
  console.log(`\n── ${title} ${"─".repeat(Math.max(0, 66 - title.length))}`);
}

/** Print the queue exactly as it is stored, so each step can be seen. */
async function dumpQueue(tenantId: string, label: string) {
  const { data, error } = await admin
    .from("session_waitlist_entries")
    .select("customer_name, customer_email, status, offer_expires_at")
    .eq("tenant_id", tenantId)
    .order("joined_at", { ascending: true });
  if (error) throw error;
  console.log(`    rows after ${label}:`, JSON.stringify(data));
}

async function seatsLeft(poolId: string, startsAt: string, endsAt: string): Promise<number | null> {
  const { data, error } = await admin.rpc("capacity_remaining_public", {
    p_pool_id: poolId,
    p_starts_at: startsAt,
    p_ends_at: endsAt,
  });
  if (error) throw error;
  return typeof data === "number" ? data : null;
}

/* ── the fixture ───────────────────────────────────────────────────────────── */

const SLUG = `p3-proof-${randomUUID().slice(0, 8)}`;
/**
 * A REAL auth user, not a random uuid.
 *
 * `talent_holds.created_by_user_id` references `auth.users`, and the guard hold
 * the reschedule takes carries the actor. A made-up id raises a foreign key
 * violation inside the RPC, which its `WHEN OTHERS` maps to `unavailable` — so
 * a fake actor would have made the whole reschedule leg refuse for a reason
 * that has nothing to do with what is being proven. The screen always has a
 * signed-in staff member; so does this.
 */
let ACTOR = "";
/** `talent_profiles` is global, not tenant-scoped, so it is cleaned up by id. */
const createdTalentIds: string[] = [];

type Fixture = {
  tenantId: string;
  fullSessionId: string;
  fullPoolId: string;
  fullAllocationId: string;
  startsAt: string;
  endsAt: string;
  openSessionId: string;
  uncountedSessionId: string;
};

/** The id an insert gave back, narrowed rather than asserted. */
function idOf(row: unknown, table: string): string {
  if (typeof row === "object" && row !== null && "id" in row && typeof row.id === "string") {
    return row.id;
  }
  throw new Error(`${table}: the insert returned no id`);
}

/** The `starts_at` of a row read back, narrowed rather than asserted. */
function startsAtOf(row: unknown): string {
  if (
    typeof row === "object" &&
    row !== null &&
    "starts_at" in row &&
    typeof row.starts_at === "string"
  ) {
    return row.starts_at;
  }
  throw new Error("that row carries no starts_at");
}

async function insertOne(table: string, row: Record<string, unknown>): Promise<string> {
  const { data, error } = await admin.from(table).insert([row]).select("id").single();
  if (error) throw new Error(`${table}: ${error.message}`);
  return idOf(data, table);
}

async function build(): Promise<Fixture> {
  const { data: created, error: userErr } = await admin.auth.admin.createUser({
    email: `${SLUG}@example.test`,
    password: randomUUID(),
    email_confirm: true,
  });
  if (userErr || !created.user) throw new Error(`auth user: ${userErr?.message ?? "no user"}`);
  ACTOR = created.user.id;

  const startsAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
  const endsAt = new Date(Date.now() + 7 * 86_400_000 + 3_600_000).toISOString();

  const tenantId = await insertOne("agencies", {
    slug: SLUG,
    display_name: "P3 Appointments Proof",
    timezone: "America/Bogota",
  });

  const fullSessionId = await insertOne("sessions", {
    tenant_id: tenantId,
    title: "Tuesday posing class",
    starts_at: startsAt,
    ends_at: endsAt,
    status: "scheduled",
  });
  const poolId = await insertOne("capacity_pools", {
    tenant_id: tenantId,
    subject_kind: "session_tier",
    subject_id: fullSessionId,
    pool_key: "default",
    units_total: 1,
  });
  const allocationId = await insertOne("capacity_allocations", {
    tenant_id: tenantId,
    pool_id: poolId,
    pool_path: [poolId],
    starts_at: startsAt,
    ends_at: endsAt,
    units: 1,
    state: "committed",
  });

  // A second class with a seat still on it, and a third nobody ever counted.
  const openSessionId = await insertOne("sessions", {
    tenant_id: tenantId,
    title: "Thursday posing class",
    starts_at: startsAt,
    ends_at: endsAt,
    status: "scheduled",
  });
  await insertOne("capacity_pools", {
    tenant_id: tenantId,
    subject_kind: "session_tier",
    subject_id: openSessionId,
    pool_key: "default",
    units_total: 4,
  });
  const uncountedSessionId = await insertOne("sessions", {
    tenant_id: tenantId,
    title: "Saturday open studio",
    starts_at: startsAt,
    ends_at: endsAt,
    status: "scheduled",
  });

  return {
    tenantId,
    fullSessionId,
    fullPoolId: poolId,
    fullAllocationId: allocationId,
    startsAt,
    endsAt,
    openSessionId,
    uncountedSessionId,
  };
}

async function tearDown(tenantId: string) {
  for (const table of [
    "talent_holds",
    "talent_bookings",
    "agency_bookings",
    "session_waitlist_entries",
    "inquiries",
    "capacity_allocations",
    "capacity_pools",
    "sessions",
  ]) {
    const { error } = await admin.from(table).delete().eq("tenant_id", tenantId);
    if (error) console.error(`    cleanup ${table}: ${error.message}`);
  }
  if (createdTalentIds.length > 0) {
    const { error } = await admin.from("talent_profiles").delete().in("id", createdTalentIds);
    if (error) console.error(`    cleanup talent_profiles: ${error.message}`);
  }
  const { error } = await admin.from("agencies").delete().eq("id", tenantId);
  if (error) console.error(`    cleanup agencies: ${error.message}`);
  if (ACTOR) {
    const { error: userErr } = await admin.auth.admin.deleteUser(ACTOR);
    if (userErr) console.error(`    cleanup auth user: ${userErr.message}`);
  }
}

/* ── the waitlist journey ──────────────────────────────────────────────────── */

async function waitlistJourney(fx: Fixture) {
  step("1. a class that just sold out, with NOBODY on its queue");
  console.log(`    seats left on the full class: ${await seatsLeft(fx.fullPoolId, fx.startsAt, fx.endsAt)}`);
  await dumpQueue(fx.tenantId, "nothing at all");

  const desk = await loadWaitlistDesk(admin, fx.tenantId, new Date());
  ok("the desk read succeeded", desk.ok);
  if (!desk.ok) return;

  const full = desk.sessions.find((s) => s.sessionId === fx.fullSessionId);
  ok(
    "the full class is ON the desk although its queue is empty",
    Boolean(full) && full!.entries.length === 0,
    full ? { title: full.sessionTitle, seats: full.seats, entries: full.entries.length } : "absent",
  );
  ok(
    "the class that still has seats is NOT on the desk",
    !desk.sessions.some((s) => s.sessionId === fx.openSessionId),
  );
  ok(
    "the class whose seats were never set is NOT on the desk",
    !desk.sessions.some((s) => s.sessionId === fx.uncountedSessionId),
  );
  ok("nothing was silently dropped for an unreadable seat count", desk.unreadableSessions === 0);

  step("2. the first person joins that queue, through the screen's own action");
  const first = await joinWaitlist(admin, {
    tenantId: fx.tenantId,
    sessionId: fx.fullSessionId,
    customerName: "Ana Rivas",
    customerEmail: "ana@example.test",
  });
  ok("the first person was added", first.ok, first);
  await dumpQueue(fx.tenantId, "the first join");
  if (!first.ok) return;

  const second = await joinWaitlist(admin, {
    tenantId: fx.tenantId,
    sessionId: fx.fullSessionId,
    customerName: "Bruno Pena",
    customerEmail: "bruno@example.test",
  });
  ok("a second person joined behind them", second.ok, second);
  await dumpQueue(fx.tenantId, "the second join");
  if (!second.ok) return;

  step("3. the refusals on the way in");
  const onOpen = await joinWaitlist(admin, {
    tenantId: fx.tenantId,
    sessionId: fx.openSessionId,
    customerName: "Carla Soto",
    customerEmail: "carla@example.test",
  });
  ok(
    "a class with seats left refuses a queue and says how many are free",
    !onOpen.ok && onOpen.refusalKey === "seatsAvailable" && onOpen.seatsRemaining === 4,
    onOpen,
  );

  const duplicate = await joinWaitlist(admin, {
    tenantId: fx.tenantId,
    sessionId: fx.fullSessionId,
    customerName: "Ana Rivas again",
    customerEmail: "ANA@example.test",
  });
  ok(
    "the same email cannot hold two live places",
    !duplicate.ok && duplicate.refusalKey === "alreadyWaiting",
    duplicate,
  );

  const nameless = await joinWaitlist(admin, {
    tenantId: fx.tenantId,
    sessionId: fx.fullSessionId,
    customerName: "   ",
    customerEmail: "nobody@example.test",
  });
  ok(
    "somebody nobody can call is refused",
    !nameless.ok && nameless.refusalKey === "nameRequired",
    nameless,
  );

  const uncounted = await joinWaitlist(admin, {
    tenantId: fx.tenantId,
    sessionId: fx.uncountedSessionId,
    customerName: "Dora Melo",
    customerEmail: "dora@example.test",
  });
  ok(
    "a session whose seats were never set refuses a queue nothing could promote from",
    !uncounted.ok && uncounted.refusalKey === "noSeatsSet",
    uncounted,
  );
  await dumpQueue(fx.tenantId, "the four refusals");

  step("4. promoting while the class is still full");
  const firstEntryId = first.entryId;
  const secondEntryId = second.entryId;
  const tooEarly = await promoteWaitlistEntry(admin, {
    tenantId: fx.tenantId,
    entryId: firstEntryId,
    actorUserId: ACTOR,
    expectedStatus: "waiting",
  });
  ok(
    "no seat, no offer",
    !tooEarly.ok && tooEarly.reason === "session_full",
    tooEarly,
  );

  step("5. a seat comes back, and the first person is offered it");
  const { error: releaseErr } = await admin
    .from("capacity_allocations")
    .update({ state: "released", released_at: new Date().toISOString() })
    .eq("id", fx.fullAllocationId);
  if (releaseErr) throw releaseErr;
  console.log(`    seats left after the release: ${await seatsLeft(fx.fullPoolId, fx.startsAt, fx.endsAt)}`);

  const offered = await promoteWaitlistEntry(admin, {
    tenantId: fx.tenantId,
    entryId: firstEntryId,
    actorUserId: ACTOR,
    expectedStatus: "waiting",
  });
  ok("the freed place was offered", offered.ok && !offered.already, offered);
  await dumpQueue(fx.tenantId, "the promote");

  step("6. the offer holds the seat, and a stale screen cannot promote");
  console.log(
    `    the POOL still reports free: ${await seatsLeft(fx.fullPoolId, fx.startsAt, fx.endsAt)} (an offer is not an allocation)`,
  );
  const secondPromote = await promoteWaitlistEntry(admin, {
    tenantId: fx.tenantId,
    entryId: secondEntryId,
    actorUserId: ACTOR,
    expectedStatus: "waiting",
  });
  ok(
    "the live offer holds that one seat against the next person",
    !secondPromote.ok &&
      secondPromote.reason === "session_full" &&
      secondPromote.outstandingOffers === 1,
    secondPromote,
  );

  const stale = await promoteWaitlistEntry(admin, {
    tenantId: fx.tenantId,
    entryId: firstEntryId,
    actorUserId: ACTOR,
    // The screen still says "waiting"; the row says "offered".
    expectedStatus: "waiting",
  });
  ok(
    "a screen left open cannot promote a row that has moved on",
    !stale.ok && stale.reason === "conflict" && stale.refusalKey === "changedSinceOpened",
    stale,
  );

  step("7. the desk now shows the queue it started with nothing");
  const after = await loadWaitlistDesk(admin, fx.tenantId, new Date());
  ok("the desk still reads", after.ok);
  if (!after.ok) return;
  const card = after.sessions.find((s) => s.sessionId === fx.fullSessionId);
  ok(
    "two people, numbered, with the offer visible and the next in line named",
    Boolean(card) &&
      card!.entries.length === 2 &&
      card!.entries[0]!.position === 1 &&
      card!.entries[0]!.state === "offered" &&
      card!.entries[1]!.state === "waiting",
    card
      ? card.entries.map((e) => ({
          position: e.position,
          name: e.customerName,
          state: e.state,
          holdsUntil: e.offerExpiresAt,
        }))
      : "absent",
  );
  step("7b. the door from the Sessions view, and a capped read");
  const asked = await loadWaitlistDesk(admin, fx.tenantId, new Date(), {
    alwaysInclude: fx.openSessionId,
  });
  ok("the desk reads with a session named", asked.ok);
  if (asked.ok) {
    ok(
      "a class with seats left IS shown when the operator opened it by name",
      asked.sessions.some((s) => s.sessionId === fx.openSessionId),
      asked.sessions.map((s) => ({ id: s.sessionId, title: s.sessionTitle, seats: s.seats })),
    );
    ok("and an uncapped read is not reported as capped", asked.truncated === false, {
      truncated: asked.truncated,
      checkedAhead: asked.checkedAhead,
    });
  }

  const capped = await loadWaitlistDesk(admin, fx.tenantId, new Date(), { candidateLimit: 1 });
  ok("the desk reads with a cap of one", capped.ok);
  if (capped.ok) {
    // Three upcoming sessions exist; one was examined. The old shape had no way
    // to say this, so a workspace with more classes than the cap would have
    // read as a workspace with nothing full in it.
    ok(
      "a capped read says it was capped, and names the number it checked",
      capped.truncated === true && capped.checkedAhead === 1,
      { truncated: capped.truncated, checkedAhead: capped.checkedAhead },
    );
  }

  ok(
    "the pure rule agrees the empty-queue full class belongs here",
    belongsOnWaitlistDesk({
      hasEntries: false,
      seats: { kind: "counted", total: 1, remaining: 0 },
    }) === true &&
      belongsOnWaitlistDesk({
        hasEntries: false,
        seats: { kind: "counted", total: 4, remaining: 4 },
      }) === false,
  );
}

/* ── the reschedule journey ────────────────────────────────────────────────── */

async function rescheduleJourney(fx: Fixture) {
  step("8. a reschedule that collides with the person already booked");

  const suffix = randomUUID().slice(0, 8);
  const talentId = await insertOne("talent_profiles", {
    display_name: "Ana Rivas",
    profile_code: `P3${suffix.toUpperCase()}`,
  });
  createdTalentIds.push(talentId);

  const movingStart = new Date(Date.now() + 10 * 86_400_000).toISOString();
  const movingEnd = new Date(Date.now() + 10 * 86_400_000 + 3_600_000).toISOString();
  const occupiedStart = new Date(Date.now() + 11 * 86_400_000).toISOString();
  const occupiedEnd = new Date(Date.now() + 11 * 86_400_000 + 3_600_000).toISOString();

  const movingInquiry = await insertOne("inquiries", {
    tenant_id: fx.tenantId,
    source_workspace_id: fx.tenantId,
    contact_name: "Bruno Pena",
    contact_email: "bruno@example.test",
  });
  // The job somebody else already has Ana for.
  const otherInquiry = await insertOne("inquiries", {
    tenant_id: fx.tenantId,
    source_workspace_id: fx.tenantId,
    contact_name: "Another client",
    contact_email: "other@example.test",
  });
  const bookingId = await insertOne("agency_bookings", {
    tenant_id: fx.tenantId,
    title: "Portrait session",
    status: "confirmed",
    starts_at: movingStart,
    ends_at: movingEnd,
    source_inquiry_id: movingInquiry,
    contact_name: "Bruno Pena",
  });
  await insertOne("talent_bookings", {
    tenant_id: fx.tenantId,
    talent_profile_id: talentId,
    inquiry_id: movingInquiry,
    title: "Portrait session",
    starts_at: movingStart,
    ends_at: movingEnd,
    status: "confirmed",
  });

  // Somebody else already holds Ana at the destination.
  await insertOne("talent_holds", {
    tenant_id: fx.tenantId,
    talent_profile_id: talentId,
    inquiry_id: otherInquiry,
    title: "Held for another job",
    starts_at: occupiedStart,
    ends_at: occupiedEnd,
    hold_strength: "firm",
  });

  const collided = await rescheduleWithNames(admin, {
    tenantId: fx.tenantId,
    bookingId,
    newStartsAt: occupiedStart,
    newEndsAt: occupiedEnd,
    actorUserId: ACTOR,
    expectedStartsAt: movingStart,
    expectedEndsAt: movingEnd,
  });
  ok(
    "the refusal NAMES the person who was in the way",
    !collided.ok &&
      collided.refusal.key === "slotTakenNamed" &&
      collided.refusal.params.person === "Ana Rivas",
    collided,
  );

  const { data: unmoved } = await admin
    .from("agency_bookings")
    .select("starts_at, ends_at")
    .eq("id", bookingId)
    .single();
  ok(
    "the refused move left the booking where it was",
    sameInstant(startsAtOf(unmoved), movingStart),
    unmoved,
  );

  step("9. a reschedule from a window the operator is no longer looking at");
  const freeStart = new Date(Date.now() + 12 * 86_400_000).toISOString();
  const freeEnd = new Date(Date.now() + 12 * 86_400_000 + 3_600_000).toISOString();
  const staleMove = await rescheduleWithNames(admin, {
    tenantId: fx.tenantId,
    bookingId,
    newStartsAt: freeStart,
    newEndsAt: freeEnd,
    actorUserId: ACTOR,
    // What a colleague's screen showed an hour ago, not what is stored.
    expectedStartsAt: new Date(Date.now() + 9 * 86_400_000).toISOString(),
    expectedEndsAt: new Date(Date.now() + 9 * 86_400_000 + 3_600_000).toISOString(),
  });
  ok(
    "a stale window is refused rather than overwriting a colleague's move",
    !staleMove.ok && staleMove.refusal.key === "changedSinceOpened",
    staleMove,
  );

  const { data: stillUnmoved } = await admin
    .from("agency_bookings")
    .select("starts_at")
    .eq("id", bookingId)
    .single();
  ok(
    "and it too left the booking alone",
    sameInstant(startsAtOf(stillUnmoved), movingStart),
    stillUnmoved,
  );

  step("10. the same move, with the window the operator really was looking at");
  const goodMove = await rescheduleWithNames(admin, {
    tenantId: fx.tenantId,
    bookingId,
    newStartsAt: freeStart,
    newEndsAt: freeEnd,
    actorUserId: ACTOR,
    expectedStartsAt: movingStart,
    expectedEndsAt: movingEnd,
  });
  ok("the booking moved", goodMove.ok, goodMove);

  const { data: mirror } = await admin
    .from("talent_bookings")
    .select("starts_at, ends_at")
    .eq("inquiry_id", movingInquiry)
    .single();
  ok(
    "and its talent mirror moved with it, in the same transaction",
    sameInstant(startsAtOf(mirror), freeStart),
    mirror,
  );
}

/* ── run ───────────────────────────────────────────────────────────────────── */

async function main(): Promise<never> {
  console.log(`[proof] isolated branch ${QA_JOURNEYS_PROJECT_REF}, throwaway workspace ${SLUG}`);

  let fixture: Fixture | null = null;
  try {
    fixture = await build();
    console.log(`[proof] tenant ${fixture.tenantId}`);
    await waitlistJourney(fixture);
    await rescheduleJourney(fixture);
  } catch (err) {
    failures += 1;
    console.error("\n[proof] threw:", err instanceof Error ? err.message : String(err));
  } finally {
    if (fixture) {
      step("cleanup");
      await tearDown(fixture.tenantId);
      console.log("    the throwaway workspace is gone");
    }
  }

  console.log(`\n[proof] ${checks - failures}/${checks} checks passed`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
