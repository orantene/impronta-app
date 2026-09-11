/**
 * appointments-surface.static.test.ts — the three facts about the Appointments
 * screens that only the call site can carry.
 *
 * WHY A SOURCE SCAN. These are `"use client"` modules; a plain node test cannot
 * import them, and the shell has no runtime harness. The alternative is no
 * check at all on the one thing that cannot be seen from the library side: a
 * stale-screen guard is only a guard if the CALLER passes what it was looking
 * at. `rescheduleBooking` accepts `expectedStartsAt` as optional and documents
 * that omitting it "keeps the old last-write-wins behaviour" — so a screen that
 * forgets it type-checks, renders, and silently overwrites somebody else's
 * move. Nothing else in the build can see that.
 *
 * Each assertion below is about BEHAVIOUR, not about wording: that the value
 * passed is the ROW's own window rather than a literal or a fresh read, that
 * the promote sends the row's own status, and that the proposals banner reaches
 * the shared accept action rather than writing hours itself.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const WEB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const PAGE_MODULES = join(
  WEB_ROOT,
  "src/components/admin/shell/internal/page-modules",
);
const read = (file: string) => readFileSync(join(PAGE_MODULES, file), "utf8");
/** A library module, for the one fact that lives in the loader rather than the screen. */
const readLib = (file: string) => readFileSync(join(WEB_ROOT, "src/lib", file), "utf8");

/** Source with its prose removed, so a comment cannot satisfy a code check. */
function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      return !t.startsWith("//") && !t.startsWith("*");
    })
    .join("\n");
}

test("the reschedule sends the window the operator was looking at", () => {
  const src = codeOnly(read("AppointmentPanel.tsx"));
  assert.match(
    src,
    /expectedStartsAt:\s*row\.startsAt/,
    "the reschedule call does not pass the row's own start, so a stale screen overwrites silently",
  );
  assert.match(
    src,
    /expectedEndsAt:\s*row\.endsAt/,
    "the reschedule call does not pass the row's own end",
  );
});

test("the new start is read in the venue's zone, never the browser's", () => {
  // `new Date("2027-03-14T09:00")` reads a datetime-local value in the
  // BROWSER's zone. An operator in Madrid moving a Tulum booking would store a
  // time three hours from where anybody expects it, with nothing on screen to
  // show for it.
  const src = codeOnly(read("AppointmentPanel.tsx"));
  assert.match(src, /parseLocalDateTime\(/, "the local value is not decomposed before conversion");
  assert.match(
    src,
    /zonedLocalToUtc\(\s*parsed\.ymd,\s*parsed\.minutesOfDay,\s*row\.timeZone/,
    "the typed wall clock is not resolved in the row's own timezone",
  );
  assert.ok(
    !/new Date\(\s*move[.?]/.test(src),
    "the datetime-local value is being handed straight to new Date()",
  );
});

test("the promote sends the status the row is showing", () => {
  const src = codeOnly(read("AppointmentsWaitlist.tsx"));
  assert.match(
    src,
    /expectedStatus:\s*status as/,
    "promote does not carry the row's own status, so a stale list can promote the wrong person",
  );
  assert.match(
    src,
    /entry\.status/,
    "the status handed to promote is not read off the entry being promoted",
  );
});

test("nothing on this surface decides 'today' in the browser", () => {
  // The buckets are stamped on the server and travel with the row. A client
  // that recomputed them would render one answer on the server and another on
  // hydration, and every server-side check would still pass.
  for (const file of ["AppointmentsList.tsx", "AppointmentsPage.tsx", "AppointmentPanel.tsx", "SessionsTable.tsx"]) {
    const src = codeOnly(read(file));
    assert.ok(
      !/new Date\(\)/.test(src),
      `${file} reads the clock; the bucket must arrive with the row`,
    );
    assert.ok(
      !/bucketForStart\(/.test(src),
      `${file} recomputes a bucket the server already decided`,
    );
  }
});

test("the proposals banner accepts through the shared action, not a second writer", () => {
  const src = codeOnly(read("BookingHoursProposalsBanner.tsx"));
  assert.match(
    src,
    /acceptBookingHoursProposal\(/,
    "the banner does not use the existing accept action",
  );
  // T1-07 left exactly two writers of talent_booking_hours: the hours editor
  // and the accept RPC. A third one here would restore the defect.
  assert.ok(
    !/talent_booking_hours/.test(src),
    "the banner is reaching for the hours table itself",
  );
});

test("the banner says the public page has no hours until this is accepted", () => {
  // The gap is the point. Softening this to "finish setting up" would hide the
  // one fact an operator is on this screen to learn.
  const messages = JSON.parse(
    readFileSync(join(WEB_ROOT, "messages", "en.json"), "utf8"),
  ) as Record<string, Record<string, Record<string, Record<string, string>>>>;
  const help = messages.dashboard!.adminAppointments!.proposals!.help!;
  assert.match(
    help,
    /public booking page/i,
    "the proposals help no longer names the public booking page",
  );
  assert.match(
    help,
    /no hours/i,
    "the proposals help no longer says the public page reports no hours",
  );
});

test("a full class with an empty queue is still a card, so somebody can be added", () => {
  // The screen's half of the dead journey. The control that adds the first
  // person lives on a session card; if the card body could only render a table
  // of existing entries, an empty queue had nowhere to put it.
  const src = codeOnly(read("AppointmentsWaitlist.tsx"));
  assert.match(
    src,
    /view\.entries\.length === 0/,
    "the card has no branch for a queue nobody is on yet",
  );
  assert.match(
    src,
    /data-testid="waitlist-join-open"/,
    "the card no longer offers a way to open the add-somebody form",
  );
  assert.match(
    src,
    /joinSessionWaitlist\(/,
    "nothing on this screen calls the action that puts somebody on a queue",
  );
});

test("the seats line tells three states apart, and never reads unknown as full", () => {
  // A nullable remaining used to be rendered `(seatsRemaining ?? 0) <= 0`,
  // which prints "Full" for a read that failed. A wrongly sold-out class loses
  // the sale silently and nobody reports it.
  const src = codeOnly(read("AppointmentsWaitlist.tsx"));
  for (const kind of ["uncounted", "unreadable"]) {
    assert.match(
      src,
      new RegExp(`seats\\.kind === "${kind}"`),
      `the seats line does not tell ${kind} apart from a counted zero`,
    );
  }
  assert.match(
    src,
    /seats\.remaining <= 0/,
    "the full sentence is not decided from a count the engine actually gave",
  );
  // Scoped to the seats line itself: `?? 0` is legitimate elsewhere on this
  // screen, where it fills the {left} hole of a refusal the server already
  // decided. Inside this function it would be the defect.
  const line = /function seatsLine\([\s\S]*?\n}/.exec(src)?.[0] ?? "";
  assert.ok(line.length > 0, "seatsLine is gone; the three states have nowhere to be told apart");
  assert.ok(
    !/\?\? 0/.test(line),
    "an unreadable seat count is being defaulted to zero and rendered as full",
  );
});

test("the Sessions view offers the door to the queue on a class that is full", () => {
  // Where an operator FINDS OUT a class is full is where the way onto its
  // waitlist belongs. Without it the waitlist was a tab you had to already
  // know about.
  const table = codeOnly(read("SessionsTable.tsx"));
  assert.match(
    table,
    /onOpenWaitlist\(row\.id\)/,
    "a full session row offers no way onto its queue",
  );
  const model = codeOnly(read("appointments-classes-model.ts"));
  assert.match(
    model,
    /seatsRemaining !== null && occurrence\.seatsRemaining <= 0/,
    "the full check treats an unread seat count as full",
  );
  // ONE row renderer, so the door cannot exist on one kind of night and not
  // the other. It was written twice once, and the half without it was the
  // standalone night — the exact class whose queue could then never be
  // started. A second copy of the button is a second place for that to recur.
  const doors = table.match(/data-testid="session-open-waitlist"/g) ?? [];
  assert.equal(doors.length, 1, "the waitlist door is drawn in more than one place");
  // Series nights and one-off nights become rows through the SAME builder.
  for (const list of [/for \(const s of input\.series\)/, /for \(const n of input\.nights\)/]) {
    assert.match(model, list, `a list of occurrences is missing: ${list}`);
  }
  const pushes = model.match(/\bpush\((o|n), \{/g) ?? [];
  assert.equal(pushes.length, 2, "series nights and one-off nights are not both drawn as rows");
});

test("a night that belongs to no series is still on the schedule", () => {
  // `loadSchedule` returned `{ series: [] }` the moment a workspace had no
  // `session_series` rows, and grouped every occurrence UNDER a series. A
  // night created by "Schedule a night" on this very page has `series_id =
  // NULL`, so the operator was told it was created and then shown "No series
  // yet" over a class that exists, has seats and is on sale.
  const loader = codeOnly(readLib("sessions/schedule-actions.ts"));
  assert.ok(
    !/rows\.length === 0\) return \{ ok: true, series: \[\] \}/.test(loader),
    "the loader still short-circuits before it reads any session",
  );
  assert.match(loader, /nights: ScheduleNight\[\]/, "the loader returns no one-off nights");
  assert.match(
    loader,
    /\.filter\(\(s\) => !s\.series_id\)/,
    "nothing selects the sessions that no series claims",
  );

  // The table's empty state is decided from the rows, and the rows include
  // the one-off nights, so a schedule of nights alone is never "empty".
  const table = codeOnly(read("SessionsTable.tsx"));
  assert.match(
    table,
    /rows\.length === 0 \? t\("dashboard\.adminSessions\.empty\.body"\)/,
    "the empty state is not decided from the rows the nights are part of",
  );
  const model = codeOnly(read("appointments-classes-model.ts"));
  assert.match(model, /for \(const n of input\.nights\)/, "the one-off nights are not turned into rows");
});

test("the empty state does not promise a door that is somewhere else", () => {
  // The old copy told the operator this screen was where they put the next
  // person when a class filled up, while the screen it described could not do
  // that at all. It now describes what actually happens.
  const messages = JSON.parse(
    readFileSync(join(WEB_ROOT, "messages", "en.json"), "utf8"),
  ) as Record<string, Record<string, Record<string, Record<string, Record<string, string>>>>>;
  const body = messages.dashboard!.adminAppointments!.waitlist!.empty!.body!;
  assert.match(body, /sells out/i, "the empty state no longer says what brings a class here");
  assert.ok(
    !/put the next person on its list here/i.test(body),
    "the empty state still claims the list is started from this empty screen",
  );
});

/* ── D-106: the board can say what state a booking is in ───────────────────── */

test("every row says the booking's own state, not only its next action", () => {
  const src = codeOnly(read("AppointmentsList.tsx"));
  assert.match(
    src,
    /\{t\(`\$\{K\}\.col\.state`\)\}/,
    "the state column heading was translated in three languages and rendered nowhere",
  );
  assert.match(
    src,
    /t\(`\$\{K\}\.state\.\$\{bookingStateKey\(row\.status\)\}`\)/,
    "the row must render the mapped state, so tentative and confirmed are told apart",
  );
  assert.match(
    src,
    /import \{[\s\S]*?bookingStateKey[\s\S]*?\} from "@\/lib\/scheduling\/appointments-board"/,
    "the mapping must come from the board module, not a second table in the component",
  );
});

test("every booking state has an operator sentence in all three languages", () => {
  const statuses = [
    "draft",
    "tentative",
    "confirmed",
    "in_progress",
    "completed",
    "cancelled",
    "archived",
    "unknown",
  ];
  for (const locale of ["en", "es", "fr"] as const) {
    const json = JSON.parse(
      readFileSync(join(WEB_ROOT, "messages", `${locale}.json`), "utf8"),
    ) as Record<string, Record<string, Record<string, Record<string, string>>>>;
    const rows = json.dashboard!.adminAppointments!.state!;
    for (const status of statuses) {
      assert.equal(typeof rows[status], "string", `${locale} has no sentence for "${status}"`);
      assert.ok(!rows[status]!.includes("—"), `${locale}.state.${status} uses an em dash`);
    }
  }
});

/* ── D-107: a move that worked says so, and says WHICH answer it was ───────── */

test("a successful reschedule renders its confirmation instead of closing silently", () => {
  const src = codeOnly(read("AppointmentPanel.tsx"));
  assert.match(
    src,
    /t\(`\$\{K\}\.reschedule\.already`\)/,
    "the idempotent answer was authored and rendered nowhere, so it looked like a real move",
  );
  assert.match(
    src,
    /t\(`\$\{K\}\.reschedule\.moved`\)/,
    "a completed move must say where it went",
  );
  assert.doesNotMatch(
    src,
    /setMove\(null\);\s*\n\s*onChanged\(\);/,
    "closing the panel on success is what made a move and a no-op look identical",
  );
  const success = src.slice(src.indexOf("result.already"));
  assert.ok(
    success.indexOf("reschedule.already") < success.indexOf("reschedule.moved"),
    "the two answers must be chosen by result.already, not merged into one sentence",
  );
});

/* ── D-105: the seat is taken from the screen that takes it ────────────────── */

test("accepting a place goes through the action that reserves the seat", () => {
  const src = codeOnly(read("AppointmentsWaitlist.tsx"));
  assert.match(
    src,
    /await acceptWaitlistPlace\(\{/,
    "the screen must accept through the action that reserves and commits the allocation",
  );
  assert.doesNotMatch(
    src,
    /status:\s*"accepted"/,
    "no surface may write the word 'accepted' itself: the table refuses it without a seat",
  );
  assert.match(
    src,
    /await releaseWaitlistPlace\(\{[\s\S]{0,200}?holding,/,
    "giving a place back must say whether a seat or only an offer is being released",
  );
  assert.match(
    src,
    /holding === "seat" \? "accepted" : "offered"/,
    "the stale-screen guard must send the status the row was showing",
  );
});

test("an order's money shell is not filed under 'No date agreed yet'", () => {
  // `booking_transactions` refuses a row with no booking, so every counter
  // sale and every menu pizza writes an undated `agency_bookings` row with an
  // order and no inquiry. Read as appointments, sixty "POS sale" rows buried
  // the one request whose date really was still open. The undated read must
  // keep the rows that came from a conversation or were opened by hand, and
  // drop the ones that exist only because money moved.
  const loader = codeOnly(readLib("scheduling/appointments-actions.ts"));
  const undated = loader.indexOf('.is("starts_at", null)');
  assert.ok(undated >= 0, "the board no longer reads the undated bookings at all");
  const clause = loader.slice(undated, loader.indexOf(".limit(", undated));
  assert.match(
    clause,
    /\.or\("order_id\.is\.null,source_inquiry_id\.not\.is\.null"\)/,
    "the undated read still lists every order's money shell as an appointment",
  );
});

test("a refresh that was overtaken does not paint over the one that overtook it", () => {
  // Every write on the waitlist card refreshes the page, and a refresh reads
  // the seats of every upcoming class, so two writes in a row are two reads
  // in flight. Seen in a browser: "they took it" said "Beto has the place"
  // while the row went back to "Offered", because the promote's slower read
  // landed after the accept's. The page must number its refreshes and drop
  // any answer that is not the latest one asked for.
  const src = codeOnly(read("AppointmentsPage.tsx"));
  const issued = src.indexOf("refreshTicket.current = ticket");
  const awaited = src.indexOf("await Promise.all([");
  const guard = src.indexOf("if (refreshTicket.current !== ticket) return;", awaited);
  assert.ok(issued >= 0, "the refresh does not take a ticket");
  assert.ok(issued < awaited && awaited < guard, "the ticket is not checked after the reads return");
  const firstPaint = src.indexOf("setRows(", awaited);
  assert.ok(guard < firstPaint, "state is painted before the ticket is checked");
});

test("the proposals banner offers no accept for a person who sets their own hours", () => {
  // `hours-edit-policy` refuses a staff write for a claimed person. The banner
  // offered "Accept these hours" to everyone and let the click discover the
  // refusal. The loader now says who is self-managed, from the same policy
  // function the refusal uses, and the banner says so instead of a button.
  const loader = codeOnly(readLib("scheduling/appointments-actions.ts"));
  assert.match(loader, /staffMayWriteHours\(\{/, "the loader does not consult the hours-edit policy");
  assert.match(loader, /selfManaged:/, "the proposal row carries no self-managed flag");
  const banner = codeOnly(read("BookingHoursProposalsBanner.tsx"));
  const branch = banner.indexOf("row.selfManaged ?");
  const sentence = banner.indexOf('data-testid="booking-hours-proposal-self-managed"', branch);
  const button = banner.indexOf('data-testid="booking-hours-proposal-accept"', branch);
  assert.ok(branch >= 0, "the banner does not branch on selfManaged");
  assert.ok(sentence > branch && button > sentence, "the self-managed sentence must replace the button, not sit beside it");
});
