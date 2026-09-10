/**
 * The floor journey, run against the isolated `qa-journeys` branch.
 *
 * WHY THIS EXISTS. The floor's four headline behaviours — the three states,
 * party fit, joining two tables, and needs-reset after a move — were proven
 * only against the in-memory PostgREST double in `lib/visits/*.test.ts`. A
 * double agrees with whatever the code expects; it cannot tell you the QA
 * host has one table on it, no combinations, and not one admission carrying a
 * space, which is exactly what it had. So this walks the same journey a host
 * walks, through THE SAME FUNCTIONS the screens call — `listFloor`,
 * `openVisit`, `markReservationSeated`, `moveVisitToSpace`, `resetTable`,
 * `closeVisit` — against real rows.
 *
 * IT IS NOT A UNIT TEST AND DOES NOT REPLACE ONE. It answers a different
 * question: does the environment the journey runs in contain the facts the
 * journey needs?
 *
 *   JOURNEYS_ISOLATED=1 NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' \
 *     npx tsx --env-file=.env.capacity-isolated.local scripts/journey-tables-isolated.mts
 *
 * CLEANUP IS UNCONDITIONAL. Every visit and order this script opens is removed
 * in a `finally`, and the admissions it checks in are restored to the state the
 * fixture seeded, so the branch is left exactly as it was found. It refuses to
 * run anywhere but the isolated branch before it opens a socket.
 *
 * Exit codes: 0 every step held, 1 a step failed, 2 refused.
 */

import { createClient } from "@supabase/supabase-js";
import { assertIsolatedJourneysTarget, JOURNEYS_TENANT_ID } from "./isolated-target-guard.mjs";
import { listFloor } from "../src/lib/visits/floor";
import { closeVisit, moveVisitToSpace, openVisit, resetTable } from "../src/lib/visits/commands";
import { markReservationSeated } from "../src/lib/visits/seat-reservation";
import { planWalkIn } from "../src/lib/reservations";
import { loadVenueServiceConfig, seatWalkIn } from "../src/lib/reservations/store";
import { loadDefaultVenue } from "../src/lib/spaces/venues";
import { venueHhmm, venueZoneLabel } from "../src/lib/spaces/venue-clock";
import { tenantTimezone } from "../src/lib/spaces/venues";

assertIsolatedJourneysTarget(process.env, { requireIsolatedFlag: true });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !key) {
  console.error("[journey] NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(2);
}
const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const TENANT = JOURNEYS_TENANT_ID;
/** A fixture staff id is not needed: `opened_by` is nullable and this is a fixture run. */
const ACTOR: string | null = null;

let failures = 0;
function ok(label: string, passed: boolean, detail = "") {
  console.log(`  ${passed ? "PASS" : "FAIL"}  ${label}${detail ? `  ${detail}` : ""}`);
  if (!passed) failures += 1;
}

const openedVisitIds: string[] = [];
const checkedInAdmissionIds: string[] = [];
/** Only spaces this run actually dirtied are cleaned; other rows are left alone. */
const touchedSpaceIds = new Set<string>();
/** Walk-ins this run created. Deleted outright: the fixture did not seed them. */
const walkInAdmissionIds: string[] = [];

/** The floor as the Tables screen reads it, indexed by the code a host sees. */
async function floorByCode() {
  const floor = await listFloor(admin, TENANT);
  if (!floor.ok) throw new Error("listFloor refused: unavailable");
  const byCode = new Map(floor.tables.map((t) => [t.code ?? t.name, t]));
  return { tables: floor.tables, byCode };
}

async function main() {
  console.log("\n=== FLOOR JOURNEY — isolated qa-journeys ===\n");

  const timeZone = await tenantTimezone(TENANT);
  console.log(`  venue zone: ${venueZoneLabel(timeZone, "en", new Date())}\n`);

  // ── 1. The floor is a floor, not a card ────────────────────────────────────
  let { tables, byCode } = await floorByCode();
  ok("the floor has more than one table", tables.length > 1, `${tables.length} cards`);
  for (const code of ["T1", "T2", "T3", "T4", "B1"]) {
    ok(`${code} is on the floor`, byCode.has(code));
  }

  // ── 2. HELD fires, and the time it shows is the VENUE's ───────────────────
  //
  // The held table is looked UP, not named. A leftover open visit from an
  // earlier QA run occupies whichever table it occupies, and a journey that
  // hard-coded "T1 is held" would report a fixture problem as a code problem.
  const held = tables.filter((t) => t.state === "held");
  ok("at least one table reads HELD", held.length > 0, `${held.length} held`);
  const heldTable = held.find((t) => Boolean(t.held?.holderName));
  ok("a held table names the guest it is holding for", Boolean(heldTable), heldTable?.held?.holderName ?? "none");
  if (!heldTable?.held) throw new Error("no held table with a named booking: the fixture did not seed one");

  // WHAT THIS CHECKS AND WHAT IT DOES NOT. That the same instant renders the
  // same string whatever clock the SERVER is on is proven where it can be
  // proven — in child processes, by `restaurant-screens.render.test.ts`, since
  // Node fixes the default Intl zone at startup and re-formatting inside one
  // process would measure nothing. What this step proves is that the zone
  // being applied here is the VENUE's and not UTC by accident: the QA venue is
  // in Mexico City, and its wall clock must differ from the UTC rendering of
  // the same instant.
  const heldStartsAtIso = heldTable.held.startsAtIso;
  const inVenue = venueHhmm(heldStartsAtIso, timeZone, "en");
  const inUtc = venueHhmm(heldStartsAtIso, "UTC", "en");
  ok("the venue is not on UTC, so this check can fail", timeZone !== "UTC", timeZone);
  ok(
    "the held time is rendered on the VENUE's clock",
    inVenue !== inUtc,
    `venue=${inVenue} utc=${inUtc}`,
  );

  // T3 carries tonight's LATER booking (hours out). It must read plain Free:
  // a floor that held every future booking would strand a room all evening,
  // and `held` is defined as "due any minute", not "booked at some point".
  const bookedOut = byCode.get("T3");
  ok(
    "a booking hours away does NOT hold its table",
    bookedOut?.state === "free" && bookedOut.held === null,
    bookedOut?.state ?? "?",
  );

  // ── 3. The join picker has candidates ─────────────────────────────────────
  const t2 = byCode.get("T2");
  ok("T2 offers at least one join partner", (t2?.combinableWith.length ?? 0) > 0, `${t2?.combinableWith.length ?? 0}`);

  // ── 4. A walk-in of four: refused alone, seated joined (T15 DoD) ──────────
  const partyOfFour = 4;
  const refused = await openVisit(admin, {
    tenantId: TENANT,
    spaceId: t2!.spaceId,
    actorUserId: ACTOR!,
    partySize: partyOfFour,
  });
  ok(
    "a party of four is REFUSED on a two-top",
    !refused.ok && refused.reason === "party_too_large",
    refused.ok ? "seated (wrong)" : refused.reason,
  );

  const partner = t2!.combinableWith.find((c) => partyOfFour >= c.partyMin && partyOfFour <= c.partyMax);
  ok("the floor offers a combination that fits four", Boolean(partner));
  const joined = await openVisit(admin, {
    tenantId: TENANT,
    spaceId: t2!.spaceId,
    actorUserId: ACTOR!,
    partySize: partyOfFour,
    joinedSpaceId: partner!.spaceId,
  });
  ok("the same party of four is SEATED across two joined tables", joined.ok, joined.ok ? joined.visit.id : joined.reason);
  if (joined.ok) openedVisitIds.push(joined.visit.id);
  touchedSpaceIds.add(t2!.spaceId);
  touchedSpaceIds.add(partner!.spaceId);

  ({ tables, byCode } = await floorByCode());
  const primary = tables.find((t) => t.spaceId === t2!.spaceId);
  const secondary = tables.find((t) => t.spaceId === partner!.spaceId);
  ok("both halves of the join read occupied", primary?.state === "occupied" && secondary?.state === "occupied");
  ok("the primary half names its partner", primary?.joinedWithSpaceId === partner!.spaceId);
  ok("the joined half points back", secondary?.joinedFromSpaceId === t2!.spaceId);
  ok("the seating carries the party size", primary?.partySize === partyOfFour, String(primary?.partySize));

  // ── 5. Seating a HELD table marks its booking arrived ─────────────────────
  const heldAdmissionId = heldTable.held.admissionId;
  const heldPartySize = heldTable.held.partySize;
  const seatHeld = await openVisit(admin, {
    tenantId: TENANT,
    spaceId: heldTable.spaceId,
    actorUserId: ACTOR!,
    partySize: heldPartySize,
  });
  ok("the held table can be seated", seatHeld.ok, seatHeld.ok ? seatHeld.visit.id : seatHeld.reason);
  if (seatHeld.ok) openedVisitIds.push(seatHeld.visit.id);
  touchedSpaceIds.add(heldTable.spaceId);

  const before = await admin
    .from("admissions")
    .select("admitted_count, seated_at")
    .eq("id", heldAdmissionId)
    .maybeSingle();
  ok("the booking has NOT been marked arrived by the seating alone", Number(before.data?.admitted_count) === 0);

  const marked = await markReservationSeated(admin, {
    tenantId: TENANT,
    admissionId: heldAdmissionId,
    spaceIds: [heldTable.spaceId],
    actorUserId: ACTOR,
  });
  ok("the booking is marked arrived through check_in", marked.ok, marked.ok ? `${marked.admittedCount}/${marked.partySize}` : marked.reason);
  if (marked.ok) checkedInAdmissionIds.push(marked.admissionId);

  const after = await admin
    .from("admissions")
    .select("admitted_count, seated_at")
    .eq("id", heldAdmissionId)
    .maybeSingle();
  ok(
    "read back through the real reader: the party is in",
    Number(after.data?.admitted_count) === heldPartySize && Boolean(after.data?.seated_at),
    `admitted_count=${after.data?.admitted_count} seated_at=${after.data?.seated_at ? "set" : "null"}`,
  );

  const secondTap = await markReservationSeated(admin, {
    tenantId: TENANT,
    admissionId: heldAdmissionId,
    spaceIds: [heldTable.spaceId],
    actorUserId: ACTOR,
  });
  ok(
    "a second tap is refused rather than silently admitting nobody",
    !secondTap.ok && secondTap.reason === "reservation_already_seated",
    secondTap.ok ? "admitted again (wrong)" : secondTap.reason,
  );

  const foreign = await markReservationSeated(admin, {
    tenantId: TENANT,
    admissionId: heldAdmissionId,
    spaceIds: [byCode.get("B1")!.spaceId],
    actorUserId: ACTOR,
  });
  ok(
    "a booking held for another table is refused",
    !foreign.ok && foreign.reason === "reservation_other_table",
    foreign.ok ? "admitted (wrong)" : foreign.reason,
  );

  // ── 6. Move, and the table left behind needs a reset ──────────────────────
  ({ tables, byCode } = await floorByCode());
  const destination = tables.find(
    (t) => t.state !== "occupied" && t.partyMin <= heldPartySize && t.partyMax >= heldPartySize,
  );
  ok("a free table that fits the party exists to move to", Boolean(destination), destination?.code ?? "none");
  const moved = await moveVisitToSpace(admin, {
    tenantId: TENANT,
    visitId: seatHeld.ok ? seatHeld.visit.id : "",
    spaceId: destination!.spaceId,
  });
  ok("the check moves", moved.ok, moved.ok ? `${destination!.code}` : moved.reason);
  touchedSpaceIds.add(destination!.spaceId);

  ({ tables, byCode } = await floorByCode());
  const vacated = tables.find((t) => t.spaceId === heldTable.spaceId);
  ok("the ORIGIN table reads needs-reset, not plain Free", Boolean(vacated?.needsResetSinceIso), vacated?.state ?? "?");
  const arrived = tables.find((t) => t.spaceId === destination!.spaceId);
  ok("the destination now holds the check", arrived?.state === "occupied");

  const cleared = await resetTable(admin, { tenantId: TENANT, spaceId: heldTable.spaceId });
  ok("T24 clears needs-reset", cleared.ok, cleared.ok ? "" : cleared.reason);
  ({ tables, byCode } = await floorByCode());
  ok(
    "read back: the vacated table is plain Free again",
    tables.find((t) => t.spaceId === heldTable.spaceId)?.needsResetSinceIso === null,
  );

  // ── 7. Closing a joined visit marks BOTH tables ──────────────────────────
  if (joined.ok) {
    const closed = await closeVisit(admin, { tenantId: TENANT, visitId: joined.visit.id });
    ok("the joined visit closes", closed.ok, closed.ok ? "" : closed.reason);
    ({ tables, byCode } = await floorByCode());
    const a = tables.find((t) => t.spaceId === t2!.spaceId);
    const b = tables.find((t) => t.spaceId === partner!.spaceId);
    ok(
      "BOTH halves of the join need a reset after the close",
      Boolean(a?.needsResetSinceIso) && Boolean(b?.needsResetSinceIso),
      `${a?.code}=${a?.needsResetSinceIso ? "reset" : "free"} ${b?.code}=${b?.needsResetSinceIso ? "reset" : "free"}`,
    );
  }

  // ── 8. The desk can TAKE a party and then SEAT it ────────────────────────
  //
  // These are the two functions `reservationsTakeWalkIn` calls, in its order.
  // The server action itself needs a signed-in staff session, which a script
  // does not have, so what is exercised here is the engine behind the button
  // and NOT the button. Said plainly rather than implied: nobody has clicked
  // this control.
  const venue = await loadDefaultVenue(TENANT);
  ok("the QA workspace has a default venue", Boolean(venue), venue?.name ?? "none");
  const config = venue ? await loadVenueServiceConfig(TENANT, venue.id, {}) : null;
  ok("the venue has service rules and bands to plan against", Boolean(config), `${config?.bands.length ?? 0} band(s)`);

  const plan = planWalkIn({
    rules: config!.rules,
    bands: config!.bands,
    partySize: 2,
    now: new Date(),
  });
  ok("a walk-in of two can be planned", plan.ok, plan.ok ? `${plan.plan.turnMinutes} min turn` : plan.reason);

  const walkIn = plan.ok
    ? await seatWalkIn(TENANT, {
        poolId: plan.plan.band.poolId,
        startsAt: plan.plan.startsAt,
        endsAt: plan.plan.endsAt,
        partySize: 2,
        holderName: "Journey Walk-in",
        actorUserId: null,
      })
    : null;
  ok("the walk-in lands on tonight's book", Boolean(walkIn?.ok), walkIn && !walkIn.ok ? walkIn.reason : "");
  if (walkIn?.ok) walkInAdmissionIds.push(walkIn.admissionId);

  if (walkIn?.ok) {
    const { data: row } = await admin
      .from("admissions")
      .select("holder_name, party_size, admitted_count, space_id, allocation_id")
      .eq("id", walkIn.admissionId)
      .maybeSingle();
    ok(
      "read back: a named party of two, unassigned, holding a unit of capacity",
      row?.holder_name === "Journey Walk-in" &&
        Number(row?.party_size) === 2 &&
        Number(row?.admitted_count) === 0 &&
        row?.space_id === null &&
        Boolean(row?.allocation_id),
      `party=${row?.party_size} space=${row?.space_id ?? "null"} allocation=${row?.allocation_id ? "held" : "none"}`,
    );

    ({ tables, byCode } = await floorByCode());
    const free = tables.find((t) => t.state !== "occupied" && t.partyMin <= 2 && t.partyMax >= 2);
    ok("a table exists to seat the walk-in on", Boolean(free), free?.code ?? "none");
    const opened = await openVisit(admin, {
      tenantId: TENANT,
      spaceId: free!.spaceId,
      actorUserId: ACTOR!,
      partySize: 2,
    });
    ok("the desk seats the walk-in", opened.ok, opened.ok ? opened.visit.id : opened.reason);
    if (opened.ok) openedVisitIds.push(opened.visit.id);
    touchedSpaceIds.add(free!.spaceId);

    const placed = await markReservationSeated(admin, {
      tenantId: TENANT,
      admissionId: walkIn.admissionId,
      spaceIds: [free!.spaceId],
      actorUserId: null,
    });
    ok("the walk-in is marked arrived and PLACED on that table", placed.ok, placed.ok ? "" : placed.reason);
    const { data: after2 } = await admin
      .from("admissions")
      .select("admitted_count, space_id")
      .eq("id", walkIn.admissionId)
      .maybeSingle();
    ok(
      "read back: the unassigned booking now names its table",
      Number(after2?.admitted_count) === 2 && after2?.space_id === free!.spaceId,
      `admitted=${after2?.admitted_count} space=${after2?.space_id === free!.spaceId ? free!.code : after2?.space_id}`,
    );
  }
}

async function cleanup() {
  console.log("\n  -- cleanup --");
  if (openedVisitIds.length > 0) {
    const { error: orderErr } = await admin.from("orders").delete().in("visit_id", openedVisitIds);
    if (orderErr) console.log(`  cleanup orders: ${orderErr.message}`);
    const { error: visitErr } = await admin.from("visits").delete().in("id", openedVisitIds);
    if (visitErr) console.log(`  cleanup visits: ${visitErr.message}`);
  }
  if (walkInAdmissionIds.length > 0) {
    // The allocation goes with the admission: a released row would leave a
    // committed unit of capacity nobody can see, which shrinks the room.
    const { data: rows } = await admin
      .from("admissions")
      .select("allocation_id")
      .in("id", walkInAdmissionIds);
    const { error: delErr } = await admin.from("admissions").delete().in("id", walkInAdmissionIds);
    if (delErr) console.log(`  cleanup walk-ins: ${delErr.message}`);
    const allocationIds = ((rows ?? []) as Array<{ allocation_id: string | null }>)
      .map((r) => r.allocation_id)
      .filter((id): id is string => Boolean(id));
    if (allocationIds.length > 0) {
      const { error: allocErr } = await admin.from("capacity_allocations").delete().in("id", allocationIds);
      if (allocErr) console.log(`  cleanup allocations: ${allocErr.message}`);
    }
  }
  if (checkedInAdmissionIds.length > 0) {
    const { error } = await admin
      .from("admissions")
      .update({ admitted_count: 0, seated_at: null })
      .in("id", checkedInAdmissionIds);
    if (error) console.log(`  cleanup admissions: ${error.message}`);
  }
  if (touchedSpaceIds.size > 0) {
    const { error: resetErr } = await admin
      .from("spaces")
      .update({ needs_reset_at: null })
      .eq("tenant_id", TENANT)
      .in("id", [...touchedSpaceIds]);
    if (resetErr) console.log(`  cleanup needs_reset: ${resetErr.message}`);
  }
  console.log(
    `  restored ${openedVisitIds.length} visit(s), ${checkedInAdmissionIds.length} admission(s), removed ${walkInAdmissionIds.length} walk-in(s)`,
  );
}

try {
  await main();
} catch (err) {
  failures += 1;
  console.log(`  FAIL  journey threw: ${err instanceof Error ? err.message : String(err)}`);
} finally {
  await cleanup();
}

console.log(`\n=== ${failures === 0 ? "ALL STEPS HELD" : `${failures} STEP(S) FAILED`} ===\n`);
process.exit(failures === 0 ? 0 : 1);
